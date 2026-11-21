import { prepareRecordDatabase } from '../../db/client';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import { refreshMissingCovers, resetCoverRefresh } from '../coverRefresh';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../sync/runtime', () => ({ startRecordSync: jest.fn() }));
jest.mock('../../api/endpoints', () => ({ catalogIsbn: jest.fn() }));
jest.mock('../../api/connectivity', () => ({ isOnline: jest.fn() }));

const id1 = '00000000-0000-4000-8000-000000000001';
const id2 = '00000000-0000-4000-8000-000000000002';
const id3 = '00000000-0000-4000-8000-000000000003';
const base = {
    title: '데미안', author: '헤르만 헤세', publisher: null, totalPages: 240, genre: '소설/시' as const, status: 'READING' as const,
    currentPage: 84, completedCount: 0, completedAt: null, coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null,
};

beforeEach(() => resetCoverRefresh());

test('FR-01 NFR-06 S-30 온라인이면 ISBN으로 다시 조회해 빈 표지·책등만 채우고 동기화 대기로 저장해요', async () => {
    const memory = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(memory.sqlite);
        repository.books.save({ ...base, id: id1, isbn: '9780306406157' });
        repository.books.save({ ...base, id: id2, isbn: null, title: 'ISBN 없는 책' });
        repository.books.save({ ...base, id: id3, isbn: '9788966260959', coverUrl: 'https://old', sideCoverUrl: 'https://old-side' });
        const lookup = jest.fn(async (isbn: string) => ({
            isbn, source: 'nlk' as const, title: '다른 제목', genre: '기타',
            coverUrl: 'https://new', sideCoverUrl: 'https://side', yes24ProductUrl: 'https://p',
        }));
        expect(await refreshMissingCovers(repository, lookup, async () => true)).toBe(1);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('9780306406157');
        expect(repository.books.get(id1)).toMatchObject({
            coverUrl: 'https://new', sideCoverUrl: 'https://side', yes24ProductUrl: 'https://p',
            title: '데미안', genre: '소설/시', currentPage: 84, syncPending: true,
        });
        expect(repository.books.get(id3)).toMatchObject({ coverUrl: 'https://old', sideCoverUrl: 'https://old-side' });
    } finally { memory.connection.close(); }
});

test('FR-01 NFR-06 오프라인이면 조회하지 않고 실패한 책은 같은 실행 동안 다시 조회하지 않아요', async () => {
    const memory = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(memory.sqlite);
        repository.books.save({ ...base, id: id1, isbn: '9780306406157' });
        const lookup = jest.fn(async () => { throw new Error('책 정보 없음'); });
        expect(await refreshMissingCovers(repository, lookup, async () => false)).toBe(0);
        expect(lookup).not.toHaveBeenCalled();
        expect(await refreshMissingCovers(repository, lookup, async () => true)).toBe(0);
        expect(await refreshMissingCovers(repository, lookup, async () => true)).toBe(0);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(repository.books.get(id1)?.coverUrl).toBeNull();
    } finally { memory.connection.close(); }
});
