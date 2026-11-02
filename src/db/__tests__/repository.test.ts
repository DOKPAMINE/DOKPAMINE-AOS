import { eq } from 'drizzle-orm';
import { prepareRecordDatabase } from '../client';
import { createRecordRepository, type EntityRepository, type RecordDatabase, type RecordRepository, type SaveInput } from '../repository';
import { books, sessions, type BookRecord, type QuoteRecord, type ReviewRecord, type SessionRecord } from '../schema';
import { memorySQLite } from './sqliteAdapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

const bookId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const reviewId = '00000000-0000-4000-8000-000000000003';
const quoteId = '00000000-0000-4000-8000-000000000004';
const book: SaveInput<BookRecord> = {
    id: bookId, isbn: null, title: '데미안', author: '헤르만 헤세', publisher: null,
    totalPages: 240, genre: '소설', coverUrl: null, status: 'READING', currentPage: 0,
    completedCount: 0, completedAt: null,
};
const session: SaveInput<SessionRecord> = {
    id: sessionId, bookId, startedAt: 1000, endedAt: 61000, activeSeconds: 60,
    startPage: 0, endPage: 84, source: 'TIMER',
};
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;
let db: RecordDatabase;
let now: number;

beforeEach(async () => {
    memory = memorySQLite();
    ({ db } = await prepareRecordDatabase(memory.sqlite));
    now = 100000;
    repository = createRecordRepository(db, () => now);
    repository.books.save(book);
});
afterEach(() => memory.connection.close());

test('NFR-04~06 S-45 같은 ms에 세션을 두 번 저장해도 한 행이고 생성 시각과 UUID는 같아요', () => {
    const first = repository.sessions.save(session);
    const second = repository.sessions.save({ ...session, endPage: 90 });
    expect(second).toMatchObject({ id: sessionId, createdAt: first.createdAt, localVersion: first.localVersion + 1, syncPending: true });
    expect(repository.sessions.list({ bookId })).toEqual([second]);
    now -= 1000;
    const third = repository.sessions.save(session);
    expect(third.localVersion).toBe(second.localVersion + 1);
    expect(third.createdAt).toBe(first.createdAt);
});

test('NFR-04~06 S-30 S-50 네 종류 기록은 저장·조회·재저장·소프트 삭제할 수 있어요', () => {
    const review = { id: reviewId, bookId, oneLine: '좋았어요', body: null, visibility: 'PRIVATE' as const, publishedAt: null };
    const quote = { id: quoteId, bookId, text: '내 안에서 솟아 나오려는 것', page: 10, memo: null };
    repository.sessions.save(session);
    repository.reviews.save(review);
    repository.quotes.save(quote);
    const verify = <T extends BookRecord | SessionRecord | ReviewRecord | QuoteRecord>(
        entity: EntityRepository<T>, input: SaveInput<T>,
    ) => {
        const first = entity.get(input.id)!;
        const second = entity.save(input);
        expect(second.syncPending).toBe(true);
        expect(second.localVersion).toBe(first.localVersion + 1);
        expect(second.createdAt).toBe(first.createdAt);
        const deleted = entity.softDelete(input.id)!;
        expect(deleted).toMatchObject({ deleted: true, syncPending: true, createdAt: first.createdAt, localVersion: second.localVersion + 1 });
        expect(entity.get(input.id)).toBeNull();
        expect(entity.list()).toEqual([]);
        expect(entity.get(input.id, true)).toEqual(deleted);
        expect(entity.list({ includeDeleted: true })).toEqual([deleted]);
        expect(() => entity.save(input)).toThrow('삭제한 기록');
    };
    verify(repository.sessions, session);
    verify(repository.reviews, review);
    verify(repository.quotes, quote);
    verify(repository.books, book);
});

test('NFR-05 S-45 전송 대기가 해제된 행도 다시 저장하거나 삭제하면 대기 상태예요', () => {
    repository.sessions.save(session);
    db.update(sessions).set({ syncPending: false }).where(eq(sessions.id, sessionId)).run();
    expect(repository.sessions.save(session).syncPending).toBe(true);
    db.update(sessions).set({ syncPending: false }).where(eq(sessions.id, sessionId)).run();
    expect(repository.sessions.softDelete(sessionId)?.syncPending).toBe(true);
});

test.each([-1, 241, 1.5, NaN, Infinity])('FR-03 S-43 끝 쪽 %s은 저장 전에 거부돼요', endPage => {
    expect(() => repository.sessions.save({ ...session, endPage })).toThrow();
    expect(repository.sessions.list()).toEqual([]);
});
test.each([null, 0, 240])('FR-03 S-43 시간만 저장과 양 끝 경계 %s은 저장돼요', endPage => {
    expect(repository.sessions.save({ ...session, endPage }).endPage).toBe(endPage);
});

test('NFR-04 S-35 없는 책·삭제된 책·다른 책으로 바꾼 기록·잘못된 UUID는 거부해요', () => {
    expect(() => repository.sessions.save({ ...session, bookId: reviewId })).toThrow('책을 찾을 수 없어요.');
    expect(() => repository.books.save({ ...book, id: 'server-generated-id' })).toThrow('UUID');
    repository.sessions.save(session);
    repository.books.save({ ...book, id: reviewId });
    expect(() => repository.sessions.save({ ...session, bookId: reviewId })).toThrow('기록의 책');
    repository.books.softDelete(bookId);
    expect(() => repository.sessions.save(session)).toThrow('책을 찾을 수 없어요.');
    expect(repository.sessions.get(sessionId)).not.toBeNull();
    expect(repository.sessions.softDelete(sessionId)?.deleted).toBe(true);
    expect(repository.sessions.softDelete(quoteId)).toBeNull();
});

test('NFR-04 S-30 마이그레이션을 다시 적용해도 기존 기록·삭제 행과 생성 시각이 남아요', async () => {
    repository.sessions.save(session);
    repository.sessions.softDelete(sessionId);
    const before = repository.sessions.get(sessionId, true);
    await prepareRecordDatabase(memory.sqlite);
    expect(repository.sessions.get(sessionId, true)).toEqual(before);
    expect(memory.connection.prepare('SELECT * FROM __drizzle_migrations').all()).toHaveLength(1);
    expect(db.select().from(books).all()).toHaveLength(1);
    expect(memory.connection.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 });
});

test('FR-07 S-51 감상 길이와 공개 범위의 DB 제약조건을 지켜요', () => {
    const review = { id: reviewId, bookId, oneLine: '감상', body: null, visibility: 'PRIVATE' as const, publishedAt: null };
    expect(() => repository.reviews.save({ ...review, oneLine: '가'.repeat(101) })).toThrow();
    expect(() => repository.reviews.save({ ...review, oneLine: null })).toThrow();
    expect(repository.reviews.list()).toEqual([]);
    expect(repository.reviews.save(review).visibility).toBe('PRIVATE');
});
