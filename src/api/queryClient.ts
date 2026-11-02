import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { isOnlineState } from './connectivity';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: { networkMode: 'online', retry: false },
        mutations: { networkMode: 'online', retry: false },
    },
});

/** 루트 effect에서 한 번 연결하고 언마운트 시 네이티브 구독을 정리한다. */
export function connectQueryManagers(): () => void {
    // NetInfo의 첫 이벤트 전에는 온라인이라고 추측해 요청하지 않는다.
    onlineManager.setOnline(false);
    onlineManager.setEventListener(setOnline => NetInfo.addEventListener(state => setOnline(isOnlineState(state))));
    focusManager.setFocused(AppState.currentState === 'active');
    focusManager.setEventListener(setFocused => {
        const subscription = AppState.addEventListener('change', state => setFocused(state === 'active'));
        return () => subscription.remove();
    });

    return () => {
        onlineManager.setEventListener(() => () => {});
        focusManager.setEventListener(() => () => {});
    };
}
