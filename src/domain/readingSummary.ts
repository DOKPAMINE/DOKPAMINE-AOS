import { genreOf, rankBars, recordedSessions } from './calendarRules';
import { DAY_MS, kstDate, parseDate } from './kstDate';
import type { ReadingSession, StatisticsBook } from './readingTypes';

/** S-80 연속 독서일. current는 오늘(없으면 어제)까지 이어진 날 수, best는 전체 기간 중 가장 긴 연속 일수다. */
export interface ReadingStreak {
    readonly current: number;
    readonly best: number;
}

/** S-80 장르별 막대 한 줄. ratio는 가장 많이 읽은 장르를 1로 둔 막대 길이(0~1)다. */
export interface GenreBookCount {
    readonly label: string;
    readonly books: number;
    readonly ratio: number;
}

/** S-80 누적 기록 "지금까지" */
export interface ReadingTotals {
    readonly totalSeconds: number;
    /** 기록이 한 번이라도 있는 서로 다른 책 수 */
    readonly booksReadCount: number;
    /** 삭제되지 않은 책 중 완독 시각(completedAt)이 있는 책 수. 회차는 세지 않는다. */
    readonly completedBooks: number;
    readonly byGenre: readonly GenreBookCount[];
}

/**
 * FR-10 / S-80: 기록이 있는 날(KST, 시작한 날 기준)을 읽은 날로 보고 연속 일수를 센다.
 * 읽은 날의 기준은 캘린더(recordedSessions: 삭제된 세션·삭제된 책 제외)와 같다.
 * 오늘 기록이 없어도 어제까지 이어졌으면 어제까지의 연속을 유지하고, 어제와 오늘 모두 없으면 0이다.
 */
export function readingStreak(
    sessions: readonly ReadingSession[], books: readonly Pick<StatisticsBook, 'id' | 'deleted'>[], today: string,
): ReadingStreak {
    const todayMs = parseDate(today);
    if (todayMs === null) throw new RangeError('날짜는 YYYY-MM-DD 형식의 유효한 날짜여야 해요.');
    const days = new Set(recordedSessions(sessions, books).map(session => kstDate(session.startedAt)));
    const has = (ms: number) => days.has(new Date(ms).toISOString().slice(0, 10));

    let current = 0;
    for (let day = has(todayMs) ? todayMs : todayMs - DAY_MS; has(day); day -= DAY_MS) current++;

    let best = 0;
    let run = 0;
    let previous: number | null = null;
    for (const ms of [...days].map(day => parseDate(day)!).sort((a, b) => a - b)) {
        run = previous !== null && ms - previous === DAY_MS ? run + 1 : 1;
        best = Math.max(best, run);
        previous = ms;
    }
    return { current, best };
}

/**
 * FR-10 / S-80: 전체 기간 누적 기록. 세션 기준은 캘린더와 같고(recordedSessions),
 * 완독은 월간 통계(monthlyStats)의 기준을 전체 기간으로 넓힌 것이다.
 * 장르별 권수는 읽은 책을 한 번씩 세며, 책 정보를 찾을 수 없으면 '기타'로 묶는다.
 */
export function readingTotals(sessions: readonly ReadingSession[], books: readonly StatisticsBook[]): ReadingTotals {
    const recorded = recordedSessions(sessions, books);
    const bookById = new Map(books.filter(book => !book.deleted).map(book => [book.id, book]));
    const readBookIds = new Set(recorded.map(session => session.bookId));
    const counts = new Map<string, number>();
    readBookIds.forEach(bookId => {
        const label = genreOf(bookById, bookId);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return {
        totalSeconds: recorded.reduce((sum, session) => sum + session.activeSeconds, 0),
        booksReadCount: readBookIds.size,
        completedBooks: [...bookById.values()].filter(book => book.completedAt !== null).length,
        byGenre: rankBars(counts).map(({ label, value, ratio }) => ({ label, books: value, ratio })),
    };
}
