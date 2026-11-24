import migrations from '../migrations/migrations';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as schema from '../schema';
import { prepareRecordDatabase } from '../client';
import { createRecordRepository, type EntityRepository, type RecordDatabase, type RecordRepository, type SaveInput } from '../repository';
import { books, sessions, type BookRecord, type QuoteRecord, type ReviewRecord, type SessionRecord } from '../schema';
import { booksReadByDate, monthlyStats } from '../../domain/calendarRules';
import { bookOneLine } from '../../domain/reviewRules';
import { memorySQLite } from './sqliteAdapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../sync/runtime', () => ({ startRecordSync: jest.fn() }));

const bookId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const reviewId = '00000000-0000-4000-8000-000000000003';
const quoteId = '00000000-0000-4000-8000-000000000004';
const book: SaveInput<BookRecord> = {
    id: bookId, isbn: null, title: '데미안', author: '헤르만 헤세', publisher: null,
    totalPages: 240, genre: '소설/시', coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false, status: 'READING', currentPage: 0,
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

test('NFR-04 기존 DB를 업그레이드해도 책·세션과 삭제 기록을 보존하고 새 칸은 비워 둬요', async () => {
    const old = memorySQLite();
    try {
        const oldDb = drizzle(old.sqlite, { schema });
        await migrate(oldDb, { journal: { ...migrations.journal, entries: migrations.journal.entries.slice(0, 2) },
            migrations: { m0000: migrations.migrations.m0000, m0001: migrations.migrations.m0001 } });
        // 이전 버전 DB에는 새 칸(side_cover_url 등)이 없으므로 현재 스키마의 저장소 대신 그 시점의 열만으로 기존 행을 만든다.
        old.connection.prepare(`INSERT INTO books (id, created_at, sync_pending, local_version, deleted, isbn, title, author, publisher,
            total_pages, genre, cover_url, status, current_page, completed_count, completed_at, updated_at)
            VALUES (?, 100000, 1, 1, 0, NULL, '데미안', '헤르만 헤세', NULL, 240, '소설', NULL, 'READING', 0, 0, NULL, 100000)`).run(bookId);
        old.connection.prepare(`INSERT INTO sessions (id, created_at, sync_pending, local_version, deleted, book_id,
            started_at, ended_at, active_seconds, start_page, end_page, source)
            VALUES (?, 100000, 1, 2, 1, ?, 1000, 61000, 60, 0, 84, 'TIMER')`).run(sessionId, bookId);
        const upgraded = (await prepareRecordDatabase(old.sqlite)).repository;
        expect(upgraded.books.get(bookId)).toEqual({
            id: bookId, createdAt: 100000, syncPending: true, localVersion: 1, deleted: false,
            isbn: null, title: '데미안', author: '헤르만 헤세', publisher: null, totalPages: 240, genre: '소설/시',
            coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false, status: 'READING',
            currentPage: 0, completedCount: 0, completedAt: null, updatedAt: 100000,
        });
        expect(upgraded.sessions.get(sessionId, true)).toEqual({
            id: sessionId, createdAt: 100000, syncPending: true, localVersion: 2, deleted: true,
            bookId, startedAt: 1000, endedAt: 61000, activeSeconds: 60, startPage: 0, endPage: 84, source: 'TIMER',
        });
        expect(upgraded.syncRejections.list()).toEqual([]);
    } finally { old.connection.close(); }
});

test('NFR-04·05 세션 범위를 침해하는 책 수정은 원본과 대기를 보존해요', () => {
    repository.sessions.save({ ...session, startPage: 200, endPage: null });
    const before = repository.books.get(bookId);
    expect(() => repository.books.save({ ...book, totalPages: 100 })).toThrow('시작·종료 쪽');
    expect(repository.books.get(bookId)).toEqual(before);
    repository.books.save({ ...book, totalPages: 200 });
    repository.sessions.softDelete(sessionId);
    repository.books.save({ ...book, totalPages: 100 });
});

test('FR-15 신규 TIMER는 경과 시간을 검사하고 기존 기록 수정과 MANUAL은 보존해요', () => {
    expect(() => repository.sessions.save({ ...session, activeSeconds: 61 })).toThrow('활성 시간');
    expect(repository.sessions.list()).toEqual([]);
    repository.sessions.save(session);
    repository.sessions.save({ ...session, activeSeconds: 61 });
    repository.sessions.save({ ...session, id: quoteId, source: 'MANUAL', activeSeconds: 100 });
    expect(repository.sessions.list()).toHaveLength(2);
});

test('NFR-04 S-45 책 진행과 세션을 원자적으로 저장한 뒤 한 번만 알려요', () => {
    const committed: { page: number; sessions: number }[] = [];
    repository.subscribe(() => committed.push({ page: repository.books.get(bookId)!.currentPage, sessions: repository.sessions.list().length }));
    const result = repository.atomic(() => {
        repository.books.save({ ...book, currentPage: 84 });
        expect(committed).toEqual([]);
        return repository.sessions.save(session);
    });
    expect(result.id).toBe(sessionId);
    expect(committed).toEqual([{ page: 84, sessions: 1 }]);
});

test('NFR-04 S-45 여러 기록 저장 도중 실패하면 전부 롤백하고 알리지 않아요', () => {
    const before = repository.books.get(bookId);
    const listener = jest.fn();
    repository.subscribe(listener);
    expect(() => repository.atomic(() => {
        repository.books.save({ ...book, currentPage: 84 });
        repository.sessions.save(session);
        throw new Error('SQLITE_FULL');
    })).toThrow('SQLITE_FULL');
    expect(repository.books.get(bookId)).toEqual(before);
    expect(repository.sessions.list()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    repository.atomic(() => repository.sessions.save(session));
    expect(listener).toHaveBeenCalledTimes(1);
});

test('NFR-04 S-45 원자적 작업을 중첩해도 마지막 커밋 뒤 한 번만 알려요', () => {
    const listener = jest.fn();
    repository.subscribe(listener);
    repository.atomic(() => {
        repository.books.save({ ...book, currentPage: 84 });
        repository.atomic(() => repository.sessions.save(session));
        expect(listener).not.toHaveBeenCalled();
    });
    expect(listener).toHaveBeenCalledTimes(1);
});

test.each(['Promise', 'thenable'])('NFR-04 S-45 원자적 작업이 %s를 반환하면 커밋하지 않고 롤백해요', kind => {
    const before = repository.books.get(bookId);
    const listener = jest.fn();
    repository.subscribe(listener);
    const work = kind === 'Promise'
        ? async () => { repository.books.save({ ...book, currentPage: 84 }); }
        : () => { repository.books.save({ ...book, currentPage: 84 }); return { then: () => {} }; };
    // 런타임 경계에서는 타입 검사를 우회한 thenable도 거부해야 한다.
    expect(() => repository.atomic(work as () => never)).toThrow('동기 함수');
    expect(repository.books.get(bookId)).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
    repository.atomic(() => repository.sessions.save(session));
    expect(listener).toHaveBeenCalledTimes(1);
});

test.each([
    ['async 함수', async (): Promise<number> => 42],
    ['Promise', (): Promise<number> => Promise.resolve(42)],
    ['PromiseLike', (): PromiseLike<number> => Promise.resolve(42)],
] as const)('NFR-04 S-45 원자적 작업의 %s 반환을 타입에서도 금지해요', (_kind, work) => {
    expect(() => {
        // @ts-expect-error 원자적 작업은 PromiseLike를 반환할 수 없다.
        repository.atomic(work);
    }).toThrow('동기 함수');
});

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
    expect(() => repository.sessions.save(session)).toThrow('삭제한 기록');
    expect(repository.sessions.get(sessionId)).toBeNull();
    expect(repository.sessions.softDelete(sessionId)?.deleted).toBe(true);
    expect(repository.sessions.softDelete(quoteId)).toBeNull();
});

test('NFR-04 S-30 마이그레이션을 다시 적용해도 기존 기록·삭제 행과 생성 시각이 남아요', async () => {
    repository.sessions.save(session);
    repository.sessions.softDelete(sessionId);
    const before = repository.sessions.get(sessionId, true);
    await prepareRecordDatabase(memory.sqlite);
    expect(repository.sessions.get(sessionId, true)).toEqual(before);
    expect(memory.connection.prepare('SELECT * FROM __drizzle_migrations').all()).toHaveLength(migrations.journal.entries.length);
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

test('NFR-05 S-45 완료 응답은 전송 버전과 일치할 때만 대기를 해제해요', () => {
    const sent = repository.sessions.save(session);
    const changed = repository.sessions.save({ ...session, endPage: 100 });
    repository.sessions.markSynced(sessionId, sent.localVersion);
    expect(repository.sessions.get(sessionId)?.syncPending).toBe(true);
    repository.sessions.markSynced(sessionId, changed.localVersion);
    expect(repository.sessions.get(sessionId)?.syncPending).toBe(false);
});

test('NFR-04·05 S-30 책 삭제는 자식도 tombstone으로 만들고 재삭제는 버전을 유지해요', () => {
    repository.sessions.save(session);
    repository.reviews.save({ id: reviewId, bookId, oneLine: '감상', body: null, visibility: 'PRIVATE', publishedAt: null });
    repository.quotes.save({ id: quoteId, bookId, text: '문장', page: null, memo: null });
    repository.books.softDelete(bookId);
    const entities = [repository.books, repository.sessions, repository.reviews, repository.quotes];
    const before = entities.map(entity => entity.list({ includeDeleted: true }));
    now += 1000;
    repository.books.softDelete(bookId);
    expect(entities.map(entity => entity.list({ includeDeleted: true }))).toEqual(before);
    expect(before.every(rows => rows[0].deleted && rows[0].syncPending)).toBe(true);
});

test('#105 FR-05 FR-06 S-60 S-62 책을 삭제하면 그 달 통계와 날짜 칸에서 그 책의 기록이 빠져요', () => {
    const otherBookId = '00000000-0000-4000-8000-000000000005';
    const nov3 = Date.parse('2026-11-03T03:00:00Z');
    const nov4 = Date.parse('2026-11-04T03:00:00Z');
    now = Date.parse('2026-11-05T00:00:00Z');
    repository.books.save({ ...book, id: otherBookId, title: '수레바퀴 아래서' });
    repository.sessions.save({ ...session, id: '00000000-0000-4000-8000-000000000006', bookId: otherBookId, startedAt: nov3, endedAt: nov3 + 600_000, activeSeconds: 600 });
    repository.sessions.save({ ...session, id: '00000000-0000-4000-8000-000000000007', startedAt: nov3 + 3_600_000, endedAt: nov3 + 4_800_000, activeSeconds: 1200 });
    repository.sessions.save({ ...session, id: '00000000-0000-4000-8000-000000000008', startedAt: nov4, endedAt: nov4 + 1_800_000, activeSeconds: 1800 });
    // 화면(useCalendarRecords·useMyRecords)처럼 저장소의 기본 목록을 넘긴다.
    const stats = () => monthlyStats(repository.sessions.list(), repository.books.list(), '2026-11');
    const byDate = () => booksReadByDate(repository.sessions.list(), repository.books.list(), '2026-11');
    expect(stats()).toMatchObject({ totalSeconds: 3600, sessionCount: 3, readingDayCount: 2, booksReadCount: 2 });
    expect([...byDate().keys()]).toEqual(['2026-11-03', '2026-11-04']);

    repository.books.softDelete(bookId);

    expect(stats()).toMatchObject({
        totalSeconds: 600, sessionCount: 1, readingDayCount: 1, booksReadCount: 1,
        byGenre: [{ label: '소설/시', seconds: 600, ratio: 1 }],
    });
    expect(byDate()).toEqual(new Map([['2026-11-03', [{ bookId: otherBookId, seconds: 600, firstStartedAt: nov3 }]]]));
});

test.each([
    { title: '' }, { title: ' ' }, { title: '가'.repeat(201) }, { author: '' }, { author: '가'.repeat(101) },
    { totalPages: 0 }, { totalPages: 1.5 }, { totalPages: NaN }, { currentPage: -1 }, { currentPage: 241 }, { currentPage: 0.5 },
])('FR-01·03 S-23 책 저장 계약 경계 %j는 거부해요', input => {
    const previous = repository.books.get(bookId);
    expect(() => repository.books.save({ ...book, ...input })).toThrow();
    expect(repository.books.get(bookId)).toEqual(previous);
});

test('FR-01·03 S-23 제목·저자와 쪽수 최댓값 경계는 저장해요', () => {
    expect(repository.books.save({ ...book, title: '가'.repeat(200), author: '가'.repeat(100), currentPage: 240 }).currentPage).toBe(240);
});

test('NFR-05 S-80 SQL 필터는 책과 삭제·대기 상태를 함께 제한해요', () => {
    const saved = repository.sessions.save(session);
    repository.sessions.markSynced(saved.id, saved.localVersion);
    expect(repository.sessions.list({ bookId, syncPending: true })).toEqual([]);
    expect(repository.sessions.list({ bookId, syncPending: false })).toEqual([expect.objectContaining({ id: sessionId })]);
    repository.sessions.softDelete(sessionId);
    expect(repository.sessions.list({ syncPending: true })).toEqual([]);
    expect(repository.sessions.list({ includeDeleted: true, syncPending: true, bookId })).toHaveLength(1);
    expect(repository.sessions.list({ includeDeleted: true, bookId: quoteId })).toEqual([]);
});

test('#89 FR-08 S-31 책 공개 범위를 바꾸면 값이 다른 감상만 동기화 대기로 바꾸고 충돌·다른 책은 그대로예요', () => {
    const ids = ['00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000032',
        '00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000034'];
    const otherBook = '00000000-0000-4000-8000-000000000035';
    repository.books.save({ ...book, id: otherBook });
    repository.reviews.save({ id: ids[0], bookId, oneLine: '한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.save({ id: ids[1], bookId, oneLine: null, body: '독후감', visibility: 'PUBLIC', publishedAt: null });
    repository.reviews.save({ id: ids[2], bookId, oneLine: null, body: '충돌한 독후감', visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.save({ id: ids[3], bookId: otherBook, oneLine: '다른 책', body: null, visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.markConflict(ids[2]);
    for (const id of ids) { const row = repository.reviews.get(id)!; repository.reviews.markSynced(id, row.localVersion); }
    const unchanged = repository.reviews.get(ids[1]);
    const listener = jest.fn();
    repository.subscribe(listener);
    now += 1000;

    expect(repository.reviews.setBookVisibility(bookId, 'PUBLIC')).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(repository.reviews.get(ids[0])).toMatchObject({ visibility: 'PUBLIC', oneLine: '한줄평', syncPending: true, updatedAt: 100000 });
    expect(repository.reviews.get(ids[1])).toEqual(unchanged);
    expect(repository.reviews.get(ids[2])).toMatchObject({ visibility: 'PRIVATE', syncPending: false });
    expect(repository.reviews.get(ids[3])).toMatchObject({ visibility: 'PRIVATE', syncPending: false });
    expect(repository.reviews.setBookVisibility(bookId, 'PUBLIC')).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
});

test('#89 FR-08 S-31 공개 범위만 바꾸면 updatedAt을 두어 대표 한줄평이 바뀌지 않고 동기화 대기는 돼요', () => {
    const older = '00000000-0000-4000-8000-000000000041';
    const newer = '00000000-0000-4000-8000-000000000042';
    repository.reviews.save({ id: older, bookId, oneLine: '예전 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    now += 1000;
    repository.reviews.save({ id: newer, bookId, oneLine: '최근 한줄평', body: null, visibility: 'PUBLIC', publishedAt: null });
    const before = repository.reviews.get(older)!;
    repository.reviews.markSynced(older, before.localVersion);
    expect(bookOneLine(repository.reviews.list({ bookId }))?.id).toBe(newer);
    now += 1000;

    expect(repository.reviews.setBookVisibility(bookId, 'PUBLIC')).toBe(1);
    const after = repository.reviews.get(older)!;
    expect(after).toMatchObject({ visibility: 'PUBLIC', updatedAt: before.updatedAt, syncPending: true });
    expect(after.localVersion).toBeGreaterThan(before.localVersion);
    expect(bookOneLine(repository.reviews.list({ bookId }))?.id).toBe(newer);
});

test('#89 FR-08 S-31 책 공개 범위를 바꿔도 삭제한 감상은 그대로예요', () => {
    const kept = '00000000-0000-4000-8000-000000000051';
    const deleted = '00000000-0000-4000-8000-000000000052';
    repository.reviews.save({ id: kept, bookId, oneLine: '남은 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.save({ id: deleted, bookId, oneLine: null, body: '지운 독후감', visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.softDelete(deleted);
    const tombstone = repository.reviews.get(deleted, true)!;
    repository.reviews.markSynced(deleted, tombstone.localVersion);
    const synced = repository.reviews.get(deleted, true);

    expect(repository.reviews.setBookVisibility(bookId, 'PUBLIC')).toBe(1);
    expect(repository.reviews.get(deleted, true)).toEqual(synced);
    expect(repository.reviews.get(deleted, true)).toMatchObject({ deleted: true, visibility: 'PRIVATE', syncPending: false });
    expect(repository.reviews.get(kept)).toMatchObject({ visibility: 'PUBLIC' });
});

test('#89 FR-08 S-31 섞인 책 찾기용 조회는 삭제·충돌 감상을 빼고 책 ID와 공개 범위만 돌려줘요', () => {
    const ids = ['00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000063'];
    repository.reviews.save({ id: ids[0], bookId, oneLine: null, body: '긴 독후감', visibility: 'PUBLIC', publishedAt: null });
    repository.reviews.save({ id: ids[1], bookId, oneLine: '충돌', body: null, visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.save({ id: ids[2], bookId, oneLine: '삭제', body: null, visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.markConflict(ids[1]);
    repository.reviews.softDelete(ids[2]);
    expect(repository.reviews.visibilities()).toEqual([{ bookId, visibility: 'PUBLIC' }]);
});

describe('#91 감상 수정·삭제', () => {
    const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
    const review = (n: number, oneLine: string | null, body: string | null, visibility: ReviewRecord['visibility'] = 'PRIVATE') =>
        repository.reviews.save({ id: id(n), bookId, oneLine, body, visibility, publishedAt: null });

    test('S-53 독후감을 고치면 같은 ID·공개 범위로 바뀌고 동기화 대기가 돼요', () => {
        const before = review(1, null, '처음 독후감', 'PUBLIC');
        repository.reviews.markSynced(before.id, before.localVersion);
        now += 1000;
        repository.reviews.updateReport(before.id, '고친 독후감');
        expect(repository.reviews.list({ bookId })).toEqual([expect.objectContaining({
            id: before.id, body: '고친 독후감', visibility: 'PUBLIC', syncPending: true, createdAt: before.createdAt, updatedAt: now })]);
        expect(repository.reviews.get(before.id)!.localVersion).toBeGreaterThan(before.localVersion);
    });

    test('S-53 한줄평이 함께 든 예전 감상의 독후감을 고쳐도 한줄평과 대표 한줄평은 그대로예요', () => {
        const combined = review(1, '예전 한줄평', '함께 쓴 독후감');
        now += 1000;
        const newer = review(2, '최신 한줄평', null);
        now += 1000;
        repository.reviews.updateReport(combined.id, '고친 독후감');
        expect(repository.reviews.get(combined.id)).toMatchObject({ oneLine: '예전 한줄평', body: '고친 독후감', updatedAt: combined.updatedAt, syncPending: true });
        expect(bookOneLine(repository.reviews.list({ bookId }))?.id).toBe(newer.id);
    });

    test('S-50 독후감만 든 감상을 지우면 tombstone으로 남아 동기화 대기가 돼요', () => {
        const report = review(1, null, '지울 독후감');
        repository.reviews.markSynced(report.id, report.localVersion);
        repository.reviews.deleteReport(report.id);
        expect(repository.reviews.list({ bookId })).toEqual([]);
        expect(repository.reviews.get(report.id, true)).toMatchObject({ deleted: true, syncPending: true, body: '지울 독후감' });
    });

    test('S-50 한줄평과 독후감이 함께 든 감상은 지우는 쪽만 비워요', () => {
        review(1, '한줄평', '독후감');
        repository.reviews.deleteReport(id(1));
        expect(repository.reviews.get(id(1))).toMatchObject({ oneLine: '한줄평', body: null, deleted: false, syncPending: true });

        review(2, '둘째 한줄평', '둘째 독후감');
        repository.reviews.deleteOneLine(bookId);
        expect(repository.reviews.get(id(1), true)).toMatchObject({ deleted: true });
        expect(repository.reviews.get(id(2))).toMatchObject({ oneLine: null, body: '둘째 독후감', deleted: false, syncPending: true });
    });

    test('S-50 한줄평을 지우면 예전 한줄평이 대신 나타나지 않게 그 책의 한줄평을 모두 지우고 독후감은 남겨요', () => {
        review(1, '예전 한줄평', null);
        now += 1000;
        review(2, '최신 한줄평', null);
        review(3, null, '독후감');
        expect(repository.reviews.deleteOneLine(bookId)).toBe(2);
        expect(bookOneLine(repository.reviews.list({ bookId }))).toBeUndefined();
        expect(repository.reviews.list({ bookId }).map(row => row.id)).toEqual([id(3)]);
    });

    test('NFR-05 S-50 한줄평이 든 충돌 감상이 있으면 한줄평 삭제를 거절하고 아무것도 바꾸지 않아요', () => {
        const shown = review(1, '보이는 한줄평', null);
        review(2, '충돌한 한줄평', null);
        repository.reviews.markConflict(id(2));
        expect(() => repository.reviews.deleteOneLine(bookId)).toThrow('동기화 충돌을 먼저 해결해 주세요.');
        expect(repository.reviews.get(id(1))).toEqual(shown);
    });

    test('NFR-05 S-50 충돌·삭제된 독후감이나 독후감이 없는 감상은 고치거나 지울 수 없어요', () => {
        review(1, null, '충돌한 독후감');
        repository.reviews.markConflict(id(1));
        review(2, '한줄평만', null);
        review(3, null, '지운 독후감');
        repository.reviews.softDelete(id(3));
        for (const target of [id(1), id(2), id(3)]) {
            expect(() => repository.reviews.updateReport(target, '고친 독후감')).toThrow('고칠 독후감을 찾을 수 없어요.');
            expect(() => repository.reviews.deleteReport(target)).toThrow('고칠 독후감을 찾을 수 없어요.');
        }
        review(4, null, '독후감');
        expect(() => repository.reviews.updateReport(id(4), ' ')).toThrow('독후감은 비울 수 없어요.');
    });
});

test('#91 S-50 지울 한줄평이 없으면 아무것도 바꾸지 않고 알리지도 않아요', () => {
    repository.reviews.save({ id: reviewId, bookId, oneLine: null, body: '독후감', visibility: 'PRIVATE', publishedAt: null });
    const before = repository.reviews.get(reviewId);
    const listener = jest.fn();
    repository.subscribe(listener);
    expect(repository.reviews.deleteOneLine(bookId)).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(repository.reviews.get(reviewId)).toEqual(before);
});

test('#95 NFR-05 S-50 서버에서 지워진 독후감과의 충돌을 초안 저장으로 해결해도 처음 쓴 시각을 이어받아요', () => {
    repository.reviews.save({ id: reviewId, bookId, oneLine: null, body: '초안 독후감', visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.markConflict(reviewId);
    repository.reviews.setConflictLatest(reviewId, null);
    now = 900000;
    const newId = '00000000-0000-4000-8000-000000000005';
    repository.reviews.resolveConflict(reviewId, null, 'PRIVATE', newId);
    expect(repository.reviews.get(newId)).toMatchObject({ body: '초안 독후감', createdAt: 100000, updatedAt: 900000, syncPending: true });
});
