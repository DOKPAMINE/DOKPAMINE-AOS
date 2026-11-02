import type { BookDto, QuoteDto, ReviewDto, SessionDto, SyncSnapshot } from '../api/types';
import type { BookRecord, QuoteRecord, ReviewRecord, SessionRecord } from '../db/schema';
import { GENRES } from '../domain/pageRules';
import { validateBook } from '../domain/bookRules';

const iso = (value: number) => new Date(value).toISOString();
function timestamp(value: string): number {
    if (typeof value !== 'string') throw new Error('기록의 시각을 확인할 수 없어요.');
    const time = Date.parse(value);
    if (!Number.isSafeInteger(time)) throw new Error('기록의 시각을 확인할 수 없어요.');
    return time;
}
const local = (row: { createdAt: string; deleted: boolean }) => ({
    createdAt: timestamp(row.createdAt), deleted: row.deleted, syncPending: false, localVersion: 0,
});

export function bookDto(row: BookRecord): BookDto {
    const { syncPending, localVersion, ...record } = row;
    return { ...record, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), completedAt: row.completedAt === null ? null : iso(row.completedAt) };
}
export function sessionDto(row: SessionRecord): SessionDto {
    const { syncPending, localVersion, ...record } = row;
    return { ...record, createdAt: iso(row.createdAt), startedAt: iso(row.startedAt), endedAt: iso(row.endedAt) };
}
export function reviewDto(row: ReviewRecord): ReviewDto {
    const { syncPending, localVersion, publishedAt, ...record } = row;
    return { ...record, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
export function quoteDto(row: QuoteRecord): QuoteDto {
    const { syncPending, localVersion, ...record } = row;
    return { ...record, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

/** NFR-04·05 / S-02: 전체 snapshot을 변환한 뒤 하나의 DB 트랜잭션으로 복원한다. */
export function snapshotRecords(snapshot: SyncSnapshot) {
    let skippedCount = 0;
    const totalPages = new Map<string, number>();
    const valid = (condition: boolean) => { if (!condition) throw new Error('서버 기록을 확인할 수 없어요.'); };
    const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
    const uuid = (value: string) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const text = (value: string | null | undefined, max: number) => value == null || (typeof value === 'string' && value.length <= max);
    function convert<T extends { id: string; deleted: boolean }, R>(rows: T[], read: (row: T) => R): R[] {
        return rows.flatMap(row => {
            try {
                valid(uuid(row.id) && typeof row.deleted === 'boolean');
                return [read(row)];
            } catch { skippedCount++; return []; }
        });
    }
    return {
        books: convert(snapshot.books, (row): BookRecord => {
            validateBook(row);
            valid(['WANT', 'READING', 'DONE'].includes(row.status) && integer(row.completedCount) &&
                typeof row.genre === 'string' && text(row.isbn, Infinity) && text(row.publisher, Infinity) && text(row.coverUrl, Infinity));
            const createdAt = local(row), updatedAt = timestamp(row.updatedAt);
            const completedAt = row.completedAt == null ? null : timestamp(row.completedAt);
            totalPages.set(row.id, row.totalPages);
            return { ...row, ...createdAt, isbn: row.isbn ?? null, publisher: row.publisher ?? null,
                coverUrl: row.coverUrl ?? null, genre: GENRES.find(genre => genre === row.genre) ?? '기타',
                completedAt, updatedAt };
        }),
        sessions: convert(snapshot.sessions, (row): SessionRecord => {
            valid(uuid(row.bookId) && integer(row.activeSeconds) && integer(row.startPage) &&
                (row.endPage == null || integer(row.endPage)) && ['TIMER', 'MANUAL'].includes(row.source));
            const pages = totalPages.get(row.bookId);
            valid(pages === undefined || (row.startPage <= pages && (row.endPage == null || row.endPage <= pages)));
            const startedAt = timestamp(row.startedAt), endedAt = timestamp(row.endedAt);
            valid(endedAt >= startedAt);
            return { ...row, ...local(row), startedAt, endedAt, endPage: row.endPage ?? null };
        }),
        reviews: convert(snapshot.reviews, (row): ReviewRecord => {
            valid(uuid(row.bookId) && text(row.oneLine, 100) && text(row.body, 5000) &&
                !!(row.oneLine?.trim() || row.body?.trim()) && ['PRIVATE', 'PUBLIC'].includes(row.visibility));
            return { ...row, ...local(row), oneLine: row.oneLine ?? null, body: row.body ?? null,
                publishedAt: null, updatedAt: timestamp(row.updatedAt) };
        }),
        quotes: convert(snapshot.quotes, (row): QuoteRecord => {
            valid(uuid(row.bookId) && typeof row.text === 'string' && row.text.length >= 1 && row.text.length <= 1000 &&
                text(row.memo, 500) && (row.page == null || integer(row.page)));
            return { ...row, ...local(row), page: row.page ?? null, memo: row.memo ?? null, updatedAt: timestamp(row.updatedAt) };
        }),
        skippedCount,
    };
}
