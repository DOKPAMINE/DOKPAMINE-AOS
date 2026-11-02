/**
 * 앱 루트에서 AOS #19의 실제 src/sync 함수를 등록한다.
 * auth는 동기화 엔진에 직접 의존하지 않으며 동기화 실패가 로그인 성공을 취소하지 않는다.
 */
export interface AuthSyncLifecycle {
    prepareAccount: (userId: string) => Promise<void>;
    syncAfterLogin: (userId: string, token: string) => void | Promise<void>;
    stopRecordSync: () => void;
}

const disconnected: AuthSyncLifecycle = { prepareAccount: async () => {}, syncAfterLogin: () => {}, stopRecordSync: () => {} };
let lifecycle = disconnected;

export function connectAuthSyncLifecycle(next: AuthSyncLifecycle): () => void {
    lifecycle = next;
    return () => { if (lifecycle === next) lifecycle = disconnected; };
}

export const authSyncLifecycle: AuthSyncLifecycle = {
    prepareAccount: userId => lifecycle.prepareAccount(userId),
    syncAfterLogin: (userId, token) => lifecycle.syncAfterLogin(userId, token),
    stopRecordSync: () => lifecycle.stopRecordSync(),
};
