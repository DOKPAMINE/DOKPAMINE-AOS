/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Expo 네이티브 호출만 대체한다. SQL·트랜잭션·제약조건은 실제 메모리 SQLite에서 실행한다. */
export function memorySQLite() {
    const connection = new DatabaseSync(':memory:');
    const adapter = {
        execSync: (sql: string) => connection.exec(sql),
        closeAsync: async () => connection.close(),
        prepareSync(sql: string) {
            const statement = connection.prepare(sql);
            return {
                executeSync(params: SQLInputValue[]) {
                    const result = statement.run(...params);
                    return {
                        changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid),
                        getAllSync: () => statement.all(...params),
                        getFirstSync: () => statement.get(...params),
                    };
                },
                executeForRawResultSync(params: SQLInputValue[]) {
                    statement.setReturnArrays(true);
                    return { getAllSync: () => statement.all(...params) };
                },
            };
        },
    };
    return { sqlite: adapter as unknown as SQLiteDatabase, connection };
}
