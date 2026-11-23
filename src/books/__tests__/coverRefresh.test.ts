import { prepareRecordDatabase } from '../../db/client';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import { refreshFromCatalog, resetCatalogRefresh } from '../coverRefresh';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../sync/runtime', () => ({ startRecordSync: jest.fn() }));
jest.mock('../../api/endpoints', () => ({ catalogIsbn: jest.fn() }));
jest.mock('../../api/connectivity', () => ({ isOnline: jest.fn() }));

const id1 = '00000000-0000-4000-8000-000000000001';
const id2 = '00000000-0000-4000-8000-000000000002';
const id3 = '00000000-0000-4000-8000-000000000003';
const base = {
    title: '데미안', author: '헤르만 헤세', publisher: null, totalPages: 240, genre: '소설/시' as const, status: 'READING' as const,
    currentPage: 84, completedCount: 0, completedAt: null, coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false,
};
const found = (isbn: string) => ({
    isbn, source: 'nlk' as const, title: '조회한 제목', author: '조회한 저자', publisher: '조회한 출판사', totalPages: 300, genre: '에세이',
    coverUrl: 'https://new', sideCoverUrl: 'https://side', yes24ProductUrl: 'https://p',
});

beforeEach(() => resetCatalogRefresh());

test('FR-01 NFR-06 S-30 조회 대기가 아닌 책은 빈 표지·책등만 채우고 책 정보는 그대로 둬요', async () => {
    const memory = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(memory.sqlite);
        repository.books.save({ ...base, id: id1, isbn: '9780306406157' });
        repository.books.save({ ...base, id: id2, isbn: null, title: 'ISBN 없는 책', catalogPending: true });
        repository.books.save({ ...base, id: id3, isbn: '9788966260959', coverUrl: 'https://old', sideCoverUrl: 'https://old-side' });
        const lookup = jest.fn(async (isbn: string) => found(isbn));
        expect(await refreshFromCatalog(repository, lookup, async () => true)).toEqual({ filled: 1, updatedTitles: [] });
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('9780306406157');
        expect(repository.books.get(id1)).toMatchObject({
            coverUrl: 'https://new', sideCoverUrl: 'https://side', yes24ProductUrl: 'https://p',
            title: '데미안', genre: '소설/시', totalPages: 240, currentPage: 84, syncPending: true,
        });
        expect(repository.books.get(id3)).toMatchObject({ coverUrl: 'https://old', sideCoverUrl: 'https://old-side' });
    } finally { memory.connection.close(); }
});

test('FR-01 NFR-06 S-23 조회 대기 책은 책 정보를 조회 결과로 바꾸고 기록의 쪽보다 작은 쪽수는 유지해요', async () => {
    const memory = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(memory.sqlite);
        repository.books.save({ ...base, id: id1, isbn: '9780306406157', title: '대충 쓴 제목', genre: '기타', catalogPending: true });
        repository.books.save({ ...base, id: id2, isbn: '9788966260959', title: '많이 읽은 책', totalPages: 400, catalogPending: true });
        repository.sessions.save({ id: id3, bookId: id2, startedAt: 1000, endedAt: 61000, activeSeconds: 60, startPage: 0, endPage: 350, source: 'MANUAL' });
        const lookup = jest.fn(async (isbn: string) => found(isbn));
        const result = await refreshFromCatalog(repository, lookup, async () => true);
        expect(result.updatedTitles).toEqual(['조회한 제목', '조회한 제목']);
        expect(repository.books.get(id1)).toMatchObject({
            title: '조회한 제목', author: '조회한 저자', publisher: '조회한 출판사', totalPages: 300, genre: '에세이',
            currentPage: 84, status: 'READING', catalogPending: false, syncPending: true,
        });
        expect(repository.books.get(id2)).toMatchObject({ title: '조회한 제목', totalPages: 400, catalogPending: false });
    } finally { memory.connection.close(); }
});

test('FR-01 NFR-06 오프라인이면 조회하지 않고 실패한 책은 같은 실행 동안 다시 조회하지 않아요', async () => {
    const memory = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(memory.sqlite);
        repository.books.save({ ...base, id: id1, isbn: '9780306406157', catalogPending: true });
        const lookup = jest.fn(async () => { throw new Error('책 정보 없음'); });
        expect(await refreshFromCatalog(repository, lookup, async () => false)).toEqual({ filled: 0, updatedTitles: [] });
        expect(lookup).not.toHaveBeenCalled();
        await refreshFromCatalog(repository, lookup, async () => true);
        await refreshFromCatalog(repository, lookup, async () => true);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(repository.books.get(id1)).toMatchObject({ coverUrl: null, catalogPending: true });
    } finally { memory.connection.close(); }
});
