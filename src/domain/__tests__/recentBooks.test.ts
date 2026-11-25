import { maxRecentBooks, parseRecentBooks, pushRecentBook, recentBookLabel, recentBooksStorageKey, removeRecentBook, type RecentBook } from '../recentBooks';

const book = (i: number, extra: Partial<RecentBook> = {}): RecentBook => ({
    query: '데미안', bookKey: `text:book-${i}`, bookTitle: `데미안 ${i}`, bookAuthor: '헤르만 헤세', cover: { uri: null, genre: '소설' }, ...extra,
});
const keys = (books: RecentBook[]) => books.map(item => item.bookKey);

test('#124 S-70 S-71 고른 책은 맨 위에 두고 최근 순으로 최대 5권만 남겨요', () => {
    expect(maxRecentBooks).toBe(5);
    let books: RecentBook[] = [];
    for (const i of [1, 2, 3, 4, 5, 6]) books = pushRecentBook(books, book(i));
    expect(keys(books)).toEqual(['text:book-6', 'text:book-5', 'text:book-4', 'text:book-3', 'text:book-2']);
});

test('#124 S-70 S-71 같은 책(bookKey)을 다시 고르면 하나만 남기고 새 정보로 맨 위에 올려요', () => {
    const books = [book(1), book(2), book(3)];
    const next = pushRecentBook(books, book(3, { query: '데미', cover: { uri: 'https://image.example.com/3.jpg', genre: '소설' } }));
    expect(keys(next)).toEqual(['text:book-3', 'text:book-1', 'text:book-2']);
    expect(next[0]).toMatchObject({ query: '데미', cover: { uri: 'https://image.example.com/3.jpg' } });
    // 원래 목록은 바꾸지 않는다.
    expect(keys(books)).toEqual(['text:book-1', 'text:book-2', 'text:book-3']);
});

test('#124 S-70 S-71 책 한 권을 지우면 나머지 순서는 그대로예요', () => {
    expect(keys(removeRecentBook([book(1), book(2), book(3)], 'text:book-2'))).toEqual(['text:book-1', 'text:book-3']);
    expect(keys(removeRecentBook([book(1)], 'text:none'))).toEqual(['text:book-1']);
});

test.each([null, undefined, '', '깨진 값', '{}', '"문자열"'])('#124 저장된 값이 %p이면 빈 목록이에요', raw => {
    expect(parseRecentBooks(raw)).toEqual([]);
});

test('#124 저장된 값에서 모양이 맞지 않는 항목은 버리고 같은 책은 앞의 것만, 최대 5권만 읽어요', () => {
    const raw = JSON.stringify([
        book(1),
        { ...book(2), bookKey: '' },
        { ...book(3), bookTitle: 3 },
        { ...book(4), cover: null },
        book(1, { bookTitle: '나중 것' }),
        { ...book(5), cover: { uri: '  ', genre: '' } },
        book(6), book(7), book(8), book(9),
    ]);
    const books = parseRecentBooks(raw);
    expect(keys(books)).toEqual(['text:book-1', 'text:book-5', 'text:book-6', 'text:book-7', 'text:book-8']);
    expect(books[0].bookTitle).toBe('데미안 1');
    // 비어 있는 표지 주소는 기본 표지(null)로, 비어 있는 장르는 '기타'로 읽는다.
    expect(books[1].cover).toEqual({ uri: null, genre: '기타' });
});

test('#124 저장 키는 계정마다 다르고 특수 문자를 넣지 않아요', () => {
    const a = recentBooksStorageKey('user-a');
    expect(a).not.toBe(recentBooksStorageKey('user-b'));
    expect(a).toBe(recentBooksStorageKey('user-a'));
    expect(recentBooksStorageKey('a/../b:c')).toMatch(/^dokpamine\.lounge\.recentBooks\.[0-9a-f]+$/);
});

test('#124 스크린리더는 최근 고른 책을 "제목, 저자"로 읽고 비어 있는 저자는 건너뛰어요', () => {
    expect(recentBookLabel(book(1))).toBe('데미안 1, 헤르만 헤세');
    expect(recentBookLabel(book(1, { bookAuthor: ' ' }))).toBe('데미안 1');
});
