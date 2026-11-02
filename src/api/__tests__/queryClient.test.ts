import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { connectQueryManagers, queryClient } from '../queryClient';

jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: jest.fn() } }));

let notifyOnline: (state: NetInfoState) => void;
let notifyFocus: (state: AppStateStatus) => void;
let disconnect: () => void;
const removeOnline = jest.fn();
const removeFocus = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(NetInfo.addEventListener).mockImplementation(listener => {
        notifyOnline = listener;
        return removeOnline;
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
        notifyFocus = listener;
        return { remove: removeFocus };
    });
    disconnect = connectQueryManagers();
});

afterEach(() => {
    queryClient.clear();
    disconnect();
    onlineManager.setOnline(true);
    focusManager.setFocused(undefined);
    jest.restoreAllMocks();
});

test('NFR-06 · S-71 NetInfo 첫 이벤트 전과 연결이 없을 때 Query를 온라인으로 간주하지 않아요', () => {
    expect(onlineManager.isOnline()).toBe(false);
    notifyOnline({ isConnected: true, isInternetReachable: true } as NetInfoState);
    expect(onlineManager.isOnline()).toBe(true);
    notifyOnline({ isConnected: true, isInternetReachable: false } as NetInfoState);
    expect(onlineManager.isOnline()).toBe(false);
    notifyOnline({ isConnected: false, isInternetReachable: null } as NetInfoState);
    expect(onlineManager.isOnline()).toBe(false);
});

test('NFR-05 · S-10 앱 활성·백그라운드 상태를 focusManager에 전달해요', () => {
    expect(focusManager.isFocused()).toBe(AppState.currentState === 'active');
    notifyFocus('active');
    expect(focusManager.isFocused()).toBe(true);
    notifyFocus('background');
    expect(focusManager.isFocused()).toBe(false);
    notifyFocus('inactive');
    expect(focusManager.isFocused()).toBe(false);
});

test('NFR-06 · S-71 오프라인 Query는 호출하지 않고 연결 복구 후에만 실행해요', async () => {
    notifyFocus('active');
    queryClient.mount();
    const queryFn = jest.fn(async () => ['소설']);
    const pending = queryClient.fetchQuery({ queryKey: ['genres'], queryFn });
    try {
        await Promise.resolve();
        expect(queryFn).not.toHaveBeenCalled();
        expect(queryClient.getQueryState(['genres'])?.fetchStatus).toBe('paused');
        notifyOnline({ isConnected: true, isInternetReachable: true } as NetInfoState);
        await expect(pending).resolves.toEqual(['소설']);
        expect(queryFn).toHaveBeenCalledTimes(1);
    } finally {
        queryClient.unmount();
    }
});

test('NFR-05 · S-10 구독을 해제하고 다시 연결해도 이전 리스너를 남기지 않아요', () => {
    disconnect();
    expect(removeOnline).toHaveBeenCalledTimes(1);
    expect(removeFocus).toHaveBeenCalledTimes(1);
    disconnect = connectQueryManagers();
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(2);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(2);
});
