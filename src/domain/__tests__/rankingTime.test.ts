import { rankingTimeLabel } from '../rankingTime';

test.each([
    [0, '0시간 0분'], [59, '0시간 0분'], [60, '0시간 1분'],
    [3599, '0시간 59분'], [3600, '1시간 0분'], [3660, '1시간 1분'],
    [10800, '3시간 0분'], [75600, '21시간 0분'], [119.9, '0시간 1분'],
    [-1, '0시간 0분'], [NaN, '0시간 0분'], [Infinity, '0시간 0분'],
])('FR-15 S-73 %s초를 %s으로 표시해요', (seconds, label) => {
    expect(rankingTimeLabel(seconds)).toBe(label);
});
