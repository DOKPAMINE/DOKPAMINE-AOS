import { booksNeedingCovers, fillMissingCovers } from '../coverRefreshRules';

const isbn = '9780306406157';
const base = { id: 'a', isbn, deleted: false, coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null };

test('FR-01 S-30 ISBN이 있고 표지나 책등이 빈 책만 고르고 삭제·시도한 책은 빼요', () => {
    const books = [
        base,
        { ...base, id: 'full', coverUrl: 'https://c', sideCoverUrl: 'https://s' },
        { ...base, id: 'side-missing', coverUrl: 'https://c' },
        { ...base, id: 'no-isbn', isbn: null },
        { ...base, id: 'bad-isbn', isbn: '123' },
        { ...base, id: 'deleted', deleted: true },
        { ...base, id: 'tried' },
    ];
    expect(booksNeedingCovers(books, new Set(['tried'])).map(book => book.id)).toEqual(['a', 'side-missing']);
    expect(booksNeedingCovers(books, new Set(), 1).map(book => book.id)).toEqual(['a']);
});

test('FR-01 S-30 같은 ISBN 조회 결과로 빈 칸만 채우고 있는 값은 바꾸지 않아요', () => {
    const result = { isbn: '0-306-40615-2', coverUrl: 'https://new-c', sideCoverUrl: 'https://new-s', yes24ProductUrl: 'https://p' };
    expect(fillMissingCovers(base, result)).toEqual({ coverUrl: 'https://new-c', sideCoverUrl: 'https://new-s', yes24ProductUrl: 'https://p' });
    expect(fillMissingCovers({ ...base, coverUrl: 'https://old-c' }, result)).toEqual({ sideCoverUrl: 'https://new-s', yes24ProductUrl: 'https://p' });
});

test('FR-01 S-30 다른 ISBN 결과나 채울 값이 없거나 ISBN이 없으면 바꾸지 않아요', () => {
    expect(fillMissingCovers(base, { isbn: '9788966260959', coverUrl: 'https://x' })).toBeNull();
    expect(fillMissingCovers(base, { isbn, coverUrl: null, sideCoverUrl: null })).toBeNull();
    expect(fillMissingCovers({ ...base, isbn: null }, { isbn, coverUrl: 'https://x' })).toBeNull();
});
