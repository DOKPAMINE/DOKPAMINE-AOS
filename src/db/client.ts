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

const initializations = new Map<string, ReturnType<typeof prepareRecordDatabase>>();
let activeAccount: string | undefined;

/** 4단계 앱 루트에서 await initializeDatabase() 후 화면을 열어 마이그레이션 완료를 보장한다. */
export function initializeDatabase(userId = activeAccount) {
    // UTF-16 코드 단위의 고정 길이 인코딩: 경로 문자를 배제하고 계정 간 충돌을 막는다.
    if (userId !== undefined && (!userId.trim() || userId.length > 128)) throw new Error('계정 ID를 확인해 주세요.');
    const name = userId === undefined ? 'dokpamine.db' : `dokpamine-account-${Array.from({ length: userId.length }, (_, i) => userId.charCodeAt(i).toString(16).padStart(4, '0')).join('')}.db`;
    let initialization = initializations.get(name);
    if (!initialization) {
        initialization = openDatabaseAsync(name).then(async sqlite => {
            try {
                const prepared = await prepareRecordDatabase(sqlite);
                return prepared;
            } catch (error) {
                await sqlite.closeAsync();
                throw error;
            }
        }).catch(error => {
            initializations.delete(name);
            throw error;
        });
        initializations.set(name, initialization);
    }
    return initialization;
}

/** 인증된 계정의 마이그레이션을 완료한 후에만 기본 저장소를 전환한다. */
export async function prepareRecordAccount(userId: string): Promise<void> {
    await initializeDatabase(userId);
    activeAccount = userId;
}
