import { catalogIsbn } from '../../../api/endpoints';
import { isOnline } from '../../../api/connectivity';
import { prepareRecordDatabase } from '../../../db/client';
import { memorySQLite } from '../../../db/__tests__/sqliteAdapter';
import { lookupBook, saveNewBook } from '../service';
import { bookAddSchema, emptyBookValues } from '../validation';

jest.mock('../../../api/endpoints', () => ({ catalogIsbn: jest.fn() }));
jest.mock('../../../api/connectivity', () => ({ isOnline: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../../sync/runtime', () => ({ startRecordSync: jest.fn() }));

const values = { ...emptyBookValues, title: '데미안', author: '헤르만 헤세', totalPages: '240', genre: '소설', isbn: '9780306406157' };
const id1 = '00000000-0000-4000-8000-000000000001';
const id2 = '00000000-0000-4000-8000-000000000002';
beforeEach(() => jest.clearAllMocks());

test('FR-01 · S-25 같은 ISBN을 다시 등록하면 실제 DB에 중복 행이 생기지 않아요', async () => {
    const memory = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(memory.sqlite);
        const changed = jest.fn();
        repository.subscribe(changed);
        expect(saveNewBook(repository.books, values, 'WANT', id1).kind).toBe('saved');
        const second = saveNewBook(repository.books, { ...values, isbn: '0-306-40615-2' }, 'READING', id2);
        expect(second).toMatchObject({ kind: 'duplicate', book: { id: id1, status: 'WANT', syncPending: true, currentPage: 0 } });
        expect(repository.books.list()).toHaveLength(1);
        expect(changed).toHaveBeenCalledTimes(1);
    } finally { memory.connection.close(); }
});
test('FR-17 · S-22 읽기 시작과 읽고 싶은 책은 기기에 해당 상태로 저장돼요', async () => {
    const memory = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(memory.sqlite);
        const result = saveNewBook(repository.books, { ...values, isbn: '' }, 'READING', id1);
        expect(result.book).toMatchObject({ id: id1, status: 'READING', isbn: null, syncPending: true, completedCount: 0 });
        expect(result.book.localVersion).toBeGreaterThan(0);
    } finally { memory.connection.close(); }
});
test('FR-01 · S-25 삭제한 책의 ISBN으로 새 책을 등록할 수 있어요', async () => {
    const memory = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(memory.sqlite);
        saveNewBook(repository.books, values, 'WANT', id1);
        repository.books.softDelete(id1);
        expect(saveNewBook(repository.books, values, 'WANT', id2).kind).toBe('saved');
        expect(repository.books.list()).toHaveLength(1);
        expect(repository.books.get(id1, true)?.deleted).toBe(true);
    } finally { memory.connection.close(); }
});
test('NFR-06 · S-22 오프라인이면 ISBN API를 호출하지 않아요', async () => {
    jest.mocked(isOnline).mockResolvedValue(false);
    await expect(lookupBook(values.isbn)).rejects.toMatchObject({ kind: 'offline' });
    expect(catalogIsbn).not.toHaveBeenCalled();
});
test('FR-01 · S-22 조회 결과의 빈 필드는 직접 입력으로 보완하도록 남겨 둬요', async () => {
    jest.mocked(isOnline).mockResolvedValue(true);
    jest.mocked(catalogIsbn).mockResolvedValue({ isbn: values.isbn, title: '데미안', source: 'nlk', genre: '미분류' });
    expect(await lookupBook(values.isbn)).toMatchObject({ isbn: values.isbn, title: '데미안', author: '', totalPages: '', genre: '' });
    expect(catalogIsbn).toHaveBeenCalledWith(values.isbn);
});
test('FR-01 · S-23 필수 정보와 목록에 없는 장르로는 저장하지 않아요', () => {
    expect(bookAddSchema.safeParse(emptyBookValues).success).toBe(false);
    expect(bookAddSchema.safeParse({ ...values, genre: '자유 장르' }).success).toBe(false);
    expect(bookAddSchema.safeParse(values).success).toBe(true);
});
