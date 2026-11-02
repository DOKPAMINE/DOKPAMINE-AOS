import type { ReadingSession } from './readingTypes';

/** FR-02 / S-41·S-42: 시각 기반 상태. ID와 now는 호출자가 제공하며 플랫폼·저장소에 의존하지 않는다. */
export interface TimerState {
    readonly sessionId: string;
    readonly bookId: string;
    readonly startPage: number;
    readonly startedAtMs: number;
    readonly accumulatedMs: number;
    readonly runningSinceMs: number | null;
    readonly finishedAtMs: number | null;
    readonly endPageDraft: string;
}

export function startTimer(sessionId: string, bookId: string, startPage: number, now: number): TimerState {
    return { sessionId, bookId, startPage, startedAtMs: now, accumulatedMs: 0, runningSinceMs: now, finishedAtMs: null, endPageDraft: '' };
}

export function elapsedMs(timer: TimerState, now: number): number {
    return timer.accumulatedMs + (timer.runningSinceMs === null ? 0 : Math.max(0, now - timer.runningSinceMs));
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
    return timer.runningSinceMs === null ? timer : { ...timer, accumulatedMs: elapsedMs(timer, now), runningSinceMs: null };
}

export function resumeTimer(timer: TimerState, now: number): TimerState {
    return timer.runningSinceMs !== null || timer.finishedAtMs !== null ? timer : { ...timer, runningSinceMs: now };
}

export function finishTimer(timer: TimerState, now: number): TimerState {
    return timer.finishedAtMs !== null ? timer : { ...pauseTimer(timer, now), finishedAtMs: now };
}

/** FR-02·03 / S-43·S-45: 종료 시각과 클라이언트 ID를 보존한다. 같은 ID로 저장하는 IO는 호출자가 담당한다. */
export function toTimerSession(
    timer: TimerState, endPage: number | null, currentPage: number, now: number,
): { readonly session: ReadingSession; readonly currentPage: number } {
    if (timer.finishedAtMs === null) throw new Error('타이머를 마친 뒤 저장해 주세요.');
    return {
        session: {
            id: timer.sessionId, bookId: timer.bookId, startedAt: timer.startedAtMs, endedAt: timer.finishedAtMs,
            activeSeconds: Math.floor(elapsedMs(timer, timer.finishedAtMs) / 1000),
            startPage: timer.startPage, endPage, source: 'TIMER', deleted: false,
            createdAt: now, syncPending: true, localVersion: now,
        },
        currentPage: endPage ?? currentPage,
    };
}

/** UC-02 3a: 기본값과 null을 모두 명시해 일시정지·종료 상태를 보존한다. */
export function serializeTimer(timer: TimerState): string {
    return JSON.stringify({
        sessionId: timer.sessionId, bookId: timer.bookId, startPage: timer.startPage,
        startedAtMs: timer.startedAtMs, accumulatedMs: timer.accumulatedMs,
        runningSinceMs: timer.runningSinceMs, finishedAtMs: timer.finishedAtMs, endPageDraft: timer.endPageDraft,
    });
}

/** 손상된 상태는 null. runningSinceMs 누락을 실행 중으로 추정하지 않으며 알 수 없는 새 필드는 무시한다. */
export function deserializeTimer(json: string): TimerState | null {
    try {
        const value: unknown = JSON.parse(json);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const state = value as Record<string, unknown>;
        const timestamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && Number.isFinite(new Date(v).getTime());
        if (typeof state.sessionId !== 'string' || !state.sessionId || typeof state.bookId !== 'string' || !state.bookId ||
            typeof state.startPage !== 'number' || !Number.isSafeInteger(state.startPage) || state.startPage < 0 ||
            !timestamp(state.startedAtMs) || typeof state.accumulatedMs !== 'number' || !Number.isSafeInteger(state.accumulatedMs) || state.accumulatedMs < 0 ||
            (state.runningSinceMs !== null && !timestamp(state.runningSinceMs)) ||
            (state.finishedAtMs !== null && !timestamp(state.finishedAtMs)) || typeof state.endPageDraft !== 'string' ||
            (state.finishedAtMs !== null && state.runningSinceMs !== null)) return null;
        return {
            sessionId: state.sessionId, bookId: state.bookId, startPage: state.startPage, startedAtMs: state.startedAtMs,
            accumulatedMs: state.accumulatedMs, runningSinceMs: state.runningSinceMs, finishedAtMs: state.finishedAtMs, endPageDraft: state.endPageDraft,
        };
    } catch {
        return null;
    }
}
