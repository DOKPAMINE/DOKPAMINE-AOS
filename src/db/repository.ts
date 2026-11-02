import { eq } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { parseEndPage } from '../domain/pageRules';
import * as schema from './schema';
import type { BookRecord, QuoteRecord, ReviewRecord, SessionRecord } from './schema';

type LocalRecord = Pick<BookRecord, 'id' | 'createdAt' | 'syncPending' | 'localVersion' | 'deleted'>;
export type SaveInput<T extends LocalRecord> = Omit<T, keyof Omit<LocalRecord, 'id'> | 'updatedAt'>;
export interface ListOptions { readonly bookId?: string; readonly includeDeleted?: boolean }
export interface EntityRepository<T extends LocalRecord> {
    save(input: SaveInput<T>): T;
    get(id: string, includeDeleted?: boolean): T | null;
    list(options?: ListOptions): T[];
    softDelete(id: string): T | null;
}
interface Adapter<T> {
    get(id: string): T | undefined;
    all(): T[];
    put(row: T): void;
}
export type RecordDatabase = ExpoSQLiteDatabase<typeof schema>;

/** NFR-04~06: 모든 변경은 동기 트랜잭션 안에서 기존 행을 읽고 같은 ID로 저장한다. */
export function createRecordRepository(db: RecordDatabase, now: () => number = Date.now) {
    function entity<T extends LocalRecord>(
        adapter: Adapter<T>, updatedAt: boolean,
        validate: (input: SaveInput<T>, existing: T | undefined) => void = () => {},
    ): EntityRepository<T> {
        const markChanged = (input: SaveInput<T> | T, existing: T | undefined, deleted: boolean): T => {
            const timestamp = now();
            const localVersion = Math.max(timestamp, existing ? existing.localVersion + 1 : timestamp);
            if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(localVersion)) {
                throw new Error('기록 버전을 저장할 수 없어요.');
            }
            return {
                ...input, createdAt: existing?.createdAt ?? timestamp, syncPending: true,
                localVersion, deleted, ...(updatedAt ? { updatedAt: timestamp } : {}),
            } as T;
        };
        return {
            save(input) {
                return db.transaction(() => {
                    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) {
                        throw new Error('기록 ID는 클라이언트 UUID여야 해요.');
                    }
                    const existing = adapter.get(input.id);
                    if (existing?.deleted) throw new Error('삭제한 기록은 다시 저장할 수 없어요.');
                    validate(input, existing);
                    const row = markChanged(input, existing, false);
                    adapter.put(row);
                    return adapter.get(input.id)!;
                });
            },
            get(id, includeDeleted = false) {
                const row = adapter.get(id);
                return row && (includeDeleted || !row.deleted) ? row : null;
            },
            list({ bookId, includeDeleted = false } = {}) {
                return adapter.all().filter(row => (includeDeleted || !row.deleted) &&
                    (bookId === undefined || ('bookId' in row && row.bookId === bookId)));
            },
            softDelete(id) {
                return db.transaction(() => {
                    const existing = adapter.get(id);
                    if (!existing) return null;
                    const row = markChanged(existing, existing, true);
                    adapter.put(row);
                    return adapter.get(id)!;
                });
            },
        };
    }
    function parent(input: { bookId: string }, existing?: { bookId: string }) {
        if (existing && input.bookId !== existing.bookId) throw new Error('기록의 책은 바꿀 수 없어요.');
        const book = db.select().from(schema.books).where(eq(schema.books.id, input.bookId)).get();
        if (!book || book.deleted) throw new Error('책을 찾을 수 없어요.');
        return book;
    }
    const books = entity<BookRecord>({
        get: id => db.select().from(schema.books).where(eq(schema.books.id, id)).get(),
        all: () => db.select().from(schema.books).all(),
        put: row => { db.insert(schema.books).values(row).onConflictDoUpdate({ target: schema.books.id, set: row }).run(); },
    }, true);
    const sessions = entity<SessionRecord>({
        get: id => db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get(),
        all: () => db.select().from(schema.sessions).all(),
        put: row => { db.insert(schema.sessions).values(row).onConflictDoUpdate({ target: schema.sessions.id, set: row }).run(); },
    }, false, (input, existing) => {
        const book = parent(input, existing);
        const end = parseEndPage(input.endPage === null ? '' : String(input.endPage), input.startPage, book.totalPages);
        if (end.kind === 'invalid') throw new Error(end.message);
        if (!Number.isSafeInteger(input.startPage) || input.startPage < 0 || input.startPage > book.totalPages) {
            throw new Error('시작 페이지를 확인해 주세요.');
        }
    });
    const reviews = entity<ReviewRecord>({
        get: id => db.select().from(schema.reviews).where(eq(schema.reviews.id, id)).get(),
        all: () => db.select().from(schema.reviews).all(),
        put: row => { db.insert(schema.reviews).values(row).onConflictDoUpdate({ target: schema.reviews.id, set: row }).run(); },
    }, true, (input, existing) => { parent(input, existing); });
    const quotes = entity<QuoteRecord>({
        get: id => db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).get(),
        all: () => db.select().from(schema.quotes).all(),
        put: row => { db.insert(schema.quotes).values(row).onConflictDoUpdate({ target: schema.quotes.id, set: row }).run(); },
    }, true, (input, existing) => { parent(input, existing); });
    return { books, sessions, reviews, quotes };
}

export type RecordRepository = ReturnType<typeof createRecordRepository>;
