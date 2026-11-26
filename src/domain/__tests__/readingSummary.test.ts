import { booksReadByDate, monthlyStats } from '../calendarRules';
import { parseStartedAt } from '../kstDate';
import type { ReadingSession, StatisticsBook } from '../readingTypes';
import { MIN_READING_DAY_SECONDS, readingDays, readingStreak, readingTotals } from '../readingSummary';

const at = (day: string, time = '12:00') => parseStartedAt(day, time)!;
let sequence = 0;
const session = (day: string, changes: Partial<ReadingSession> = {}): ReadingSession => {
    const startedAt = changes.startedAt ?? at(day);
    return {
        id: `session-${++sequence}`, bookId: 'book', startedAt, endedAt: startedAt + 600000,
        activeSeconds: 600, startPage: 0, endPage: null, source: 'TIMER', deleted: false,
        createdAt: startedAt, syncPending: true, localVersion: 1, ...changes,
    };
};
const book = (id: string, genre: string, changes: Partial<StatisticsBook> = {}): StatisticsBook => ({
    id, genre, author: `작가 ${id}`, completedAt: null, deleted: false, ...changes,
});
const days = (...list: string[]) => list.map(day => session(day));

describe('readingStreak', () => {
    test('FR-10 S-80 오늘 읽었으면 오늘까지의 연속 일수를 세요', () => {
        expect(readingStreak(days('2026-11-24', '2026-11-25', '2026-11-26'), [], '2026-11-26')).toEqual({ current: 3, best: 3 });
    });

    test('FR-10 S-80 오늘 기록이 없어도 어제까지 이어졌으면 어제까지의 연속을 유지해요', () => {
        expect(readingStreak(days('2026-11-24', '2026-11-25'), [], '2026-11-26')).toEqual({ current: 2, best: 2 });
    });

    test('FR-10 S-80 어제와 오늘 모두 기록이 없으면 현재 연속은 0이에요', () => {
        expect(readingStreak(days('2026-11-23', '2026-11-24'), [], '2026-11-26')).toEqual({ current: 0, best: 2 });
    });

    test('FR-10 S-80 KST 자정 직전 기록은 전날, 자정 기록은 그날로 세요', () => {
        const beforeMidnight = session('2026-11-25', { startedAt: at('2026-11-25', '23:59') });
        const midnight = session('2026-11-26', { startedAt: at('2026-11-26', '00:00') });
        // 23:59 KST는 UTC로 같은 날 14:59, 00:00 KST는 UTC로 전날 15:00이다.
        expect(readingStreak([midnight], [], '2026-11-26')).toEqual({ current: 1, best: 1 });
        expect(readingStreak([beforeMidnight], [], '2026-11-26')).toEqual({ current: 1, best: 1 });
        expect(readingStreak([beforeMidnight], [], '2026-11-27')).toEqual({ current: 0, best: 1 });
        expect(readingStreak([beforeMidnight, midnight], [], '2026-11-26')).toEqual({ current: 2, best: 2 });
    });

    test('FR-10 S-80 삭제된 세션과 삭제된 책의 세션은 읽은 날에서 빼요(캘린더와 같은 기준)', () => {
        const list = [
            session('2026-11-24'), session('2026-11-25', { deleted: true }),
            session('2026-11-26', { bookId: 'removed' }),
        ];
        const books = [book('book', '소설'), book('removed', '에세이', { deleted: true })];
        expect(readingStreak(list, books, '2026-11-26')).toEqual({ current: 0, best: 1 });
        // 같은 기록으로 캘린더가 표시하는 읽은 날도 24일 하루뿐이다.
        expect([...booksReadByDate(list, books, '2026-11').keys()]).toEqual(['2026-11-24']);
        expect(monthlyStats(list, books, '2026-11').readingDayCount).toBe(1);
    });

    test('FR-10 S-80 0초 기록만 있는 날은 캘린더에 표시돼도 연속 독서일의 읽은 날이 아니에요', () => {
        const list = [session('2026-11-26', { activeSeconds: 0 })];
        expect(readingStreak(list, [], '2026-11-26')).toEqual({ current: 0, best: 0 });
        expect(monthlyStats(list, [], '2026-11').readingDayCount).toBe(1);
    });

    test('FR-10 S-80 기록이 없으면 현재·최고 모두 0이에요', () => {
        expect(readingStreak([], [], '2026-11-26')).toEqual({ current: 0, best: 0 });
    });

    test('FR-10 S-80 최고 기록은 전체 기간 중 가장 긴 연속 일수이며 월·연 경계를 이어서 세요', () => {
        const list = days(
            '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', // 연 경계를 넘는 4일
            '2026-10-31', '2026-11-01', // 월 경계를 넘는 2일
            '2026-11-25', '2026-11-26',
            '2026-11-26', // 같은 날 두 번은 하루로 센다
        );
        expect(readingStreak(list, [], '2026-11-26')).toEqual({ current: 2, best: 4 });
    });

    test('FR-10 S-80 잘못된 날짜는 거절해요', () => {
        expect(() => readingStreak([], [], '2026-11-31')).toThrow(RangeError);
    });
});

describe('readingDays', () => {
    test('FR-10 S-80 읽은 날 기준은 하루 합계 10분(600초)이에요', () => {
        expect(MIN_READING_DAY_SECONDS).toBe(600);
    });

    test('FR-10 S-80 하루 합계가 9분 59초인 날은 읽은 날이 아니고 10분이면 읽은 날이에요', () => {
        expect(readingDays([session('2026-11-25', { activeSeconds: 599 })], [])).toEqual(new Set());
        expect(readingDays([session('2026-11-25', { activeSeconds: 600 })], [])).toEqual(new Set(['2026-11-25']));
    });

    test('FR-10 S-80 하루 여러 기록의 합이 10분 이상이면 읽은 날이에요', () => {
        const list = [300, 200, 100].map(activeSeconds => session('2026-11-25', { activeSeconds }));
        expect(readingDays(list, [])).toEqual(new Set(['2026-11-25']));
        expect(readingDays(list.slice(0, 2), [])).toEqual(new Set());
    });

    test('FR-10 S-80 KST 자정을 사이에 둔 기록은 시작한 날마다 따로 합산해요', () => {
        // 23:55 KST에 시작한 5분과 다음 날 00:00 KST에 시작한 5분은 이어져 있어도 각각 5분이다.
        const late = session('2026-11-25', { startedAt: at('2026-11-25', '23:55'), activeSeconds: 300 });
        const early = session('2026-11-26', { startedAt: at('2026-11-26', '00:00'), activeSeconds: 300 });
        expect(readingDays([late, early], [])).toEqual(new Set());
        // 23:59 KST에 시작한 긴 기록은 자정을 넘겨도 시작한 날에 전체를 귀속한다.
        const overnight = session('2026-11-25', { startedAt: at('2026-11-25', '23:59'), activeSeconds: 3600 });
        expect(readingDays([overnight, early], [])).toEqual(new Set(['2026-11-25']));
    });

    test('FR-10 S-80 삭제된 세션과 삭제된 책의 세션은 하루 합계에서 빼요', () => {
        const list = [
            session('2026-11-25', { activeSeconds: 300 }),
            session('2026-11-25', { activeSeconds: 300, deleted: true }),
            session('2026-11-25', { activeSeconds: 300, bookId: 'removed' }),
        ];
        const books = [book('book', '소설'), book('removed', '에세이', { deleted: true })];
        expect(readingDays(list, books)).toEqual(new Set());
        expect(readingDays(list, [book('book', '소설'), book('removed', '에세이')])).toEqual(new Set(['2026-11-25']));
    });

    test('FR-10 S-80 9분 59초인 날은 연속을 끊고 현재·최고 연속일을 모두 10분 기준으로 세요', () => {
        const list = [
            ...days('2026-11-20', '2026-11-21', '2026-11-22'),
            session('2026-11-23', { activeSeconds: 599 }),
            ...days('2026-11-24', '2026-11-25'),
        ];
        expect(readingStreak(list, [], '2026-11-26')).toEqual({ current: 2, best: 3 });
        expect(readingStreak([...list, session('2026-11-23', { activeSeconds: 1 })], [], '2026-11-26')).toEqual({ current: 6, best: 6 });
    });
});

describe('readingTotals', () => {
    test('FR-10 S-80 누적 총 독서시간·읽은 책·완독은 전체 기간 기록과 맞아요', () => {
        const list = [
            session('2025-03-01', { bookId: 'a', activeSeconds: 3600 }),
            session('2026-11-20', { bookId: 'a', activeSeconds: 1800 }),
            session('2026-11-21', { bookId: 'b', activeSeconds: 600 }),
            session('2026-11-22', { bookId: 'c', activeSeconds: 900, deleted: true }),
        ];
        const books = [
            book('a', '소설', { completedAt: at('2025-03-01') }),
            book('b', '에세이'),
            book('c', 'SF', { completedAt: at('2026-11-22') }),
            book('d', '소설', { completedAt: at('2026-11-23'), deleted: true }),
        ];
        expect(readingTotals(list, books)).toMatchObject({ totalSeconds: 6000, booksReadCount: 2, completedBooks: 2 });
    });

    test('FR-10 S-80 완독은 월간 통계의 completedAt 기준을 전체 기간으로 넓혀 세요', () => {
        const books = [
            book('october', '소설', { completedAt: at('2026-10-31') }),
            book('november', '소설', { completedAt: at('2026-11-01') }),
            book('reading', '소설'),
        ];
        const total = readingTotals([], books).completedBooks;
        expect(total).toBe(2);
        expect(total).toBe(monthlyStats([], books, '2026-10').completedBooks + monthlyStats([], books, '2026-11').completedBooks);
    });

    test('FR-10 S-80 장르별 권수는 많은 순이고 가장 많은 장르가 100%예요', () => {
        const list = ['n1', 'n2', 'n3', 'n1', 'e1'].map((bookId, index) => session(`2026-11-${10 + index}`, { bookId }));
        const books = [book('n1', '소설'), book('n2', '소설'), book('n3', '소설'), book('e1', '에세이')];
        expect(readingTotals(list, books).byGenre).toEqual([
            { label: '소설', books: 3, ratio: 1 },
            { label: '에세이', books: 1, ratio: 1 / 3 },
        ]);
    });

    test('FR-10 S-80 권수가 같으면 장르 이름 순이고 책 정보가 없으면 기타로 묶어요', () => {
        const list = ['s', 'e', 'missing', 'removed'].map((bookId, index) => session(`2026-11-${10 + index}`, { bookId }));
        const books = [book('s', '소설'), book('e', '에세이'), book('removed', 'SF', { deleted: true })];
        // 삭제된 책의 세션은 빼고, 목록에 없는 책은 읽은 책으로 세되 장르를 '기타'로 둔다.
        expect(readingTotals(list, books)).toMatchObject({
            booksReadCount: 3,
            byGenre: [{ label: '기타', books: 1, ratio: 1 }, { label: '소설', books: 1, ratio: 1 }, { label: '에세이', books: 1, ratio: 1 }],
        });
    });

    test('FR-10 S-80 기록이 하나도 없으면 숫자는 0이고 장르 막대가 없어요', () => {
        expect(readingTotals([], [book('a', '소설')])).toEqual({ totalSeconds: 0, booksReadCount: 0, completedBooks: 0, byGenre: [] });
    });
});
