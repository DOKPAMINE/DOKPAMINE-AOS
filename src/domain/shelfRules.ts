import { validateBook } from './bookRules';
import { GENRES, parseInteger, type Genre } from './pageRules';

type ShelfBook = { id: string; title: string; genre: Genre; deleted: boolean };
type ReadingBook = { status: 'WANT' | 'READING' | 'DONE'; currentPage: number; totalPages: number; completedCount: number; completedAt: number | null };

/** FR-04 / S-30: 삭제된 책은 제외하고 고정 장르 순서로 책장을 만든다. */
export function groupShelfBooks<T extends ShelfBook>(books: readonly T[]) {
    return GENRES.map(genre => ({ genre, books: books.filter(book => !book.deleted && book.genre === genre) }))
        .filter(group => group.books.length > 0);
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

/** FR-01 / S-34: 현재 쪽보다 작은 전체 쪽수는 조용히 보정하지 않고 거부한다. */
export function parseBookEdit(fields: BookEditFields, previous: Pick<ReadingBook, 'currentPage' | 'totalPages' | 'status'>) {
    const { currentPage, status } = previous;
    const totalPages = parseInteger(fields.totalPages);
    if (totalPages === null || totalPages < 1) throw new Error('전체 쪽수는 1 이상의 정수로 입력해 주세요.');
    if (totalPages < currentPage) throw new Error(`전체 쪽수는 현재 읽은 ${currentPage}쪽 이상으로 입력해 주세요.`);
    // PRD D7: 읽은 쪽을 새 전체 쪽수로 임의 증가시키지 않는다. 상태 전환을 먼저 명시적으로 선택한다.
    if (status === 'DONE' && totalPages > previous.totalPages) throw new Error('완독한 책의 전체 쪽수를 늘리려면 다시 읽기를 시작한 뒤 편집해 주세요.');
    const title = fields.title.trim();
    const author = fields.author.trim();
    validateBook({ title, author, totalPages, currentPage });
    if (!GENRES.includes(fields.genre)) throw new Error('목록에서 장르를 선택해 주세요.');
    return { title, author, publisher: fields.publisher.trim() || null, totalPages, genre: fields.genre };
}

/** FR-04 / S-31: 삭제 기록을 제외한 누적 시간, 초 단위까지 보존해 표시한다. */
export function readingTimeLabel(sessions: readonly { activeSeconds: number; deleted: boolean }[]) {
    const seconds = sessions.filter(session => !session.deleted).reduce((sum, session) => sum + session.activeSeconds, 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return `${hours}시간 ${minutes}분 ${seconds % 60}초`;
}
