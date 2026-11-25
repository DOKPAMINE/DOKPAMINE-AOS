/** #124 S-70·S-71: 최근 고른 책은 최근 순으로 최대 5권만 둔다. */
export const maxRecentBooks = 5;

/**
 * #124 S-70·S-71: 자동완성에서 고른 책 한 권. 기기에만 저장하고 서버로 보내지 않는다.
 * query는 그 책을 고른 자동완성 목록의 검색어로, 다시 누르면 S-71이 이 검색어 결과에서 bookKey 묶음을 찾는다.
 */
export interface RecentBook {
    query: string;
    bookKey: string;
    bookTitle: string;
    bookAuthor: string;
    cover: { uri: string | null; genre: string };
}

/** #124: 고른 책을 맨 위에 둔다. 같은 bookKey가 이미 있으면 그 자리에서 빼고 새 정보로 맨 위에 올린다. 최대 max권이다. */
export function pushRecentBook(books: readonly RecentBook[], book: RecentBook, max: number = maxRecentBooks): RecentBook[] {
    return [book, ...books.filter(item => item.bookKey !== book.bookKey)].slice(0, Math.max(0, max));
}

/** #124: bookKey 책 한 권을 지운다. 나머지 순서는 그대로다. */
export function removeRecentBook(books: readonly RecentBook[], bookKey: string): RecentBook[] {
    return books.filter(item => item.bookKey !== bookKey);
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isFilled = (value: unknown): value is string => isText(value) && value.trim().length > 0;

function toRecentBook(value: unknown): RecentBook | null {
    if (typeof value !== 'object' || value === null) return null;
    const item = value as Record<string, unknown>;
    const cover = typeof item.cover === 'object' && item.cover !== null ? item.cover as Record<string, unknown> : null;
    if (!isFilled(item.query) || !isFilled(item.bookKey) || !isFilled(item.bookTitle) || !isText(item.bookAuthor) || !cover) return null;
    const uri = isFilled(cover.uri) ? cover.uri : null;
    const genre = isFilled(cover.genre) ? cover.genre : '기타';
    return { query: item.query, bookKey: item.bookKey, bookTitle: item.bookTitle, bookAuthor: item.bookAuthor, cover: { uri, genre } };
}

/**
 * #124: 기기에 저장한 값을 읽는다. 없거나 깨졌으면 빈 목록이다. 모양이 맞지 않는 항목은 버리고,
 * 같은 bookKey는 앞의 것만 두며 최대 max권이다.
 */
export function parseRecentBooks(raw: string | null | undefined, max: number = maxRecentBooks): RecentBook[] {
    if (!raw) return [];
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return []; }
    if (!Array.isArray(value)) return [];
    const books: RecentBook[] = [];
    for (const entry of value) {
        const book = toRecentBook(entry);
        if (book && !books.some(item => item.bookKey === book.bookKey)) books.push(book);
        if (books.length >= max) break;
    }
    return books;
}

/** #124: 계정별 저장 키. 계정 ID를 UTF-16 코드 단위의 16진수로 바꿔 키에 특수 문자가 들어가지 않게 한다. */
export function recentBooksStorageKey(userId: string): string {
    const encoded = Array.from({ length: userId.length }, (_, i) => userId.charCodeAt(i).toString(16).padStart(4, '0')).join('');
    return `dokpamine.lounge.recentBooks.${encoded}`;
}

/** #124: 스크린리더가 읽는 최근 고른 책 항목. 화면 순서와 같게 제목, 저자로 읽고 비어 있는 저자는 건너뛴다. */
export function recentBookLabel(book: Pick<RecentBook, 'bookTitle' | 'bookAuthor'>): string {
    return [book.bookTitle.trim(), book.bookAuthor.trim()].filter(Boolean).join(', ');
}
