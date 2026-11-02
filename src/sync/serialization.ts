import type { BookDto, ReviewDto, SessionDto } from '../api/types';
import type { BookRecord, QuoteRecord, ReviewRecord, SessionRecord } from '../db/schema';
import { GENRES } from '../domain/pageRules';
import { validateBook } from '../domain/bookRules';

// API 클라이언트의 공개 타입이 아직 없는 두 계약은 API.md 그대로 정의한다.
export interface QuoteDto {
    id: string; bookId: string; text: string; page?: number | null; memo?: string | null;
    deleted: boolean; createdAt: string; updatedAt: string;
}
export interface SyncSnapshot { books: BookDto[]; sessions: SessionDto[]; reviews: ReviewDto[]; quotes: QuoteDto[] }
const iso = (value: number) => new Date(value).toISOString();
function timestamp(value: string): number {
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
    return {
        books: snapshot.books.map((row): BookRecord => {
            validateBook(row);
            return { ...row, ...local(row), isbn: row.isbn ?? null, publisher: row.publisher ?? null,
                coverUrl: row.coverUrl ?? null, genre: GENRES.find(genre => genre === row.genre) ?? '기타',
                completedAt: row.completedAt == null ? null : timestamp(row.completedAt), updatedAt: timestamp(row.updatedAt) };
        }),
        sessions: snapshot.sessions.map((row): SessionRecord => ({ ...row, ...local(row),
            startedAt: timestamp(row.startedAt), endedAt: timestamp(row.endedAt), endPage: row.endPage ?? null })),
        reviews: snapshot.reviews.map((row): ReviewRecord => ({ ...row, ...local(row),
            oneLine: row.oneLine ?? null, body: row.body ?? null, publishedAt: null, updatedAt: timestamp(row.updatedAt) })),
        quotes: snapshot.quotes.map((row): QuoteRecord => ({ ...row, ...local(row),
            page: row.page ?? null, memo: row.memo ?? null, updatedAt: timestamp(row.updatedAt) })),
    };
}
