import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { isOnline, isOnlineState } from '../api/connectivity';
import { putBook, putQuote, putReview, putSession, syncSnapshot } from '../api/endpoints';
import type { RecordRepository } from '../db/repository';
import { createSyncEngine, type SyncEngine, type SyncState } from './engine';

let engine: SyncEngine | undefined;
let repository: RecordRepository | undefined;
let engineToken: string | undefined;
let initialRestore: Promise<void> | undefined;
let cleanup: (() => void) | undefined;
const listeners = new Set<() => void>();
const idleState: SyncState = { status: 'idle', failedCount: 0 };
export const getSyncState = (): SyncState => engine?.getState() ?? idleState;
export function subscribeSyncState(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** DB 준비 후 한 번 연결한다. 개인 기록 변경·앱 활성화·연결 복구에 전송을 예약한다. */
export function startRecordSync(records: RecordRepository, accessToken: string): SyncEngine {
    if (!accessToken) throw new Error('로그인이 필요해요.');
    if (engine && repository === records && engineToken === accessToken) return engine;
    stopRecordSync();
    repository = records;
    engineToken = accessToken;
    const controller = new AbortController();
    const options = { accessToken, signal: controller.signal };
    const current = createSyncEngine(records, {
        putBook: body => putBook(body, options), putSession: body => putSession(body, options),
        putReview: body => putReview(body, options), putQuote: body => putQuote(body, options),
        snapshot: () => syncSnapshot(options),
    }, isOnline);
    engine = current;
    async function trigger() {
        if (engine !== current) return;
        await current.sync();
    }
    initialRestore = current.afterLogin();
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
    cleanup = () => { controller.abort(); unsubscribeState(); unsubscribeRecords(); unsubscribeNetwork(); appSubscription.remove(); };
    return current;
}

/** 로그인 토큰 저장 이후 호출한다. 오프라인이면 복원 요청을 다음 연결까지 유지한다. */
export async function syncAfterLogin(records: RecordRepository, accessToken: string): Promise<void> {
    startRecordSync(records, accessToken);
    await initialRestore;
}

/** 명시적 로그아웃에서 호출한다. 이미 진행 중인 요청의 완료로 로컬 대기를 해제하지 않는다. */
export function stopRecordSync(): void {
    cleanup?.();
    cleanup = undefined;
    engine?.stop();
    engine = undefined;
    repository = undefined;
    engineToken = undefined;
    initialRestore = undefined;
    listeners.forEach(listener => listener());
}
