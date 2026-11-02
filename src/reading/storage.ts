import Storage from 'expo-sqlite/kv-store';
import { deserializeTimer, serializeTimer, type TimerState } from '../domain/timerState';

export interface ReadingDraft { timer: TimerState; confirmedChecks: number }

/** 진행 중 상태만 KV에 보관한다. 개인 기록은 공통 RecordRepository에 저장한다. */
export function readingStorage(userId: string) {
    const key = `reading-timer:${userId}`;
    return {
        load(): ReadingDraft | null {
            const raw = Storage.getItemSync(key);
            if (raw === null) return null;
            const draft: unknown = JSON.parse(raw);
            if (!draft || typeof draft !== 'object' || !('timer' in draft) || typeof draft.timer !== 'string' ||
                !('confirmedChecks' in draft) || typeof draft.confirmedChecks !== 'number' ||
                !Number.isSafeInteger(draft.confirmedChecks) || draft.confirmedChecks < 0) throw new Error('타이머 상태를 확인해 주세요.');
            const timer = deserializeTimer(draft.timer);
            if (!timer) throw new Error('타이머 상태를 확인해 주세요.');
            return { timer, confirmedChecks: draft.confirmedChecks };
        },
        save(draft: ReadingDraft) {
            Storage.setItemSync(key, JSON.stringify({ timer: serializeTimer(draft.timer), confirmedChecks: draft.confirmedChecks }));
        },
        clear() { Storage.removeItemSync(key); },
    };
}
