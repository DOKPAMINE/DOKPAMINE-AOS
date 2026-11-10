import migrations from '../migrations/migrations';
import { openDatabaseAsync } from 'expo-sqlite';
import { initializeDatabase, prepareRecordAccount } from '../client';
import { createSyncEngine } from '../../sync/engine';
import { memorySQLite } from './sqliteAdapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../sync/runtime', () => ({ startRecordSync: jest.fn() }));

test('NFR-04 S-10 초기화 실패 후 재시도하고 동시 호출은 같은 마이그레이션 완료를 기다려요', async () => {
    const open = jest.mocked(openDatabaseAsync);
    const memory = memorySQLite();
    open.mockRejectedValueOnce(new Error('DB를 열 수 없어요.'));
    await expect(initializeDatabase()).rejects.toThrow('DB를 열 수 없어요.');
    open.mockResolvedValueOnce(memory.sqlite);
    const first = initializeDatabase();
    expect(initializeDatabase()).toBe(first);
    const ready = await first;
    expect(ready.repository.books.list()).toEqual([]);
    expect(memory.connection.prepare('SELECT * FROM __drizzle_migrations').all()).toHaveLength(migrations.journal.entries.length);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith('dokpamine.db');
    memory.connection.close();
});

test('FR-10 NFR-04·05 S-02 계정 A의 미전송 기록 네 종류는 B에 보이거나 전송되지 않고 A 재로그인에 보존돼요', async () => {
    const memories = [memorySQLite(), memorySQLite()];
    jest.mocked(openDatabaseAsync).mockResolvedValueOnce(memories[0].sqlite).mockResolvedValueOnce(memories[1].sqlite);
    const a = (await initializeDatabase('account-a')).repository;
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    a.books.save({ id: id(1), title: 'A의 책', author: '독자', isbn: null, publisher: null,
        totalPages: 100, currentPage: 0, genre: '소설', coverUrl: null, status: 'READING', completedCount: 0, completedAt: null });
    a.sessions.save({ id: id(2), bookId: id(1), startedAt: 0, endedAt: 1000, activeSeconds: 1, startPage: 0, endPage: 1, source: 'TIMER' });
    a.reviews.save({ id: id(3), bookId: id(1), oneLine: 'A의 감상', body: null, visibility: 'PRIVATE', publishedAt: null });
    a.quotes.save({ id: id(4), bookId: id(1), text: 'A의 문장', page: 1, memo: null });
    // 삭제 대기 tombstone 역시 계정 파티션에 남는다.
    a.quotes.softDelete(id(4));
    await prepareRecordAccount('account-b');
    const b = (await initializeDatabase()).repository;
    const put = jest.fn().mockResolvedValue(undefined);
    const snapshot = jest.fn().mockResolvedValue({ books: [], sessions: [], reviews: [], quotes: [] });
    await createSyncEngine(b, { putBook: put, putSession: put, putReview: put, putQuote: put, snapshot }, async () => true).afterLogin();
    for (const entity of [b.books, b.sessions, b.reviews, b.quotes]) expect(entity.list({ includeDeleted: true })).toEqual([]);
    expect(put).not.toHaveBeenCalled();
    await prepareRecordAccount('account-a');
    expect((await initializeDatabase()).repository).toBe(a);
    for (const entity of [a.books, a.sessions, a.reviews, a.quotes]) {
        expect(entity.list({ includeDeleted: true })).toEqual([expect.objectContaining({ syncPending: true })]);
    }
    expect(a.quotes.get(id(4), true)?.deleted).toBe(true);
    expect(openDatabaseAsync).toHaveBeenNthCalledWith(3, expect.stringMatching(/^dokpamine-account-[0-9a-f]+\.db$/));
    memories.forEach(memory => memory.connection.close());
});
