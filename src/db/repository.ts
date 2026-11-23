import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { parseEndPage } from '../domain/pageRules';
import { validateBook } from '../domain/bookRules';
import { validateNewTimer, validateSessionPageRange } from '../domain/syncValidation';
import { nextRecordVersion } from '../domain/recordVersion';
import { hasOneLineConflict, planReviewPartDelete } from '../domain/reviewRules';
import * as schema from './schema';
import type { SessionDto } from '../api/types';
import type { BookRecord, QuoteRecord, ReviewConflict, ReviewRecord, SessionRecord, SyncRejection } from './schema';

type LocalRecord = Pick<BookRecord, 'id' | 'createdAt' | 'syncPending' | 'localVersion' | 'deleted'>;
export type SaveInput<T extends LocalRecord> = Omit<T, keyof Omit<LocalRecord, 'id'> | 'updatedAt' | 'serverVersion' | 'conflict'>;
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
                ...existing, ...input, createdAt: existing?.createdAt ?? timestamp, syncPending: true,
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
    }, true, input => {
        validateBook(input);
        validateSessionPageRange(input.totalPages, db.select().from(schema.sessions).where(eq(schema.sessions.bookId, input.id)).all());
    });
    const sessionEntity = entity<SessionRecord>({
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
        if (!existing) validateNewTimer(input);
        const end = parseEndPage(input.endPage === null ? '' : String(input.endPage), input.startPage, book.totalPages);
        if (end.kind === 'invalid') throw new Error(end.message);
        if (!Number.isSafeInteger(input.startPage) || input.startPage < 0 || input.startPage > book.totalPages) {
            throw new Error('시작 페이지를 확인해 주세요.');
        }
    });
    const sessions = {
        ...sessionEntity,
        acknowledge(row: SessionRecord, saved: SessionDto | void) {
            const sourceChanged = transaction(() => {
                const current = sessionEntity.get(row.id, true);
                if (!current) return false;
                const source = current.source === 'MANUAL' || saved?.source === 'MANUAL' ? 'MANUAL' : current.source;
                // NFR-05, FR-15: 서버의 MANUAL은 보존하고 전송 중 편집·삭제는 덮어쓰지 않는다.
                db.update(schema.sessions).set({
                    source,
                    syncPending: current.localVersion !== row.localVersion,
                }).where(eq(schema.sessions.id, row.id)).run();
                return source !== current.source;
            });
            if (sourceChanged) notify();
        },
    };
    const reviewEntity = entity<ReviewRecord>({
        get: id => db.select().from(schema.reviews).where(eq(schema.reviews.id, id)).get(),
        list: ({ includeDeleted, syncPending, bookId }) => db.select().from(schema.reviews).where(and(
            includeDeleted ? undefined : eq(schema.reviews.deleted, false),
            bookId === undefined ? undefined : eq(schema.reviews.bookId, bookId),
            syncPending === undefined ? undefined : eq(schema.reviews.syncPending, syncPending),
        )).all(),
        markSynced: (id, version) => { db.update(schema.reviews).set({ syncPending: false }).where(and(eq(schema.reviews.id, id), eq(schema.reviews.localVersion, version))).run(); },
        put: row => { db.insert(schema.reviews).values(row).onConflictDoUpdate({ target: schema.reviews.id, set: row }).run(); },
    }, true, (input, existing) => { parent(input, existing); });
    function writeReport(id: string, body: string | null) {
        const current = reviewEntity.get(id);
        if (!current || current.conflict || !current.body?.trim()) throw new Error('고칠 독후감을 찾을 수 없어요.');
        if (body === null) {
            const plan = planReviewPartDelete(current, 'body');
            if (plan.kind === 'delete') { reviewEntity.softDelete(id); return; }
        }
        if (body !== null && !body.trim()) throw new Error('독후감은 비울 수 없어요.');
        if (!current.oneLine?.trim()) {
            reviewEntity.save({ id, bookId: current.bookId, oneLine: current.oneLine, body, visibility: current.visibility, publishedAt: current.publishedAt });
            return;
        }
        const timestamp = now();
        db.update(schema.reviews).set({ body, syncPending: true, localVersion: nextRecordVersion(timestamp, current.localVersion) })
            .where(eq(schema.reviews.id, id)).run();
    }
    const reviews = {
        ...reviewEntity,
        acknowledge(row: ReviewRecord, serverVersion: number | null) {
            const current = reviewEntity.get(row.id, true);
            if (!current || current.conflict || current.serverVersion !== row.serverVersion) return;
            // 전송 중에 편집한 내용은 유지하고 방금 저장된 서버 버전만 이어받는다.
            db.update(schema.reviews).set({
                serverVersion, syncPending: current.localVersion !== row.localVersion,
            }).where(eq(schema.reviews.id, row.id)).run();
        },
        /**
         * FR-08 / S-31: 책의 감상 공개 범위를 한 번에 맞춘다. 값이 다른 감상만 새 버전으로 저장해 동기화를 예약하고,
         * 서버와 충돌한 감상과 삭제한 감상은 건드리지 않는다. 바꾼 감상 수를 돌려준다.
         *
         * 공개 범위는 감상 내용의 수정이 아니므로 updatedAt을 그대로 둔다. 책의 대표 한줄평(bookOneLine)이
         * updatedAt 순으로 고르기 때문에, 바꾸면 공개 범위만 바꿔도 대표 한줄평이 달라진다.
         * 동기화는 localVersion·syncPending으로 대기를 관리하고, 서버는 감상 충돌을 version으로만 판단하며
         * updatedAt을 순서 기준으로 쓰지 않는다(BE docs/API.md). visibility가 달라진 PUT은 updatedAt이 같아도
         * 같은 요청으로 취급되지 않으므로 그대로 저장되고 서버 버전이 오른다.
         */
        setBookVisibility(bookId: string, visibility: ReviewRecord['visibility']): number {
            const changed = transaction(() => {
                const targets = reviewEntity.list({ bookId }).filter(row => !row.conflict && row.visibility !== visibility);
                const timestamp = now();
                for (const row of targets) {
                    db.update(schema.reviews).set({
                        visibility, syncPending: true, localVersion: nextRecordVersion(timestamp, row.localVersion),
                    }).where(eq(schema.reviews.id, row.id)).run();
                }
                return targets.length;
            });
            if (changed > 0) notify();
            return changed;
        },
        /**
         * FR-08 / S-31: 공개 범위가 섞인 책을 찾을 때 쓴다. 본문 없이 책 ID와 공개 범위만 읽으며,
         * 삭제한 감상과 서버와 충돌한 감상은 뺀다.
         */
        visibilities(): { bookId: string; visibility: ReviewRecord['visibility'] }[] {
            return db.select({ bookId: schema.reviews.bookId, visibility: schema.reviews.visibility }).from(schema.reviews)
                .where(and(eq(schema.reviews.deleted, false), isNull(schema.reviews.conflict))).all();
        },
        /**
         * #91 S-53: 독후감 본문만 고친다. 같은 ID·공개 범위를 유지하고, 한 감상에 함께 든 한줄평도 그대로 둔다.
         * 한줄평이 함께 든 예전 감상은 updatedAt을 두어, 독후감을 고친 것으로 대표 한줄평(가장 최근에 고친 한줄평)이 바뀌지 않게 한다.
         */
        updateReport(id: string, body: string) {
            transaction(() => writeReport(id, body));
            notify();
        },
        /** #91 S-50: 독후감을 지운다. 한줄평이 함께 든 감상은 독후감만 비우고, 아니면 감상 전체를 tombstone으로 지운다. */
        deleteReport(id: string) {
            transaction(() => writeReport(id, null));
            notify();
        },
        /**
         * #91 S-50: 책의 한줄평을 지운다. 대표 한줄평 하나만 지우면 예전 한줄평이 대신 나타나므로 그 책의 한줄평을 모두 지운다.
         * 독후감이 함께 든 감상은 한줄평만 비운다. 한줄평이 든 충돌 감상이 있으면 해결 전까지 거절한다.
         */
        deleteOneLine(bookId: string): number {
            const changed = transaction(() => {
                if (hasOneLineConflict(reviews.conflicts(bookId))) throw new Error('동기화 충돌을 먼저 해결해 주세요.');
                const targets = reviewEntity.list({ bookId }).filter(row => !row.conflict && row.oneLine?.trim());
                for (const row of targets) {
                    const plan = planReviewPartDelete(row, 'oneLine');
                    if (plan.kind === 'delete') reviewEntity.softDelete(row.id);
                    else reviewEntity.save({ id: row.id, bookId: row.bookId, oneLine: plan.oneLine, body: plan.body,
                        visibility: row.visibility, publishedAt: row.publishedAt });
                }
                return targets.length;
            });
            if (changed > 0) notify();
            return changed;
        },
        conflicts(bookId?: string) {
            return db.select().from(schema.reviews).where(and(
                isNotNull(schema.reviews.conflict),
                bookId === undefined ? undefined : eq(schema.reviews.bookId, bookId),
            )).all();
        },
        markConflict(id: string) {
            if (!reviewEntity.get(id, true)?.conflict) {
                db.update(schema.reviews).set({ conflict: {} }).where(eq(schema.reviews.id, id)).run();
                notify();
            }
        },
        setConflictLatest(id: string, latest: NonNullable<ReviewConflict['latest']> | null) {
            const current = reviewEntity.get(id, true);
            if (!current?.conflict || current.conflict.latest !== undefined) return;
            db.update(schema.reviews).set({ conflict: { latest } }).where(eq(schema.reviews.id, id)).run();
            notify();
        },
        resolveConflict(id: string, latestVersion: number | null, visibility: ReviewRecord['visibility'], newId: string) {
            transaction(() => {
                const current = reviewEntity.get(id, true);
                const latest = current?.conflict?.latest;
                if (!current || latest === undefined || (latest?.version ?? null) !== latestVersion) {
                    throw new Error('최신 감상을 다시 확인해 주세요.');
                }
                if (latest === null) {
                    if (!current.deleted) {
                        reviewEntity.save({ id: newId, bookId: current.bookId, oneLine: current.oneLine,
                            body: current.body, visibility, publishedAt: null });
                    }
                    db.update(schema.reviews).set({ conflict: null, deleted: true, syncPending: false })
                        .where(eq(schema.reviews.id, id)).run();
                    return;
                }
                const timestamp = now();
                db.update(schema.reviews).set({
                    visibility, serverVersion: latest.version, conflict: null, syncPending: true,
                    updatedAt: timestamp, localVersion: nextRecordVersion(timestamp, current.localVersion),
                }).where(eq(schema.reviews.id, id)).run();
            });
            notify();
        },
    };
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
        syncRejections: {
            list() {
                return db.select().from(schema.syncRejections).all().filter(issue => {
                    const row = (issue.kind === 'book' ? books : sessions).get(issue.recordId, true);
                    return row?.syncPending && row.localVersion === issue.localVersion && books.get(issue.bookId) !== null;
                });
            },
            save(issue: SyncRejection) {
                db.insert(schema.syncRejections).values(issue).onConflictDoUpdate({ target: schema.syncRejections.key, set: issue }).run();
            },
            clear(key: string) { db.delete(schema.syncRejections).where(eq(schema.syncRejections.key, key)).run(); },
        },
        /** NFR-05·09: 서버 삭제는 종단 상태다. 동시 편집도 복원하지 않고 내용은 tombstone으로 보존한다. */
        acceptDeletedBook(server: BookRecord) {
            if (!server.deleted) return;
            transaction(() => {
                const current = books.get(server.id, true);
                if (!current) return;
                db.update(schema.books).set({ ...server, syncPending: false,
                    localVersion: nextRecordVersion(now(), current.localVersion) }).where(eq(schema.books.id, server.id)).run();
                for (const table of [schema.sessions, schema.reviews, schema.quotes]) {
                    db.update(table).set({ deleted: true, syncPending: false,
                        ...(table === schema.reviews ? { conflict: null } : {}) }).where(eq(table.bookId, server.id)).run();
                }
            });
            notify();
        },
        /** NFR-04 / S-45: 동기 작업 전체를 커밋한 뒤 한 번만 구독자에게 알린다. 실패는 롤백한다. */
        atomic<T>(work: () => T extends PromiseLike<unknown> ? never : T): T {
            const result = transaction(() => {
                const value = work();
                if (value !== null && (typeof value === 'object' || typeof value === 'function') &&
                    'then' in value && typeof value.then === 'function') {
                    throw new Error('원자적 저장 작업은 동기 함수여야 해요.');
                }
                return value;
            });
            notify();
            return result;
        },
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
                        const restored = { ...row, syncPending: false, localVersion: nextRecordVersion(now(), existing?.localVersion),
                            ...('publishedAt' in row && existing && 'publishedAt' in existing ? { publishedAt: existing.publishedAt } : {}),
                        };
                        db.insert(table).values(restored).onConflictDoUpdate({ target: table.id, set: restored }).run();
                    }
                };
                restore(snapshot.books, schema.books, books);
                restore(snapshot.sessions, schema.sessions, sessions);
                restore(snapshot.reviews, schema.reviews, reviews);
                restore(snapshot.quotes, schema.quotes, quotes);
            });
            notify();
        },
    };
}

export type RecordRepository = ReturnType<typeof createRecordRepository>;
