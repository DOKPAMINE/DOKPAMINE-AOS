import { KST_OFFSET_MS, parseStartedAt } from './kstDate';
import { validateManualSession } from './manualSessionRules';
import { suggestedStartPage } from './pageRules';
import type { ReadingSession } from './readingTypes';

export interface RecordFields { date: string; time: string; minutes: string; startPage: string; endPage: string }

/** FR-02 / S-36: 기기 시간대와 관계없이 날짜·시각을 KST로 표시한다. */
export function recordDateTime(timestamp: number) {
    const text = new Date(timestamp + KST_OFFSET_MS).toISOString();
    return { date: text.slice(0, 10), time: text.slice(11, 16) };
}

export function initialRecordFields(currentPage: number, totalPages: number, now: number, existing: ReadingSession | null): RecordFields {
    return {
        ...recordDateTime(existing?.startedAt ?? now - 30 * 60000),
        minutes: String(existing ? Math.max(1, Math.ceil(existing.activeSeconds / 60)) : 30),
        startPage: String(existing?.startPage ?? suggestedStartPage(currentPage, totalPages)),
        endPage: existing?.endPage == null ? '' : String(existing.endPage),
    };
}

export function validateRecordFields(fields: RecordFields, totalPages: number, now: number) {
    const startedAt = parseStartedAt(fields.date, fields.time);
    if (startedAt === null) return { kind: 'invalid' as const, message: '날짜는 1900년 이후 YYYY-MM-DD, 시작 시각은 HH:mm으로 입력해 주세요.' };
    return validateManualSession(startedAt, fields.minutes, fields.startPage, fields.endPage, totalPages, now);
}

/** FR-04 / S-35: 조회 순서에 의존하지 않고 동률도 결정적인 최신순으로 표시한다. */
export function newestRecords<T extends ReadingSession>(records: readonly T[]): T[] {
    return records.filter(record => !record.deleted).sort((a, b) =>
        b.startedAt - a.startedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}
