/** 모든 개인 날짜 경계는 KST(UTC+09:00) 고정. 기기 시간대·DST에 영향을 받지 않는다. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function kstDate(timestampMs: number): string {
    return new Date(timestampMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 엄격한 YYYY-MM-DD. 잘못된 날짜가 다음 달로 자동 보정되는 것을 막는다. */
export function parseDate(date: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const ms = Date.parse(`${date}T00:00:00.000Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? ms : null;
}

/** T09 / S-36: KST 입력, 1900-01-01부터, HH:mm 형식만 받는다. */
export function parseStartedAt(date: string, time: string): number | null {
    const day = date.trim();
    const clock = time.trim();
    const ms = parseDate(day);
    if (ms === null || day < '1900-01-01' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) return null;
    const [hour, minute] = clock.split(':').map(Number);
    return ms + (hour * 60 + minute) * 60000 - KST_OFFSET_MS;
}
