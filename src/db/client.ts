import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import migrations from './migrations/migrations';
import { createRecordRepository } from './repository';
import * as schema from './schema';

/** 마이그레이션 실패는 호출자에게 전달하며 기존 기록을 초기화하거나 삭제하지 않는다. */
export async function prepareRecordDatabase(sqlite: SQLiteDatabase) {
    sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const db = drizzle(sqlite, { schema });
    await migrate(db, migrations);
    return { db, repository: createRecordRepository(db) };
}

let initialization: ReturnType<typeof prepareRecordDatabase> | undefined;

/** 4단계 앱 루트에서 await initializeDatabase() 후 화면을 열어 마이그레이션 완료를 보장한다. */
export function initializeDatabase() {
    if (!initialization) {
        initialization = openDatabaseAsync('dokpamine.db').then(async sqlite => {
            try {
                return await prepareRecordDatabase(sqlite);
            } catch (error) {
                await sqlite.closeAsync();
                throw error;
            }
        }).catch(error => {
            initialization = undefined;
            throw error;
        });
    }
    return initialization;
}
