import { normalizeIsbn } from './bookAddRules';
import { normalizeGenre, type Genre } from './pageRules';

/** NFR-06: 한 번 실행할 때 다시 조회하는 최대 권수. 서버와 YES24 요청이 몰리지 않게 제한한다. */
export const COVER_REFRESH_BATCH = 20;

type CoverFields = { coverUrl: string | null; sideCoverUrl: string | null; yes24ProductUrl: string | null };
type InfoFields = { title: string; author: string; publisher: string | null; totalPages: number; genre: Genre };
type RefreshableBook = CoverFields & { id: string; isbn: string | null; deleted: boolean; catalogPending: boolean };
type FillableBook = RefreshableBook & InfoFields;
type CatalogResult = {
    isbn: string; title?: string | null; author?: string | null; publisher?: string | null;
    totalPages?: number | null; genre?: string | null;
    coverUrl?: string | null; sideCoverUrl?: string | null; yes24ProductUrl?: string | null;
};
export type CatalogFillChanges = Partial<CoverFields & InfoFields & { catalogPending: boolean }>;

/**
 * FR-01 / S-30: ISBN이 있고 삭제되지 않은 책 중, 조회 대기(오프라인 직접 입력)이거나 표지·책등이 빈 책을
 * 이번 실행에서 아직 시도하지 않은 것만 고른다.
 */
export function booksNeedingCatalog<T extends RefreshableBook>(books: readonly T[], attempted: ReadonlySet<string>, limit = COVER_REFRESH_BATCH): T[] {
    return books.filter(book => !book.deleted && !!book.isbn && normalizeIsbn(book.isbn) !== null
        && (book.catalogPending || !book.coverUrl || !book.sideCoverUrl) && !attempted.has(book.id)).slice(0, limit);
}

const text = (value: string | null | undefined, max: number) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length <= max ? trimmed : null;
};

/**
 * FR-01 / NFR-06: 같은 ISBN의 조회 결과로 책을 채운다.
 * - 표지·책등·상품 링크는 비어 있는 칸만 채운다.
 * - 조회 대기 책은 제목·저자·출판사·전체 쪽수·장르를 조회 결과로 덮어쓰고 조회 대기를 해제한다.
 *   조회 결과가 비어 있는 항목은 그대로 두고, 전체 쪽수는 minTotalPages(읽은 쪽·기록의 쪽) 이상일 때만 바꾼다.
 * 바꿀 칸이 없으면 null, 책 정보(표지 제외)를 바꿨으면 infoUpdated가 true다.
 */
export function fillFromCatalog(book: FillableBook, result: CatalogResult, minTotalPages = 0): { changes: CatalogFillChanges; infoUpdated: boolean } | null {
    const isbn = book.isbn ? normalizeIsbn(book.isbn) : null;
    if (isbn === null || isbn !== normalizeIsbn(result.isbn)) return null;
    const changes: CatalogFillChanges = {};
    if (!book.coverUrl && result.coverUrl) changes.coverUrl = result.coverUrl;
    if (!book.sideCoverUrl && result.sideCoverUrl) changes.sideCoverUrl = result.sideCoverUrl;
    if (!book.yes24ProductUrl && result.yes24ProductUrl) changes.yes24ProductUrl = result.yes24ProductUrl;
    let infoUpdated = false;
    if (book.catalogPending) {
        const title = text(result.title, 200);
        if (title && title !== book.title) { changes.title = title; infoUpdated = true; }
        const author = text(result.author, 100);
        if (author && author !== book.author) { changes.author = author; infoUpdated = true; }
        const publisher = text(result.publisher, 100);
        if (publisher && publisher !== book.publisher) { changes.publisher = publisher; infoUpdated = true; }
        const pages = result.totalPages;
        if (typeof pages === 'number' && Number.isSafeInteger(pages) && pages >= 1 && pages >= minTotalPages && pages !== book.totalPages) {
            changes.totalPages = pages; infoUpdated = true;
        }
        const genre = normalizeGenre(result.genre);
        if (genre && genre !== book.genre) { changes.genre = genre; infoUpdated = true; }
        changes.catalogPending = false;
    }
    return Object.keys(changes).length > 0 ? { changes, infoUpdated } : null;
}
