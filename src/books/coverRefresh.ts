import { isOnline } from '../api/connectivity';
import { catalogIsbn } from '../api/endpoints';
import type { CatalogBook } from '../api/types';
import type { RecordRepository } from '../db/repository';
import { normalizeIsbn } from '../domain/bookAddRules';
import { booksNeedingCatalog, fillFromCatalog } from '../domain/coverRefreshRules';

export type CatalogRefreshResult = { filled: number; updatedTitles: string[] };

// 앱이 켜져 있는 동안 이미 시도한 책은 다시 조회하지 않는다(조회 실패·결과 없음 포함).
const attempted = new Set<string>();
let running: Promise<CatalogRefreshResult> | null = null;

/**
 * FR-01 / NFR-06 / S-30: 온라인이면 ISBN으로 다시 조회해 빈 표지·책등·상품 링크를 채우고,
 * 오프라인에서 직접 입력한 조회 대기 책은 책 정보도 조회 결과로 바꾼다.
 * 바뀐 책은 동기화 대기로 저장되어 서버에 전송된다. 오류로 끝나지 않는다.
 */
export function refreshFromCatalog(
    repository: RecordRepository,
    lookup: (isbn: string) => Promise<CatalogBook> = catalogIsbn,
    online: () => Promise<boolean> = isOnline,
): Promise<CatalogRefreshResult> {
    running ??= run(repository, lookup, online).finally(() => { running = null; });
    return running;
}

async function run(repository: RecordRepository, lookup: (isbn: string) => Promise<CatalogBook>, online: () => Promise<boolean>) {
    const result: CatalogRefreshResult = { filled: 0, updatedTitles: [] };
    try {
        if (!await online()) return result;
        for (const book of booksNeedingCatalog(repository.books.list(), attempted)) {
            attempted.add(book.id);
            try {
                const found = await lookup(normalizeIsbn(book.isbn ?? '') ?? book.isbn ?? '');
                const latest = repository.books.get(book.id);
                if (!latest) continue;
                // D7: 전체 쪽수는 읽은 쪽과 기존 독서 기록의 쪽보다 작아지지 않게 한다.
                const minPages = repository.sessions.list({ bookId: book.id })
                    .reduce((max, session) => Math.max(max, session.startPage, session.endPage ?? 0), latest.currentPage);
                const fill = fillFromCatalog(latest, found, minPages);
                if (!fill) continue;
                repository.books.save({ ...latest, ...fill.changes });
                result.filled++;
                if (fill.infoUpdated) result.updatedTitles.push(fill.changes.title ?? latest.title);
            } catch {
                // 조회 실패나 결과 없음은 다음에 앱을 다시 켰을 때 시도한다(조회 대기는 그대로 남는다).
            }
        }
    } catch {
        // 저장소를 읽지 못하면 이번 실행은 건너뛴다.
    }
    return result;
}

/** 테스트에서 실행 기록을 비운다. */
export function resetCatalogRefresh() {
    attempted.clear();
    running = null;
}
