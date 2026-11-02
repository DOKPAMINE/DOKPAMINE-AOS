import { and, eq } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { parseEndPage } from '../domain/pageRules';
import { validateBook } from '../domain/bookRules';
import { nextRecordVersion } from '../domain/recordVersion';
import * as schema from './schema';
import type { BookRecord, QuoteRecord, ReviewRecord, SessionRecord } from './schema';

type LocalRecord = Pick<BookRecord, 'id' | 'createdAt' | 'syncPending' | 'localVersion' | 'deleted'>;
export type SaveInput<T extends LocalRecord> = Omit<T, keyof Omit<LocalRecord, 'id'> | 'updatedAt'>;
export interface ListOptions { readonly bookId?: string; readonly includeDeleted?: boolean; readonly syncPending?: boolean }
export interface EntityRepository<T extends LocalRecord> {
    save(input: SaveInput<T>): T;
    get(id: string, includeDeleted?: boolean): T | null;
    list(options?: ListOptions): T[];
    softDelete(id: string): T | null;
    markSynced(id: string, sentVersion: number): void;
}
interface Adapter<T> {
    get(id: string): T | undefined;
    list(options: ListOptions): T[];
    put(row: T): void;
    markSynced(id: string, sentVersion: number): void;
}
export type RecordDatabase = ExpoSQLiteDatabase<typeof schema>;

/** NFR-04~06: 모든 변경은 동기 트랜잭션 안에서 기존 행을 읽고 같은 ID로 저장한다. */
export function createRecordRepository(db: RecordDatabase, now: () => number = Date.now) {
    const listeners = new Set<() => void>();
    let transactionDepth = 0;
    const notify = () => { if (transactionDepth === 0) listeners.forEach(listener => listener()); };
    function transaction<T>(work: () => T): T {
        if (transactionDepth > 0) return work();
        return db.transaction(() => {
            transactionDepth++;
            try { return work(); } finally { transactionDepth--; }
        });
    }
    function entity<T extends LocalRecord>(
        adapter: Adapter<T>, updatedAt: boolean,
        validate: (input: SaveInput<T>, existing: T | undefined) => void = () => {},
    ): EntityRepository<T> {
        const markChanged = (input: SaveInput<T> | T, existing: T | undefined, deleted: boolean): T => {
            const timestamp = now();
            const localVersion = nextRecordVersion(timestamp, existing?.localVersion);
            return {
                ...input, createdAt: existing?.createdAt ?? timestamp, syncPending: true,
                localVersion, deleted, ...(updatedAt ? { updatedAt: timestamp } : {}),
            } as T;
        };
        return {
            save(input) {
                const result = transaction(() => {
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
                notify();
                return result;
            },
            get(id, includeDeleted = false) {
                const row = adapter.get(id);
                return row && (includeDeleted || !row.deleted) ? row : null;
            },
            list: (options = {}) => adapter.list(options),
            markSynced: (id, version) => adapter.markSynced(id, version),
            softDelete(id) {
                const result = transaction(() => {
                    const existing = adapter.get(id);
                    if (!existing || existing.deleted) return existing ?? null;
                    const row = markChanged(existing, existing, true);
                    adapter.put(row);
                    return adapter.get(id)!;
                });
                notify();
                return result;
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
        list: ({ includeDeleted, syncPending, bookId }) => bookId === undefined ? db.select().from(schema.books).where(and(
            includeDeleted ? undefined : eq(schema.books.deleted, false),
            syncPending === undefined ? undefined : eq(schema.books.syncPending, syncPending),
        )).all() : [],
        markSynced: (id, version) => { db.update(schema.books).set({ syncPending: false }).where(and(eq(schema.books.id, id), eq(schema.books.localVersion, version))).run(); },
        put: row => { db.insert(schema.books).values(row).onConflictDoUpdate({ target: schema.books.id, set: row }).run(); },
    }, true, input => validateBook(input));
    const sessions = entity<SessionRecord>({
        get: id => db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get(),
        list: ({ includeDeleted, syncPending, bookId }) => db.select().from(schema.sessions).where(and(
            includeDeleted ? undefined : eq(schema.sessions.deleted, false),
            bookId === undefined ? undefined : eq(schema.sessions.bookId, bookId),
            syncPending === undefined ? undefined : eq(schema.sessions.syncPending, syncPending),
        )).all(),
        markSynced: (id, version) => { db.update(schema.sessions).set({ syncPending: false }).where(and(eq(schema.sessions.id, id), eq(schema.sessions.localVersion, version))).run(); },
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
        list: ({ includeDeleted, syncPending, bookId }) => db.select().from(schema.reviews).where(and(
            includeDeleted ? undefined : eq(schema.reviews.deleted, false),
            bookId === undefined ? undefined : eq(schema.reviews.bookId, bookId),
            syncPending === undefined ? undefined : eq(schema.reviews.syncPending, syncPending),
        )).all(),
        markSynced: (id, version) => { db.update(schema.reviews).set({ syncPending: false }).where(and(eq(schema.reviews.id, id), eq(schema.reviews.localVersion, version))).run(); },
        put: row => { db.insert(schema.reviews).values(row).onConflictDoUpdate({ target: schema.reviews.id, set: row }).run(); },
    }, true, (input, existing) => { parent(input, existing); });
    const quotes = entity<QuoteRecord>({
        get: id => db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).get(),
        list: ({ includeDeleted, syncPending, bookId }) => db.select().from(schema.quotes).where(and(
            includeDeleted ? undefined : eq(schema.quotes.deleted, false),
            bookId === undefined ? undefined : eq(schema.quotes.bookId, bookId),
            syncPending === undefined ? undefined : eq(schema.quotes.syncPending, syncPending),
        )).all(),
        markSynced: (id, version) => { db.update(schema.quotes).set({ syncPending: false }).where(and(eq(schema.quotes.id, id), eq(schema.quotes.localVersion, version))).run(); },
        put: row => { db.insert(schema.quotes).values(row).onConflictDoUpdate({ target: schema.quotes.id, set: row }).run(); },
    }, true, (input, existing) => { parent(input, existing); });
    const deleteBook = books.softDelete;
    books.softDelete = id => {
        const result = transaction(() => {
            const book = deleteBook(id);
            if (!book) return null;
            for (const child of [sessions, reviews, quotes]) {
                for (const row of child.list({ bookId: id })) child.softDelete(row.id);
            }
            return book;
        });
        notify();
        return result;
    };
    return {
        books, sessions, reviews, quotes,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        restoreSnapshot(snapshot: { books: BookRecord[]; sessions: SessionRecord[]; reviews: ReviewRecord[]; quotes: QuoteRecord[] }) {
            transaction(() => {
                const restore = <T extends BookRecord | SessionRecord | ReviewRecord | QuoteRecord>(
                    rows: T[], table: typeof schema.books | typeof schema.sessions | typeof schema.reviews | typeof schema.quotes,
                    entity: EntityRepository<T>,
                ) => {
                    for (const row of rows) {
                        const existing = entity.get(row.id, true);
                        if (existing?.syncPending || existing?.deleted) continue;
                        if ('bookId' in row && !books.get(row.bookId)) continue;
                        // 테이블과 해당 행은 위 호출부에서 함께 전달한다.
                        const restored = { ...row, syncPending: false, localVersion: nextRecordVersion(now(), existing?.localVersion) };
                        db.insert(table).values(restored).onConflictDoUpdate({ target: table.id, set: restored }).run();
                    }
                };
                restore(snapshot.books, schema.books, books);
                restore(snapshot.sessions, schema.sessions, sessions);
                restore(snapshot.reviews, schema.reviews, reviews);
                restore(snapshot.quotes, schema.quotes, quotes);
            });
        },
    };
}

export type RecordRepository = ReturnType<typeof createRecordRepository>;
