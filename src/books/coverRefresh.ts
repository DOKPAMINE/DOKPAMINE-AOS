import { isOnline } from '../api/connectivity';
import { catalogIsbn } from '../api/endpoints';
import type { CatalogBook } from '../api/types';
import type { RecordRepository } from '../db/repository';
import { normalizeIsbn } from '../domain/bookAddRules';
import { booksNeedingCovers, fillMissingCovers } from '../domain/coverRefreshRules';

// 앱이 켜져 있는 동안 이미 시도한 책은 다시 조회하지 않는다(조회 실패·결과 없음 포함).
const attempted = new Set<string>();
let running: Promise<number> | null = null;

/**
 * FR-01 / NFR-06 / S-30: 온라인이면 ISBN으로 다시 조회해 비어 있는 표지·책등·상품 링크만 채운다.
 * 채운 책은 동기화 대기로 저장되어 서버에 전송된다. 채운 책 수를 돌려주고 오류로 끝나지 않는다.
 */
export function refreshMissingCovers(
    repository: RecordRepository,
    lookup: (isbn: string) => Promise<CatalogBook> = catalogIsbn,
    online: () => Promise<boolean> = isOnline,
): Promise<number> {
    running ??= run(repository, lookup, online).finally(() => { running = null; });
    return running;
}

async function run(repository: RecordRepository, lookup: (isbn: string) => Promise<CatalogBook>, online: () => Promise<boolean>) {
    let filled = 0;
    try {
        if (!await online()) return 0;
        for (const book of booksNeedingCovers(repository.books.list(), attempted)) {
            attempted.add(book.id);
            try {
                const result = await lookup(normalizeIsbn(book.isbn ?? '') ?? book.isbn ?? '');
                const latest = repository.books.get(book.id);
                if (!latest) continue;
                const changes = fillMissingCovers(latest, result);
                if (!changes) continue;
                repository.books.save({ ...latest, ...changes });
                filled++;
            } catch {
                // 조회 실패나 결과 없음은 다음에 앱을 다시 켰을 때 시도한다.
            }
        }
    } catch {
        // 저장소를 읽지 못하면 이번 실행은 건너뛴다.
    }
    return filled;
}

/** 테스트에서 실행 기록을 비운다. */
export function resetCoverRefresh() {
    attempted.clear();
    running = null;
}
