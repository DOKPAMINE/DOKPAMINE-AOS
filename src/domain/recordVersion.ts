/** NFR-05: 같은 밀리초 저장과 기기 시계 역행에도 버전이 증가한다. */
export function nextRecordVersion(now: number, previous?: number): number {
    const version = Math.max(now, previous === undefined ? now : previous + 1);
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(version)) {
        throw new Error('기록 버전을 저장할 수 없어요.');
    }
    return version;
}
