import { latestPaged, parseEndPage, parseInteger } from './pageRules';
import type { ReadingSession } from './readingTypes';

export interface ValidManualSession {
    readonly kind: 'valid';
    readonly startedAt: number;
    readonly endedAt: number;
    readonly activeSeconds: number;
    readonly startPage: number;
    readonly endPage: number | null;
}
export type ManualSessionInput = ValidManualSession | { readonly kind: 'invalid'; readonly message: string };

/** T09 / FR-02 / S-36: now도 인자로 받아 검증 결과를 결정적으로 유지한다. */
export function validateManualSession(
    startedAt: number, minutes: string, startPage: string, endPage: string, totalPages: number, now: number,
): ManualSessionInput {
    const invalid = (message: string): ManualSessionInput => ({ kind: 'invalid', message });
    const duration = parseInteger(minutes);
    if (duration === null || duration < 1) return invalid('독서 시간은 1분 이상의 정수로 입력해 주세요.');
    const activeSeconds = duration * 60;
    const endedAt = startedAt + activeSeconds * 1000;
    if (activeSeconds > 2147483647 || !Number.isSafeInteger(startedAt) ||
        !Number.isSafeInteger(endedAt) || !Number.isFinite(new Date(endedAt).getTime())) {
        return invalid('독서 시간을 더 짧게 입력해 주세요.');
    }
    if (!Number.isSafeInteger(now) || endedAt > now) return invalid('독서 종료 시각은 현재 시각을 넘을 수 없어요.');
    const start = parseInteger(startPage);
    if (start === null || start < 0) return invalid('시작 페이지는 0 이상의 정수로 입력해 주세요.');
    if (start > totalPages) return invalid(`시작 페이지는 전체 쪽수(${totalPages}쪽)를 넘을 수 없어요.`);
    const end = parseEndPage(endPage, start, totalPages);
    if (end.kind === 'invalid') return end;
    if (end.kind === 'reread') return invalid('종료 페이지는 시작 페이지 이상으로 입력해 주세요.');
    return { kind: 'valid', startedAt, endedAt, activeSeconds, startPage: start, endPage: end.kind === 'timeOnly' ? null : end.endPage };
}

/** 같은 클라이언트 ID·생성 시각을 보존하고 수정한 TIMER도 MANUAL로 바꾼다. 저장 IO는 호출자가 담당한다. */
export function toManualSession(
    input: ValidManualSession, id: string, bookId: string, existing: ReadingSession | null, now: number,
): ReadingSession {
    if (existing && (existing.id !== id || existing.bookId !== bookId || existing.deleted)) {
        throw new Error('수정할 기록을 찾을 수 없어요.');
    }
    const localVersion = Math.max(now, existing ? existing.localVersion + 1 : now);
    if (!Number.isSafeInteger(localVersion)) throw new Error('기록 버전을 저장할 수 없어요.');
    return {
        id, bookId, startedAt: input.startedAt, endedAt: input.endedAt, activeSeconds: input.activeSeconds,
        startPage: input.startPage, endPage: input.endPage, source: 'MANUAL', deleted: false,
        createdAt: existing?.createdAt ?? now, syncPending: true, localVersion,
    };
}

function sameSession(a: ReadingSession | null, b: ReadingSession | null): boolean {
    if (!a || !b) return a === b;
    return (Object.keys(a) as (keyof ReadingSession)[]).every(key => a[key] === b[key]);
}

/** T09: 한 책의 추가·수정 전후 기록. 과거 기록만 바뀌면 다시 읽기로 초기화한 현재 쪽도 보존한다. */
export function currentPageAfterSave(
    currentPage: number, totalPages: number, before: readonly ReadingSession[], after: readonly ReadingSession[],
): number {
    const latest = latestPaged(after);
    if (sameSession(latestPaged(before), latest)) return currentPage;
    return Math.max(0, Math.min(latest?.endPage ?? 0, Math.max(totalPages, 0)));
}
