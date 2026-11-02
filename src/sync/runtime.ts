import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { apiRequest } from '../api/client';
import { isOnline, isOnlineState } from '../api/connectivity';
import { putBook, putReview, putSession } from '../api/endpoints';
import { tokenStorage } from '../api/tokenStorage';
import type { RecordRepository } from '../db/repository';
import { createSyncEngine, type SyncEngine, type SyncState } from './engine';
import type { QuoteDto, SyncSnapshot } from './serialization';

let engine: SyncEngine | undefined;
let repository: RecordRepository | undefined;
let cleanup: (() => void) | undefined;
const listeners = new Set<() => void>();
const idleState: SyncState = { status: 'idle' };
export const getSyncState = (): SyncState => engine?.getState() ?? idleState;
export function subscribeSyncState(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** DB 준비 후 한 번 연결한다. 개인 기록 변경·앱 활성화·연결 복구에 전송을 예약한다. */
export function startRecordSync(records: RecordRepository): SyncEngine {
    if (engine && repository === records) return engine;
    stopRecordSync();
    repository = records;
    const current = createSyncEngine(records, {
        putBook, putSession, putReview,
        putQuote: body => apiRequest<QuoteDto>(`/api/quotes/${encodeURIComponent(body.id)}`, { method: 'PUT', body }),
        snapshot: () => apiRequest<SyncSnapshot>('/api/sync/snapshot'),
    }, isOnline);
    engine = current;
    async function trigger(restore = false) {
        try {
            if (!await tokenStorage.get() || engine !== current) return;
            await (restore ? current.afterLogin() : current.sync());
        } catch {
            // SecureStore 조회 실패 시에도 로컬 기록을 유지하며 다음 이벤트에서 재시도한다.
        }
    }
    const unsubscribeState = current.subscribe(() => listeners.forEach(listener => listener()));
    const unsubscribeRecords = records.subscribe(() => { void trigger(); });
    let connected = false;
    const unsubscribeNetwork = NetInfo.addEventListener(state => {
        const next = isOnlineState(state);
        if (next && !connected) void trigger();
        connected = next;
    });
    const appSubscription = AppState.addEventListener('change', state => {
        if (state === 'active') void trigger();
    });
    cleanup = () => { unsubscribeState(); unsubscribeRecords(); unsubscribeNetwork(); appSubscription.remove(); };
    void trigger(true);
    return current;
}

/** 로그인 토큰 저장 이후 호출한다. 오프라인이면 복원 요청을 다음 연결까지 유지한다. */
export async function syncAfterLogin(): Promise<void> {
    if (!repository) throw new Error('기록 저장소를 먼저 초기화해 주세요.');
    await startRecordSync(repository).afterLogin();
}

/** 명시적 로그아웃에서 호출한다. 이미 진행 중인 요청의 완료로 로컬 대기를 해제하지 않는다. */
export function stopRecordSync(): void {
    cleanup?.();
    cleanup = undefined;
    engine?.stop();
    engine = undefined;
    listeners.forEach(listener => listener());
}
