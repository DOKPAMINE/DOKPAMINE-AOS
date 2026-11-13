import { validateBook } from './bookRules';
import { GENRES, parseInteger, type Genre } from './pageRules';

type ShelfBook = { id: string; title: string; genre: Genre; deleted: boolean };
type ReadingBook = { status: 'WANT' | 'READING' | 'DONE'; currentPage: number; totalPages: number; completedCount: number; completedAt: number | null };

/** FR-04 / S-30: 삭제된 책은 제외하고 고정 장르 순서로 책장을 만든다. */
export function groupShelfBooks<T extends ShelfBook>(books: readonly T[]) {
    return GENRES.map(genre => ({ genre, books: books.filter(book => !book.deleted && book.genre === genre) }))
        .filter(group => group.books.length > 0);
}

export type ShelfStatus = ReadingBook['status'];

/** FR-04·FR-17 / S-30: 삭제된 책을 빼고 상태별 권수를 센다. */
export function countShelfStatuses<T extends { status: ShelfStatus; deleted: boolean }>(books: readonly T[]) {
    const counts: Record<ShelfStatus, number> = { READING: 0, DONE: 0, WANT: 0 };
    for (const book of books) if (!book.deleted) counts[book.status] += 1;
    return counts;
}

/** FR-04 / S-30: 필터가 없으면 모든 책, 있으면 그 상태의 책만 남긴다. */
export function filterShelfBooks<T extends { status: ShelfStatus }>(books: readonly T[], filter: ShelfStatus | null) {
    return filter === null ? books : books.filter(book => book.status === filter);
}

/** S-30: 선택된 필터를 다시 누르면 선택을 풀고, 다른 필터를 누르면 그쪽으로 옮긴다. */
export function toggleShelfFilter(current: ShelfStatus | null, pressed: ShelfStatus): ShelfStatus | null {
    return current === pressed ? null : pressed;
}
/** FR-04 / S-30: 삭제된 책을 빼고, 책이 있는 장르만 고정 장르 순서로 권수를 센다. */
export function countShelfGenres<T extends { genre: Genre; deleted: boolean }>(books: readonly T[]) {
    return GENRES.map(genre => ({ genre, count: books.filter(book => !book.deleted && book.genre === genre).length }))
        .filter(item => item.count > 0);
}

/** FR-04 / S-30: 장르를 고르지 않으면 모든 책, 고르면 그 장르의 책만 남긴다. */
export function filterShelfGenre<T extends { genre: Genre }>(books: readonly T[], genre: Genre | null) {
    return genre === null ? books : books.filter(book => book.genre === genre);
}
/** FR-17·PRD D7 / S-32·S-33: 다시 읽어도 지난 쪽과 기존 기록은 보존한다. */
export function beginReading<T extends ReadingBook>(book: T): Omit<T, 'status'> & { status: 'READING' } {
    return { ...book, status: 'READING' as const };
}

/** FR-04 / S-31: 이미 완독한 책의 중복 완독은 누적하지 않는다. */
export function completeReading<T extends ReadingBook>(book: T, now: number): Omit<T, keyof ReadingBook> & ReadingBook {
    return book.status === 'DONE' ? book : {
        ...book, status: 'DONE' as const, currentPage: book.totalPages,
        completedAt: now, completedCount: book.completedCount + 1,
    };
}

export interface BookEditFields { title: string; author: string; publisher: string; totalPages: string; genre: Genre }

export class BookEditError extends Error {
    constructor(readonly field: keyof BookEditFields, message: string) { super(message); }
}

/** FR-01 / S-34: 현재 쪽보다 작은 전체 쪽수는 조용히 보정하지 않고 거부한다. */
export function parseBookEdit(fields: BookEditFields, previous: Pick<ReadingBook, 'currentPage' | 'totalPages' | 'status'>) {
    const { currentPage, status } = previous;
    const totalPages = parseInteger(fields.totalPages);
    if (totalPages === null || totalPages < 1) throw new BookEditError('totalPages', '전체 쪽수는 1 이상의 정수로 입력해 주세요.');
    if (totalPages < currentPage) throw new BookEditError('totalPages', `전체 쪽수는 현재 읽은 ${currentPage}쪽 이상으로 입력해 주세요.`);
    // PRD D7: 읽은 쪽을 새 전체 쪽수로 임의 증가시키지 않는다. 상태 전환을 먼저 명시적으로 선택한다.
    if (status === 'DONE' && totalPages > previous.totalPages) throw new BookEditError('totalPages', '완독한 책의 전체 쪽수를 늘리려면 다시 읽기를 시작한 뒤 편집해 주세요.');
    const title = fields.title.trim();
    const author = fields.author.trim();
    if (!title || title.length > 200) throw new BookEditError('title', '제목은 1~200자로 입력해 주세요.');
    if (!author || author.length > 100) throw new BookEditError('author', '저자는 1~100자로 입력해 주세요.');
    if (fields.publisher.trim().length > 100) throw new BookEditError('publisher', '출판사는 100자 이내로 입력해 주세요.');
    validateBook({ title, author, totalPages, currentPage });
    if (!GENRES.includes(fields.genre)) throw new BookEditError('genre', '목록에서 장르를 선택해 주세요.');
    return { title, author, publisher: fields.publisher.trim() || null, totalPages, genre: fields.genre };
}

/** FR-04 / S-31: 삭제 기록을 제외한 누적 시간, 초 단위까지 보존해 표시한다. */
export function readingTimeLabel(sessions: readonly { activeSeconds: number; deleted: boolean }[]) {
    const seconds = sessions.filter(session => !session.deleted).reduce((sum, session) => sum + session.activeSeconds, 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return `${hours}시간 ${minutes}분 ${seconds % 60}초`;
}
