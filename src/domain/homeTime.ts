/** FR-04 / S-10: 1분 미만은 초, 그 이상은 누적 시간·분으로 표시한다. */
export function formatWeekTime(seconds: number): string {
    const wholeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return wholeSeconds < 60 ? `${wholeSeconds}초` : `${Math.floor(wholeSeconds / 3600)}시간 ${Math.floor(wholeSeconds % 3600 / 60)}분`;
}
