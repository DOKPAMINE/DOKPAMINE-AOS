/** FR-15 · S-73: 초 단위 집계에서 분 미만은 버리고 시간·분으로 표시한다. */
export function rankingTimeLabel(seconds: number): string {
    const minutes = Number.isFinite(seconds) ? Math.floor(Math.max(0, seconds) / 60) : 0;
    return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}
