import { DAY_MS, kstDate, parseDate } from './kstDate';
import { pagesRead, type ReadingSession, type StatisticsBook } from './readingTypes';

export interface GroupStat {
    readonly label: string;
    readonly seconds: number;
    readonly pages: number;
}

export interface MonthlyStats {
    readonly month: string;
    readonly totalSeconds: number;
    readonly totalPages: number;
    readonly completedBooks: number;
    readonly sessionCount: number;
    readonly byGenre: readonly GroupStat[];
    readonly byAuthor: readonly GroupStat[];
}

function requireDate(date: string): number {
    const ms = parseDate(date);
    if (ms === null) throw new RangeError('날짜는 YYYY-MM-DD 형식의 유효한 날짜여야 해요.');
    return ms;
}

function requireMonth(month: string): void {
    if (!/^\d{4}-\d{2}$/.test(month) || parseDate(`${month}-01`) === null) {
        throw new RangeError('월은 YYYY-MM 형식의 유효한 월이어야 해요.');
    }
}

/** S-60: 중복 파라미터와 잘못된 날짜는 무시하고 KST 오늘을 연다. */
export function calendarDate(date: string | string[] | undefined, now: number): string {
    return typeof date === 'string' && parseDate(date) !== null ? date : kstDate(now);
}

/** S-60: 월을 이동해도 선택한 일자를 유지하며 짧은 달에서는 말일을 선택한다. */
export function moveCalendarMonth(date: string, direction: -1 | 1): string {
    const ms = requireDate(date);
    const first = new Date(ms);
    first.setUTCDate(1);
    first.setUTCMonth(first.getUTCMonth() + direction);
    // 라우트가 받는 네 자리 연도의 경계를 넘어가지 않는다.
    if (first.getUTCFullYear() < 0 || first.getUTCFullYear() > 9999) return date;
    const last = new Date(first);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    first.setUTCDate(Math.min(Number(date.slice(8)), last.getUTCDate()));
    return first.toISOString().slice(0, 10);
}

/** S-60: 일요일 시작의 주 행. 인접 월은 선택할 수 없는 빈 칸으로 둔다. */
export function calendarWeeks(month: string): (number | null)[][] {
    requireMonth(month);
    const first = new Date(requireDate(`${month}-01`));
    const last = new Date(first);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    const offset = first.getUTCDay();
    return Array.from({ length: Math.ceil((offset + last.getUTCDate()) / 7) }, (_, week) =>
        Array.from({ length: 7 }, (_, weekday) => {
            const day = week * 7 + weekday - offset + 1;
            return day >= 1 && day <= last.getUTCDate() ? day : null;
        }));
}

export function calendarDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

/** FR-05 / S-60: 시작한 날(KST)에 기록 전체를 귀속한다. 삭제 tombstone은 집계하지 않는다. booksReadOn이 그날 세션을 고를 때 쓴다. */
export function sessionsOn(sessions: readonly ReadingSession[], date: string): ReadingSession[] {
    requireDate(date);
    return sessions.filter(session => !session.deleted && kstDate(session.startedAt) === date);
}

export function readingDays(sessions: readonly ReadingSession[], month: string): Set<number> {
    requireMonth(month);
    return new Set(sessions.filter(session => !session.deleted && kstDate(session.startedAt).startsWith(`${month}-`))
        .map(session => Number(kstDate(session.startedAt).slice(8))));
}

/** FR-05 / S-10: 하루 합계 1분 이상. 오늘 기록이 없으면 어제까지의 연속일을 센다. */
export function streakDays(sessions: readonly ReadingSession[], today: string): number {
    const todayMs = requireDate(today);
    const secondsByDay = new Map<string, number>();
    sessions.filter(session => !session.deleted).forEach(session => {
        const day = kstDate(session.startedAt);
        secondsByDay.set(day, (secondsByDay.get(day) ?? 0) + session.activeSeconds);
    });
    const qualifies = (ms: number) => (secondsByDay.get(new Date(ms).toISOString().slice(0, 10)) ?? 0) >= 60;
    let day = qualifies(todayMs) ? todayMs : todayMs - DAY_MS;
    let count = 0;
    while (qualifies(day)) {
        count++;
        day -= DAY_MS;
    }
    return count;
}

/** FR-05 / S-10: KST 월요일부터 오늘까지 개인 독서 시간. MANUAL 포함, 랭킹 상한을 적용하지 않는다. */
export function thisWeekSeconds(sessions: readonly ReadingSession[], today: string): number {
    const dayMs = requireDate(today);
    const mondayMs = dayMs - ((new Date(dayMs).getUTCDay() + 6) % 7) * DAY_MS;
    const monday = new Date(mondayMs).toISOString().slice(0, 10);
    return sessions.filter(session => {
        const day = kstDate(session.startedAt);
        return !session.deleted && day >= monday && day <= today;
    }).reduce((sum, session) => sum + session.activeSeconds, 0);
}

/** FR-06 / S-62: KST 월간 개인 집계. 완독 권수는 completedAt의 책 수이며 회차는 세지 않는다. */
export function monthlyStats(sessions: readonly ReadingSession[], books: readonly StatisticsBook[], month: string): MonthlyStats {
    requireMonth(month);
    const inMonth = sessions.filter(session => !session.deleted && kstDate(session.startedAt).startsWith(`${month}-`));
    const bookById = new Map(books.filter(book => !book.deleted).map(book => [book.id, book]));
    const groupBy = (key: 'genre' | 'author'): GroupStat[] => {
        const groups = new Map<string, { seconds: number; pages: number }>();
        inMonth.forEach(session => {
            const label = bookById.get(session.bookId)?.[key] ?? '기타';
            const previous = groups.get(label) ?? { seconds: 0, pages: 0 };
            groups.set(label, { seconds: previous.seconds + session.activeSeconds, pages: previous.pages + pagesRead(session) });
        });
        return [...groups].map(([label, stat]) => ({ label, ...stat })).sort((a, b) => b.seconds - a.seconds);
    };
    return {
        month, totalSeconds: inMonth.reduce((sum, session) => sum + session.activeSeconds, 0),
        totalPages: inMonth.reduce((sum, session) => sum + pagesRead(session), 0),
        completedBooks: [...bookById.values()].filter(book => book.completedAt !== null && kstDate(book.completedAt).startsWith(`${month}-`)).length,
        sessionCount: inMonth.length, byGenre: groupBy('genre'), byAuthor: groupBy('author'),
    };
}

/** S-60: 날짜 칸에 함께 보여 줄 수 있는 표지 수. 나머지는 "+남은 권수"로 표시한다. */
export const MAX_DAY_COVERS = 2;

export interface CalendarDayBook {
    readonly bookId: string;
    /** 그날(KST) 이 책을 읽은 시간 합계 */
    readonly seconds: number;
    /** 그날 이 책의 가장 이른 세션 시작 시각 */
    readonly firstStartedAt: number;
}

/**
 * FR-05 / S-60: 그날(KST) 읽은 책 목록. 읽은 시간이 긴 책부터, 같으면 먼저 시작한 책부터 둔다.
 * 삭제된 세션과 삭제된 책(tombstone)의 세션은 제외하고, 목록에 없는 책은 남겨 화면이 기본 표지로 보여 준다.
 */
export function booksReadOn(
    sessions: readonly ReadingSession[], books: readonly Pick<StatisticsBook, 'id' | 'deleted'>[], date: string,
): CalendarDayBook[] {
    const deletedBooks = deletedBookIds(books);
    return rankDayBooks(sessionsOn(sessions, date).filter(session => !deletedBooks.has(session.bookId)));
}

/**
 * FR-05 / S-60·S-61: 한 달(KST)의 날짜(YYYY-MM-DD)별 읽은 책 목록. 날짜 칸마다 전체 세션을 다시 거르지 않도록
 * 세션을 한 번만 훑어 묶는다. 각 날짜의 결과는 booksReadOn과 같고, 기록이 없는 날은 키가 없다.
 * 달력 날짜 칸의 표지와 날짜별 기록의 책 줄(책별 총 시간 seconds)이 같은 결과를 써서 순서가 어긋나지 않는다.
 */
export function booksReadByDate(
    sessions: readonly ReadingSession[], books: readonly Pick<StatisticsBook, 'id' | 'deleted'>[], month: string,
): Map<string, CalendarDayBook[]> {
    requireMonth(month);
    const deletedBooks = deletedBookIds(books);
    const byDate = new Map<string, ReadingSession[]>();
    sessions.forEach(session => {
        if (session.deleted || deletedBooks.has(session.bookId)) return;
        const date = kstDate(session.startedAt);
        if (!date.startsWith(`${month}-`)) return;
        const list = byDate.get(date);
        if (list) list.push(session); else byDate.set(date, [session]);
    });
    return new Map([...byDate].map(([date, list]) => [date, rankDayBooks(list)]));
}

function deletedBookIds(books: readonly Pick<StatisticsBook, 'id' | 'deleted'>[]): Set<string> {
    return new Set(books.filter(book => book.deleted).map(book => book.id));
}

/** 같은 날 세션을 책별로 합쳐 읽은 시간이 긴 순 → 먼저 시작한 순 → 책 ID 순으로 둔다. */
function rankDayBooks(sessions: readonly ReadingSession[]): CalendarDayBook[] {
    const byBook = new Map<string, { seconds: number; firstStartedAt: number }>();
    sessions.forEach(session => {
        const previous = byBook.get(session.bookId);
        byBook.set(session.bookId, previous
            ? { seconds: previous.seconds + session.activeSeconds, firstStartedAt: Math.min(previous.firstStartedAt, session.startedAt) }
            : { seconds: session.activeSeconds, firstStartedAt: session.startedAt });
    });
    return [...byBook].map(([bookId, stat]) => ({ bookId, ...stat }))
        .sort((a, b) => b.seconds - a.seconds || a.firstStartedAt - b.firstStartedAt || (a.bookId < b.bookId ? -1 : a.bookId > b.bookId ? 1 : 0));
}

/** S-60: 앞에서부터 최대 2권의 표지를 보여 주고 나머지 권수를 센다(3권이면 +1, 5권이면 +3). */
export function dayCovers<T>(books: readonly T[]): { readonly shown: readonly T[]; readonly remaining: number } {
    return { shown: books.slice(0, MAX_DAY_COVERS), remaining: Math.max(0, books.length - MAX_DAY_COVERS) };
}
