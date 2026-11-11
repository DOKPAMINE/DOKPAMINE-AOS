export class SyncValidationError extends Error {}

/** NFR-04·05: 현재 진도보다 오래된 세션도 전체 쪽수 축소의 하한으로 보존한다. */
export function validateSessionPageRange(totalPages: number, sessions: readonly { startPage: number; endPage: number | null; deleted: boolean }[]) {
    if (sessions.some(row => !row.deleted && (row.startPage > totalPages || (row.endPage !== null && row.endPage > totalPages)))) {
        throw new SyncValidationError('전체 쪽수는 저장된 독서 기록의 시작·종료 쪽 이상으로 입력해 주세요.');
    }
}

/** FR-15: 신규 TIMER만 실제 경과 시간으로 검증하며 MANUAL은 랭킹에서 제외한다. */
export function validateNewTimer(row: { source: 'TIMER' | 'MANUAL'; startedAt: number; endedAt: number; activeSeconds: number }) {
    if (row.source === 'TIMER' && (!Number.isSafeInteger(row.activeSeconds) || row.activeSeconds < 0 ||
        row.activeSeconds > Math.floor((row.endedAt - row.startedAt) / 1000))) {
        throw new SyncValidationError('활성 시간이 시작부터 종료까지의 시간을 초과해요. 기기 시각을 확인하거나 기록을 직접 추가해 주세요.');
    }
}
