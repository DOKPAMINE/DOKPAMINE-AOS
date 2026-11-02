import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export function isOnlineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
    return state.isConnected === true && state.isInternetReachable !== false;
}

/** NFR-06: 초기 상태 조회가 멈춰도 1초 안에 안내할 수 있도록 500ms로 제한한다. */
export async function isOnline(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            NetInfo.fetch().then(isOnlineState).catch(() => false),
            new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 500); }),
        ]);
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}
