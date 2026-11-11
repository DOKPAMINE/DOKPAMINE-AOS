import { validateNewTimer, validateSessionPageRange } from '../syncValidation';

test.each([
    { startPage: 200, endPage: null, deleted: false },
    { startPage: 10, endPage: 200, deleted: false },
])('NFR-04·05 현재 진도와 무관하게 과거 세션의 쪽수를 보존해요: %j', row => {
    expect(() => validateSessionPageRange(100, [row])).toThrow('시작·종료 쪽');
    expect(() => validateSessionPageRange(200, [row])).not.toThrow();
    expect(() => validateSessionPageRange(100, [{ ...row, deleted: true }])).not.toThrow();
});

test.each([
    [0, 0, 0], [0, 1000, 1], [0, 1999, 1], [0, 60000, 30],
])('FR-15 일시정지·0초·초 버림 경계값을 허용해요: %i %i %i', (startedAt, endedAt, activeSeconds) => {
    expect(() => validateNewTimer({ source: 'TIMER', startedAt, endedAt, activeSeconds })).not.toThrow();
});

test.each([0, 999, 1999])('FR-15 경과 초를 초과한 신규 TIMER만 거절해요: %i', endedAt => {
    const row = { startedAt: 0, endedAt, activeSeconds: Math.floor(endedAt / 1000) + 1 };
    expect(() => validateNewTimer({ ...row, source: 'TIMER' })).toThrow('입력 시간');
    expect(() => validateNewTimer({ ...row, source: 'MANUAL' })).not.toThrow();
});
