import { parseInteger } from './pageRules';
import { elapsedMs, pauseTimer, type TimerState } from './timerState';

export const READING_CHECK_MS = 90 * 60 * 1000;

/** FR-02 / S-40·E-02: 시작 쪽은 0부터 전체 쪽수까지 수정할 수 있다. */
export function parseStartPage(text: string, totalPages: number): number {
    const page = parseInteger(text);
    if (page === null || page < 0 || page > totalPages) throw new Error(`시작 쪽은 0~${totalPages}쪽으로 입력해 주세요.`);
    return page;
}

/** FR-15 / S-46: 방치·재시작 때도 미확인 구간을 독서 시간에 계속 더하지 않는다. */
export function stopAtReadingCheck(timer: TimerState, confirmedChecks: number, now: number): TimerState {
    const boundary = (confirmedChecks + 1) * READING_CHECK_MS;
    if (timer.finishedAtMs !== null || timer.runningSinceMs === null || elapsedMs(timer, now) < boundary) return timer;
    return pauseTimer(timer, timer.runningSinceMs + Math.max(0, boundary - timer.accumulatedMs));
}

export function readingCheckDue(timer: TimerState, confirmedChecks: number, now: number): boolean {
    return timer.finishedAtMs === null && elapsedMs(timer, now) >= (confirmedChecks + 1) * READING_CHECK_MS;
}

/** FR-02 / S-41: 화면은 시각에서 계산한 값을 표시할 뿐 시간을 누적하지 않는다. */
export function timerTimeLabel(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
        .map(value => String(value).padStart(2, '0')).join(':');
}
