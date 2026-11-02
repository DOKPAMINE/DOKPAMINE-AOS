import { formatWeekTime } from '../homeTime';

test.each([
    [0, '0초'], [59, '59초'], [59.9, '59초'], [60, '0시간 1분'],
    [3599, '0시간 59분'], [3600, '1시간 0분'], [3660, '1시간 1분'], [93600, '26시간 0분'],
    [-1, '0초'], [NaN, '0초'], [Infinity, '0초'],
])('FR-04 S-10 주간 독서 시간 %s초를 %s로 표시해요', (seconds, expected) => {
    expect(formatWeekTime(seconds)).toBe(expected);
});
