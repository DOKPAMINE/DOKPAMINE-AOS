import {
    booksReadByDate, booksReadOn, calendarClock, calendarDate, calendarDuration, calendarWeeks, dayCovers, monthlyStats,
    moveCalendarMonth, readingDays, sessionsOn, streakDays, thisWeekSeconds,
} from '../calendarRules';
import { parseStartedAt } from '../kstDate';
import { toManualSession, validateManualSession } from '../manualSessionRules';
import type { ReadingSession, StatisticsBook } from '../readingTypes';

const at = (day: string) => parseStartedAt(day, '12:00')!;
const session = (day: string, seconds = 600, changes: Partial<ReadingSession> = {}): ReadingSession => ({
    id: `${day}-${seconds}`, bookId: 'book', startedAt: at(day), endedAt: at(day) + seconds * 1000,
    activeSeconds: seconds, startPage: 0, endPage: null, source: 'TIMER', deleted: false,
    createdAt: at(day), syncPending: true, localVersion: at(day), ...changes,
});
const book = (id: string, genre: string, author = `작가 ${id}`, changes: Partial<StatisticsBook> = {}): StatisticsBook => ({
    id, genre, author, completedAt: null, deleted: false, ...changes,
});

test('FR-05 S-60 S-61 날짜별 기록과 읽은 날은 중복 날짜를 합치고 삭제 기록을 제외해요', () => {
    const list = [session('2026-10-01'), session('2026-10-01', 1200), session('2026-10-03'), session('2026-10-02', 600, { deleted: true }), session('2026-11-01')];
    expect(readingDays(list, '2026-10')).toEqual(new Set([1, 3]));
    expect(sessionsOn(list, '2026-10-01')).toHaveLength(2);
    expect(sessionsOn(list, '2026-10-02')).toEqual([]);
});
test('FR-05 FR-06 S-60 S-62 KST 자정과 월 경계는 시작 시각으로 집계해요', () => {
    const before = session('2026-10-31', 600, { startedAt: Date.parse('2026-10-31T14:59:59Z') });
    const after = session('2026-11-01', 1200, { startedAt: Date.parse('2026-10-31T15:00:00Z') });
    expect(sessionsOn([before, after], '2026-10-31')).toEqual([before]);
    expect(sessionsOn([before, after], '2026-11-01')).toEqual([after]);
    expect(monthlyStats([before, after], [], '2026-10').totalSeconds).toBe(600);
    expect(monthlyStats([before, after], [], '2026-11').totalSeconds).toBe(1200);
});
test('FR-06 S-62 10분 20쪽과 20분 30쪽은 30분 50쪽이며 장르와 작가별로 합산해요', () => {
    const list = [session('2026-10-05', 600, { bookId: 'sf', endPage: 20 }), session('2026-10-05', 1200, { bookId: 'history', endPage: 30 })];
    const books = [book('sf', 'SF'), book('history', '역사')];
    const stats = monthlyStats(list, books, '2026-10');
    expect(stats).toMatchObject({ month: '2026-10', totalSeconds: 1800, totalPages: 50, completedBooks: 0, sessionCount: 2 });
    expect(stats.byGenre).toEqual([{ label: '역사', seconds: 1200, pages: 30 }, { label: 'SF', seconds: 600, pages: 20 }]);
    expect(stats.byAuthor).toEqual([{ label: '작가 history', seconds: 1200, pages: 30 }, { label: '작가 sf', seconds: 600, pages: 20 }]);
    expect(monthlyStats(list, books, '2026-11')).toEqual({ month: '2026-11', totalSeconds: 0, totalPages: 0, completedBooks: 0, sessionCount: 0, byGenre: [], byAuthor: [] });
});
test('FR-06 S-62 시간만 기록과 되돌아 읽기는 0쪽이며 같은 장르와 작가는 합쳐요', () => {
    const list = [session('2026-10-01', 600, { bookId: 'a', startPage: 112, endPage: 80 }), session('2026-10-02', 600, { bookId: 'b' }), session('2026-10-03', 600, { bookId: 'b', endPage: 10 })];
    const stats = monthlyStats(list, [book('a', 'SF', '같은 작가'), book('b', 'SF', '같은 작가')], '2026-10');
    expect(stats.byGenre).toEqual([{ label: 'SF', seconds: 1800, pages: 10 }]);
    expect(stats.byAuthor).toEqual([{ label: '같은 작가', seconds: 1800, pages: 10 }]);
});
test('FR-06 S-62 완독 권수는 KST 완독 월에 책당 한 번 세고 삭제 tombstone은 제외해요', () => {
    const books = [
        book('a', 'SF', '작가', { completedAt: Date.parse('2026-09-30T15:00:00Z') }),
        book('b', 'SF', '작가', { completedAt: Date.parse('2026-10-31T14:59:59Z') }),
        book('c', 'SF', '작가', { completedAt: Date.parse('2026-10-31T15:00:00Z') }),
        book('d', 'SF', '작가', { completedAt: at('2026-10-10'), deleted: true }), book('e', 'SF'),
    ];
    const stats = monthlyStats([session('2026-10-01', 600, { deleted: true })], books, '2026-10');
    expect(stats.completedBooks).toBe(2);
    expect(stats.sessionCount).toBe(0);
    expect(stats.totalSeconds).toBe(0);
    expect(stats.totalPages).toBe(0);
});
test('FR-06 S-62 연결할 책이 없는 기록은 기타로 집계해요', () => {
    const stats = monthlyStats([session('2026-10-01')], [], '2026-10');
    expect(stats.byGenre).toEqual([{ label: '기타', seconds: 600, pages: 0 }]);
    expect(stats.byAuthor).toEqual(stats.byGenre);
});
test('FR-05 S-10 하루 합계 1분 이상인 날만 연속 독서일로 세요', () => {
    const list = [session('2026-10-10', 120), session('2026-10-09', 30), session('2026-10-09', 30), session('2026-10-08', 59)];
    expect(streakDays(list, '2026-10-10')).toBe(2);
    expect(streakDays([...list, session('2026-10-08', 1)], '2026-10-10')).toBe(3);
    expect(streakDays([session('2026-10-10', 60, { deleted: true })], '2026-10-10')).toBe(0);
});
test('FR-05 S-10 오늘 기록이 없으면 어제부터 세며 월과 연도를 넘어 이어져요', () => {
    const list = [session('2027-01-01', 60), session('2026-12-31', 60), session('2026-12-30', 60)];
    expect(streakDays(list, '2027-01-02')).toBe(3);
    expect(streakDays(list, '2027-01-03')).toBe(0);
    expect(streakDays([], '2027-01-01')).toBe(0);
});
test('FR-05 S-10 이번 주는 KST 월요일부터 오늘까지이며 수동 기록도 상한 없이 더해요', () => {
    const list = [session('2026-10-04', 10), session('2026-10-05', 20000, { source: 'MANUAL' }), session('2026-10-07', 20), session('2026-10-08', 30), session('2026-10-06', 40, { deleted: true })];
    expect(thisWeekSeconds(list, '2026-10-07')).toBe(20020);
    expect(thisWeekSeconds(list, '2026-10-11')).toBe(20050);
    expect(thisWeekSeconds(list, '2026-10-12')).toBe(0);
    expect(thisWeekSeconds([session('2026-10-04', 10), session('2026-10-05', 20)], '2026-10-05')).toBe(20);
});
test('FR-02 T09 FR-05 FR-06 수동 기록은 캘린더와 통계와 연속 독서일에 포함해요', () => {
    const startedAt = at('2026-10-29');
    const input = validateManualSession(startedAt, '20', '30', '50', 200, startedAt + 3600000);
    if (input.kind !== 'valid') throw new Error(input.message);
    const today = toManualSession(input, 'today', 'book', null, startedAt + 3600000);
    const yesterday = { ...today, id: 'yesterday', startedAt: today.startedAt - 86400000, endedAt: today.endedAt - 86400000 };
    const list = [today, yesterday];
    expect(readingDays(list, '2026-10')).toEqual(new Set([28, 29]));
    expect(sessionsOn(list, '2026-10-29')).toEqual([today]);
    expect(monthlyStats(list, [book('book', '소설')], '2026-10')).toMatchObject({ totalSeconds: 2400, totalPages: 40 });
    expect(streakDays(list, '2026-10-29')).toBe(2);
    expect(thisWeekSeconds(list, '2026-10-29')).toBe(2400);
});
test('FR-05 FR-06 잘못된 날짜와 월은 조용히 다른 날짜로 집계하지 않아요', () => {
    expect(() => sessionsOn([], '2026-02-30')).toThrow(RangeError);
    expect(() => streakDays([], '2026-2-01')).toThrow(RangeError);
    expect(() => thisWeekSeconds([], 'bad')).toThrow(RangeError);
    expect(() => readingDays([], '2026-13')).toThrow(RangeError);
    expect(() => monthlyStats([], [], '2026-1')).toThrow(RangeError);
});

test('FR-05 S-60 날짜 파라미터는 엄격한 단일 날짜만 허용하고 나머지는 KST 오늘로 열어요', () => {
    const now = Date.parse('2026-10-31T15:00:00Z');
    expect(calendarDate('2024-02-29', now)).toBe('2024-02-29');
    for (const date of [undefined, '', '2026-02-29', '2026-11-31', '2026-1-01', 'bad', ['2026-10-01', '2026-11-01']]) {
        expect(calendarDate(date, now)).toBe('2026-11-01');
    }
});

test('FR-05 S-60 월 이동은 윤년과 연도 경계를 지나고 말일에 맞춰 선택해요', () => {
    expect(moveCalendarMonth('2024-01-31', 1)).toBe('2024-02-29');
    expect(moveCalendarMonth('2026-03-31', -1)).toBe('2026-02-28');
    expect(moveCalendarMonth('2026-12-15', 1)).toBe('2027-01-15');
    expect(moveCalendarMonth('2026-01-15', -1)).toBe('2025-12-15');
    expect(moveCalendarMonth('0000-01-01', -1)).toBe('0000-01-01');
    expect(moveCalendarMonth('9999-12-31', 1)).toBe('9999-12-31');
});

test('FR-05 S-60 달력은 일요일부터 시작하고 윤년과 여섯 주인 달의 모든 날짜를 한 번씩 보여 줘요', () => {
    expect(calendarWeeks('2026-02')).toHaveLength(4);
    expect(calendarWeeks('2024-02')[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(calendarWeeks('2024-02').flat().filter(day => day !== null)).toHaveLength(29);
    const august = calendarWeeks('2026-08');
    expect(august).toHaveLength(6);
    expect(august.flat().filter(day => day !== null)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
});

test('FR-05 FR-06 S-61 S-62 시각은 KST로, 시간은 누적 시간과 분으로 표시해요', () => {
    expect(calendarClock(Date.parse('2026-10-31T15:00:00Z'))).toBe('00:00');
    expect([0, 59, 60, 1800, 3600, 90000].map(calendarDuration)).toEqual(['0초', '59초', '1분', '30분', '1시간 0분', '25시간 0분']);
});

test.each([
    [0, 0, 0], [1, 1, 0], [2, 2, 0], [3, 2, 1], [5, 2, 3],
])('FR-05 S-60 그날 %i권을 읽으면 표지 %i개를 보여 주고 남은 권수는 %i권이에요', (count, shown, remaining) => {
    const books = Array.from({ length: count }, (_, index) => `book-${index}`);
    expect(dayCovers(books)).toEqual({ shown: books.slice(0, shown), remaining });
});

test('FR-05 S-60 그날 읽은 책은 책별 읽은 시간을 합쳐 긴 책부터 보여 줘요', () => {
    const list = [
        session('2026-10-05', 600, { id: 'a1', bookId: 'a' }),
        session('2026-10-05', 900, { id: 'b1', bookId: 'b' }),
        session('2026-10-05', 600, { id: 'a2', bookId: 'a', startedAt: at('2026-10-05') + 3_600_000 }),
        session('2026-10-05', 300, { id: 'c1', bookId: 'c' }),
        session('2026-10-06', 9999, { id: 'other-day', bookId: 'c' }),
    ];
    expect(booksReadOn(list, [], '2026-10-05')).toEqual([
        { bookId: 'a', seconds: 1200, firstStartedAt: at('2026-10-05') },
        { bookId: 'b', seconds: 900, firstStartedAt: at('2026-10-05') },
        { bookId: 'c', seconds: 300, firstStartedAt: at('2026-10-05') },
    ]);
});

test('FR-05 S-60 읽은 시간이 같으면 그날 먼저 시작한 책부터 보여 줘요', () => {
    const list = [
        session('2026-10-05', 600, { id: 'late', bookId: 'late', startedAt: at('2026-10-05') + 60_000 }),
        session('2026-10-05', 600, { id: 'early', bookId: 'early', startedAt: at('2026-10-05') - 60_000 }),
        session('2026-10-05', 600, { id: 'middle', bookId: 'middle' }),
    ];
    expect(booksReadOn(list, [], '2026-10-05').map(item => item.bookId)).toEqual(['early', 'middle', 'late']);
});

test('FR-05 S-60 삭제된 세션과 삭제된 책의 기록은 빼고 목록에 없는 책은 남겨요', () => {
    const list = [
        session('2026-10-05', 3600, { id: 'deleted-session', bookId: 'kept', deleted: true }),
        session('2026-10-05', 1800, { id: 'deleted-book', bookId: 'gone' }),
        session('2026-10-05', 600, { id: 'kept', bookId: 'kept' }),
        session('2026-10-05', 300, { id: 'missing', bookId: 'missing' }),
    ];
    const books = [book('kept', '소설'), book('gone', '소설', '작가', { deleted: true })];
    expect(booksReadOn(list, books, '2026-10-05')).toEqual([
        { bookId: 'kept', seconds: 600, firstStartedAt: at('2026-10-05') },
        { bookId: 'missing', seconds: 300, firstStartedAt: at('2026-10-05') },
    ]);
    expect(booksReadOn(list, books, '2026-10-04')).toEqual([]);
});

test('FR-05 S-60 읽은 시간과 시작 시각이 모두 같으면 책 ID 순서로 보여 줘요', () => {
    const list = ['c', 'a', 'b'].map(bookId => session('2026-10-05', 600, { id: `${bookId}1`, bookId }));
    expect(booksReadOn(list, [], '2026-10-05').map(item => item.bookId)).toEqual(['a', 'b', 'c']);
    expect(booksReadByDate(list, [], '2026-10').get('2026-10-05')?.map(item => item.bookId)).toEqual(['a', 'b', 'c']);
});

test('FR-05 S-60 한 달 치를 날짜별로 한 번에 묶은 결과는 날짜마다 booksReadOn과 같아요', () => {
    const list = [
        session('2026-10-05', 600, { id: 'a1', bookId: 'a' }),
        session('2026-10-05', 900, { id: 'b1', bookId: 'b' }),
        session('2026-10-05', 600, { id: 'a2', bookId: 'a', startedAt: at('2026-10-05') + 3_600_000 }),
        session('2026-10-06', 600, { id: 'late', bookId: 'b', startedAt: at('2026-10-06') + 60_000 }),
        session('2026-10-06', 600, { id: 'early', bookId: 'c', startedAt: at('2026-10-06') - 60_000 }),
        session('2026-10-07', 3600, { id: 'deleted-session', bookId: 'a', deleted: true }),
        session('2026-10-08', 1800, { id: 'deleted-book', bookId: 'gone' }),
        session('2026-10-09', 300, { id: 'missing', bookId: 'missing' }),
        // KST 월 경계: 10월 31일 23:59:59는 10월, 11월 1일 00:00은 11월
        session('2026-10-31', 120, { id: 'oct-last', bookId: 'a', startedAt: Date.parse('2026-10-31T14:59:59Z') }),
        session('2026-11-01', 120, { id: 'nov-first', bookId: 'a', startedAt: Date.parse('2026-10-31T15:00:00Z') }),
        session('2026-09-30', 600, { id: 'other-month', bookId: 'a' }),
    ];
    const books = [book('a', '소설'), book('b', '소설'), book('c', '소설'), book('gone', '소설', '작가', { deleted: true })];
    const byDate = booksReadByDate(list, books, '2026-10');
    for (let day = 1; day <= 31; day += 1) {
        const date = `2026-10-${String(day).padStart(2, '0')}`;
        const expected = booksReadOn(list, books, date);
        expect(byDate.get(date) ?? []).toEqual(expected);
        expect(byDate.has(date)).toBe(expected.length > 0);
    }
    expect([...byDate.keys()].sort()).toEqual(['2026-10-05', '2026-10-06', '2026-10-09', '2026-10-31']);
    expect(byDate.get('2026-10-05')).toEqual([
        { bookId: 'a', seconds: 1200, firstStartedAt: at('2026-10-05') },
        { bookId: 'b', seconds: 900, firstStartedAt: at('2026-10-05') },
    ]);
    expect(booksReadByDate(list, books, '2026-11')).toEqual(new Map([
        ['2026-11-01', [{ bookId: 'a', seconds: 120, firstStartedAt: Date.parse('2026-10-31T15:00:00Z') }]],
    ]));
    expect(booksReadByDate([], books, '2026-10').size).toBe(0);
    expect(() => booksReadByDate(list, books, '2026-1')).toThrow(RangeError);
});
