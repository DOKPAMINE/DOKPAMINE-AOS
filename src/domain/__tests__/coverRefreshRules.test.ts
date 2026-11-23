import { booksNeedingCatalog, fillFromCatalog } from '../coverRefreshRules';

const isbn = '9780306406157';
const cover = { id: 'a', isbn, deleted: false, catalogPending: false, coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null};
const book = { ...cover, title: '대충 쓴 제목', author: '작가', publisher: null, totalPages: 100, genre: '기타' as const };
const result = {
    isbn: '0-306-40615-2', title: '데미안', author: '헤르만 헤세', publisher: '민음사', totalPages: 240, genre: 'SF',
    coverUrl: 'https://new-c', sideCoverUrl: 'https://new-s', yes24ProductUrl: 'https://p',
};

test('FR-01 S-30 ISBN이 있고 조회 대기이거나 표지·책등이 빈 책만 고르고 삭제·시도한 책은 빼요', () => {
    const books = [
        cover,
        { ...cover, id: 'full', coverUrl: 'https://c', sideCoverUrl: 'https://s' },
        { ...cover, id: 'pending', coverUrl: 'https://c', sideCoverUrl: 'https://s', catalogPending: true },
        { ...cover, id: 'side-missing', coverUrl: 'https://c' },
        { ...cover, id: 'no-isbn', isbn: null, catalogPending: true },
        { ...cover, id: 'bad-isbn', isbn: '123' },
        { ...cover, id: 'deleted', deleted: true },
        { ...cover, id: 'tried' },
    ];
    expect(booksNeedingCatalog(books, new Set(['tried'])).map(item => item.id)).toEqual(['a', 'pending', 'side-missing']);
    expect(booksNeedingCatalog(books, new Set(), 1).map(item => item.id)).toEqual(['a']);
});

test('FR-01 S-30 조회 대기가 아닌 책은 빈 표지·책등만 채우고 책 정보는 그대로 둬요', () => {
    expect(fillFromCatalog(book, result)).toEqual({
        changes: { coverUrl: 'https://new-c', sideCoverUrl: 'https://new-s', yes24ProductUrl: 'https://p' }, infoUpdated: false,
    });
    expect(fillFromCatalog({ ...book, coverUrl: 'https://old-c' }, result)?.changes).toEqual({ sideCoverUrl: 'https://new-s', yes24ProductUrl: 'https://p' });
});

test('FR-01 NFR-06 조회 대기 책은 제목·저자·출판사·쪽수·장르를 덮어쓰고 조회 대기를 풀어요', () => {
    expect(fillFromCatalog({ ...book, catalogPending: true }, result, 84)).toEqual({
        changes: {
            coverUrl: 'https://new-c', sideCoverUrl: 'https://new-s', yes24ProductUrl: 'https://p',
            title: '데미안', author: '헤르만 헤세', publisher: '민음사', totalPages: 240, genre: '소설/시', catalogPending: false,
        },
        infoUpdated: true,
    });
});

test('FR-01 D7 조회 결과가 빈 항목은 유지하고 읽은 쪽보다 작은 쪽수는 바꾸지 않아요', () => {
    const partial = { isbn, title: ' ', author: null, totalPages: 120, genre: '여행' };
    expect(fillFromCatalog({ ...book, catalogPending: true }, partial, 150)).toEqual({ changes: { catalogPending: false }, infoUpdated: false });
});

test('FR-01 S-30 다른 ISBN 결과나 ISBN이 없는 책, 바꿀 값이 없으면 바꾸지 않아요', () => {
    expect(fillFromCatalog({ ...book, catalogPending: true }, { ...result, isbn: '9788966260959' })).toBeNull();
    expect(fillFromCatalog({ ...book, isbn: null, catalogPending: true }, result)).toBeNull();
    expect(fillFromCatalog(book, { isbn, coverUrl: null, sideCoverUrl: null })).toBeNull();
});
