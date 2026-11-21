import { normalizeIsbn } from './bookAddRules';

/** NFR-06: 한 번 실행할 때 다시 조회하는 최대 권수. 서버와 YES24 요청이 몰리지 않게 제한한다. */
export const COVER_REFRESH_BATCH = 20;

type CoverFields = { coverUrl: string | null; sideCoverUrl: string | null; yes24ProductUrl: string | null };
type RefreshableBook = CoverFields & { id: string; isbn: string | null; deleted: boolean };
type CoverLookupResult = { isbn: string; coverUrl?: string | null; sideCoverUrl?: string | null; yes24ProductUrl?: string | null };

/** FR-01 / S-30: ISBN이 있고 표지나 책등이 빈, 삭제되지 않은 책 중 이번 실행에서 아직 시도하지 않은 책을 고른다. */
export function booksNeedingCovers<T extends RefreshableBook>(books: readonly T[], attempted: ReadonlySet<string>, limit = COVER_REFRESH_BATCH): T[] {
    return books.filter(book => !book.deleted && !!book.isbn && normalizeIsbn(book.isbn) !== null
        && (!book.coverUrl || !book.sideCoverUrl) && !attempted.has(book.id)).slice(0, limit);
}

/** FR-01 / S-30: 같은 ISBN의 조회 결과일 때 비어 있는 칸만 채운다. 바꿀 칸이 없으면 null을 돌려준다. */
export function fillMissingCovers(book: RefreshableBook, result: CoverLookupResult): Partial<CoverFields> | null {
    const isbn = book.isbn ? normalizeIsbn(book.isbn) : null;
    if (isbn === null || isbn !== normalizeIsbn(result.isbn)) return null;
    const changes: Partial<CoverFields> = {};
    if (!book.coverUrl && result.coverUrl) changes.coverUrl = result.coverUrl;
    if (!book.sideCoverUrl && result.sideCoverUrl) changes.sideCoverUrl = result.sideCoverUrl;
    if (!book.yes24ProductUrl && result.yes24ProductUrl) changes.yes24ProductUrl = result.yes24ProductUrl;
    return Object.keys(changes).length > 0 ? changes : null;
}
