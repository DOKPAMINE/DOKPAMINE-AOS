import { deserializeTimer, elapsedMs, finishTimer, pauseTimer, resumeTimer, serializeTimer, startTimer, toTimerSession } from '../timerState';
import { parseEndPage } from '../pageRules';

const page = (value: number | null) => {
    const result = parseEndPage(value === null ? '' : String(value), 30, 240);
    if (result.kind === 'invalid') throw new Error(result.message);
    return result;
};

const t0 = 1000000;
const start = () => startTimer('client-session-uuid', 'book', 30, t0);

test('FR-02 S-41 60초 측정과 30초 정지 후 60초를 측정하면 120초예요', () => {
    const original = start();
    const paused = pauseTimer(original, t0 + 60000);
    const resumed = resumeTimer(paused, t0 + 90000);
    const finished = finishTimer(resumed, t0 + 150000);
    expect(elapsedMs(finished, t0 + 999999)).toBe(120000);
    expect(finished.sessionId).toBe(original.sessionId);
    expect(finished.startedAtMs).toBe(t0);
    expect(original.accumulatedMs).toBe(0);
    expect(original.runningSinceMs).toBe(t0);
    expect(finishTimer(finished, t0 + 500000)).toBe(finished);
});
test('FR-02 UC-02 3a 일시정지를 직렬화하고 복원해도 null과 경과 시간이 같아요', () => {
    const paused = { ...pauseTimer(start(), t0 + 60000), endPageDraft: '84' };
    const json = serializeTimer(paused);
    const restored = deserializeTimer(json);
    expect(json).toContain('"runningSinceMs":null');
    expect(json).toContain('"finishedAtMs":null');
    expect(restored).toEqual(paused);
    expect(restored!.runningSinceMs).toBeNull();
    expect(elapsedMs(restored!, t0 + 999999)).toBe(elapsedMs(paused, t0 + 60000));
});
test('FR-02 UC-02 3a 실행 중과 종료 상태를 복원하면 화면 카운터 없이 시각으로 계산해요', () => {
    const running = deserializeTimer(serializeTimer(start()))!;
    expect(elapsedMs(running, t0 + 300000)).toBe(300000);
    const finished = finishTimer(running, t0 + 60000);
    const restored = deserializeTimer(serializeTimer(finished))!;
    expect(restored).toEqual(finished);
    expect(elapsedMs(restored, t0 + 300000)).toBe(60000);
});
test('FR-02 S-42 중복 정지와 재개는 시간을 더하지 않고 종료 후에는 재개하지 않아요', () => {
    const running = start();
    expect(resumeTimer(running, t0 + 1000)).toBe(running);
    const paused = pauseTimer(running, t0 + 60000);
    expect(pauseTimer(paused, t0 + 90000)).toBe(paused);
    const finished = finishTimer(paused, t0 + 120000);
    expect(resumeTimer(finished, t0 + 150000)).toBe(finished);
    expect(elapsedMs(finished, t0 + 200000)).toBe(60000);
});
test('FR-02 S-41 시계가 시작 시각보다 뒤로 이동해도 음수 측정 구간이 생기지 않아요', () => {
    expect(elapsedMs(start(), t0 - 1)).toBe(0);
    const resumed = resumeTimer(pauseTimer(start(), t0 + 60000), t0 + 90000);
    expect(elapsedMs(resumed, t0 + 80000)).toBe(60000);
});

test('FR-02 S-43 종료 타이머를 세션으로 바꾸면 정지 시간을 빼고 초를 내림해요', () => {
    const paused = pauseTimer(start(), t0 + 60999);
    const finished = finishTimer(resumeTimer(paused, t0 + 90000), t0 + 150999);
    const now = t0 + 500000;
    expect(toTimerSession(finished, page(84), 30, now)).toEqual({
        session: {
            id: 'client-session-uuid', bookId: 'book', startedAt: t0, endedAt: t0 + 150999,
            activeSeconds: 121, startPage: 30, endPage: 84, source: 'TIMER', deleted: false,
            createdAt: now, syncPending: true, localVersion: now,
        },
        currentPage: 84,
    });
    expect(finished.startPage).toBe(30);
});

test.each([
    [84, 84], [0, 0], [null, 112],
])('FR-03 S-43 끝 쪽 %s을 저장하면 현재 쪽은 %s쪽이에요', (endPage, currentPage) => {
    const finished = finishTimer(start(), t0 + 999);
    const result = toTimerSession(finished, page(endPage), 112, t0 + 1000);
    expect(result.currentPage).toBe(currentPage);
    expect(result.session.endPage).toBe(endPage);
    expect(result.session.activeSeconds).toBe(0);
});

test('FR-02 NFR-05 S-45 같은 타이머를 다시 저장해도 한 건의 세션 ID를 유지해요', () => {
    const finished = finishTimer(start(), t0 + 60000);
    const first = toTimerSession(finished, page(84), 30, t0 + 61000).session;
    const second = toTimerSession(finished, page(84), 84, t0 + 120000, first).session;
    expect(first.id).toBe(finished.sessionId);
    expect(second.id).toBe(finished.sessionId);
    expect(new Set([first.id, second.id]).size).toBe(1);
    expect(second.endedAt).toBe(first.endedAt);
    expect(second.activeSeconds).toBe(first.activeSeconds);
});

test.each([start(), pauseTimer(start(), t0 + 1000)])('FR-02 S-43 종료하지 않은 타이머 %j는 세션으로 저장하지 않아요', timer => {
    expect(() => toTimerSession(timer, page(null), 30, t0 + 2000)).toThrow('타이머를 마친 뒤 저장해 주세요.');
});

test('NFR-05 S-45 같은 밀리초에 다시 저장하면 버전이 증가하고 생성 시각은 유지돼요', () => {
    const finished = finishTimer(start(), t0 + 60000);
    const first = toTimerSession(finished, page(84), 30, t0 + 61000).session;
    const second = toTimerSession(finished, page(84), 84, t0 + 61000, first).session;
    expect(second.localVersion).toBe(first.localVersion + 1);
    expect(second.createdAt).toBe(first.createdAt);
    expect(toTimerSession(finished, page(84), 84, t0, second).session.localVersion).toBe(second.localVersion + 1);
});

test('FR-03 S-43 전체 쪽수를 넘는 입력은 타이머 세션으로 변환할 수 없어요', () => {
    const invalid = parseEndPage('241', 30, 240);
    expect(invalid.kind).toBe('invalid');
    // @ts-expect-error 실패 결과는 저장 함수가 받지 않는다.
    const rejectedByType = () => toTimerSession(finishTimer(start(), t0 + 1000), invalid, 30, t0);
    expect(rejectedByType).toThrow('종료 페이지를 확인해 주세요.');
    expect(page(0)).toEqual({ kind: 'reread', endPage: 0 });
    expect(page(240)).toEqual({ kind: 'valid', endPage: 240 });
});
test.each(['bad', 'null', '[]', '{}', '1', '"timer"'])('FR-02 UC-02 3a 손상된 JSON %s을 타이머로 복원하지 않아요', json => {
    expect(deserializeTimer(json)).toBeNull();
});
test.each([
    { runningSinceMs: undefined }, { accumulatedMs: -1 }, { accumulatedMs: 1.5 },
    { startedAtMs: Number.MAX_SAFE_INTEGER }, { runningSinceMs: '1000' },
    { finishedAtMs: t0 + 1000 }, { sessionId: '' }, { startPage: -1 }, { endPageDraft: null },
])('FR-02 UC-02 3a 잘못된 상태 %j는 조용히 측정 중으로 바꾸지 않아요', change => {
    expect(deserializeTimer(JSON.stringify({ ...start(), ...change }))).toBeNull();
});
test('FR-02 UC-02 3a 새 필드를 무시하고 0밀리초 실행 시각도 보존해요', () => {
    const timer = startTimer('session', 'book', 0, 0);
    expect(deserializeTimer(JSON.stringify({ ...timer, futureField: true }))).toEqual(timer);
    expect(elapsedMs(timer, 1000)).toBe(1000);
});
