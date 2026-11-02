import { parseStartPage, READING_CHECK_MS, readingCheckDue, stopAtReadingCheck, timerTimeLabel } from '../timerFlow';
import { deserializeTimer, elapsedMs, finishTimer, pauseTimer, resumeTimer, serializeTimer, startTimer } from '../timerState';

const start = () => startTimer('session', 'book', 84, 1000);
test.each(['-1', '241', '', '1.5', '1e2'])('FR-02 S-40 E-02 시작 쪽 %s의 범위 오류를 알려요', text => {
    expect(() => parseStartPage(text, 240)).toThrow('0~240쪽');
});
test('FR-02 S-40 시작 쪽의 양 끝값을 허용해요', () => {
    expect(parseStartPage('0', 240)).toBe(0);
    expect(parseStartPage('240', 240)).toBe(240);
});
test('FR-15 S-46 90분 직전에는 묻지 않고 경계부터 일시정지해 확인해요', () => {
    expect(readingCheckDue(start(), 0, 1000 + READING_CHECK_MS - 1)).toBe(false);
    const checked = stopAtReadingCheck(start(), 0, 1000 + READING_CHECK_MS);
    expect(checked.runningSinceMs).toBeNull();
    expect(readingCheckDue(checked, 0, 1000 + READING_CHECK_MS)).toBe(true);
});
test('FR-15 S-46 앱을 장시간 닫았다 열어도 미확인 시간은 90분까지만 세요', () => {
    const restored = deserializeTimer(serializeTimer(start()))!;
    const checked = stopAtReadingCheck(restored, 0, 1000 + READING_CHECK_MS * 4);
    expect(elapsedMs(checked, 1000 + READING_CHECK_MS * 4)).toBe(READING_CHECK_MS);
    const resumed = resumeTimer(checked, 1000 + READING_CHECK_MS * 4);
    expect(readingCheckDue(resumed, 1, 1000 + READING_CHECK_MS * 5 - 1)).toBe(false);
    expect(readingCheckDue(resumed, 1, 1000 + READING_CHECK_MS * 5)).toBe(true);
});
test('FR-02 S-42 S-46 일시정지·종료한 타이머는 대기 시간을 추가하지 않아요', () => {
    const paused = pauseTimer(start(), 2000);
    expect(stopAtReadingCheck(paused, 0, READING_CHECK_MS * 3)).toEqual(paused);
    const ended = finishTimer(start(), 2000);
    expect(readingCheckDue(ended, 0, READING_CHECK_MS * 3)).toBe(false);
    expect(timerTimeLabel(elapsedMs(ended, READING_CHECK_MS * 3))).toBe('00:00:01');
});
