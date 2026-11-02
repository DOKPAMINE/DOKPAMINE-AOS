import { openDatabaseAsync } from 'expo-sqlite';
import { initializeDatabase } from '../client';
import { memorySQLite } from './sqliteAdapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

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
    expect(memory.connection.prepare('SELECT * FROM __drizzle_migrations').all()).toHaveLength(1);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith('dokpamine.db');
    memory.connection.close();
});
