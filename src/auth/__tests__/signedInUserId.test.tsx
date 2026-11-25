import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AppState, Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { notifyUnauthorized } from '../../api/authEvents';
import { queryClient } from '../../api/queryClient';
import type { TokenResponse } from '../../api/types';
import { AuthProvider, useAuth, useSignedInUserId } from '../AuthProvider';

jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(), getItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

const stored = new Map<string, string>();
let tokenNumber = 0;
const response = (userId: string, expiresAt = '2099-01-01T00:00:00Z'): TokenResponse => ({
    accessToken: `user-id-test-token-${++tokenNumber}`, expiresAt,
    user: { id: userId, username: userId, nickname: '독자', rankingOptIn: false },
});

// 실제 AuthProvider 아래에서 계정 ID와 로그인 상태를 화면에 적고, 지금까지 본 계정 ID를 모두 남긴다.
let controls: ReturnType<typeof useAuth>;
let seen: (string | undefined)[] = [];
function Probe() {
    const auth = useAuth();
    const userId = useSignedInUserId();
    // 화면에 반영된(커밋된) 값마다 남긴다.
    useEffect(() => {
        controls = auth;
        seen.push(userId);
    });
    return <Text testID="probe">{`${auth.status}:${userId ?? '없음'}`}</Text>;
}
const renderProvider = () => render(<AuthProvider><Probe /></AuthProvider>);
const probe = () => screen.getByTestId('probe');
let appStateListener: ((state: string) => void) | undefined;

beforeEach(() => {
    jest.clearAllMocks();
    stored.clear();
    seen = [];
    appStateListener = undefined;
    stored.set('dokpamine.onboardingSeen', 'true');
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => stored.get(key) ?? null);
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { stored.set(key, value); });
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { stored.delete(key); });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
        appStateListener = listener as (state: string) => void;
        return { remove: jest.fn() };
    });
});
afterEach(() => { queryClient.clear(); jest.restoreAllMocks(); });

describe('#124 FR-10 AuthProvider 로그인한 계정 ID', () => {
    test('저장된 세션으로 다시 열면 그 계정 ID를 주고, 로그인 전에는 계정 ID가 없어요', async () => {
        const saved = response('reader-a');
        stored.set('dokpamine.accessToken', saved.accessToken);
        stored.set('dokpamine.authSession', JSON.stringify({ accessToken: saved.accessToken, expiresAt: saved.expiresAt, userId: 'reader-a' }));
        await renderProvider();
        await waitFor(() => expect(probe()).toHaveTextContent('signedIn:reader-a'));
        // 저장된 세션을 읽는 중(loading)에는 계정 ID가 없다.
        expect(seen[0]).toBeUndefined();
    });

    test('로그인하면 그 계정 ID가 되고 로그아웃하면 없어져요', async () => {
        await renderProvider();
        await waitFor(() => expect(probe()).toHaveTextContent('signedOut:없음'));
        await act(() => controls.signIn(response('reader-a')));
        expect(probe()).toHaveTextContent('signedIn:reader-a');
        await act(() => controls.signOut());
        expect(probe()).toHaveTextContent('signedOut:없음');
    });

    test('다른 계정으로 바로 로그인하면 바뀌는 동안 이전 계정 ID를 주지 않고 새 계정 ID가 돼요', async () => {
        await renderProvider();
        await waitFor(() => expect(probe()).toHaveTextContent('signedOut:없음'));
        await act(() => controls.signIn(response('reader-a')));
        expect(probe()).toHaveTextContent('signedIn:reader-a');
        // 새 세션 저장을 붙잡아 바뀌는 중간 상태를 본다.
        let finishSave!: () => void;
        jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => {
            await new Promise<void>(done => { finishSave = done; });
            stored.set(key, value);
        });
        const before = seen.length;
        let switching!: Promise<void>;
        await act(async () => { switching = controls.signIn(response('reader-b')); });
        expect(probe()).toHaveTextContent('signedOut:없음');
        await act(async () => { finishSave(); await switching; });
        expect(probe()).toHaveTextContent('signedIn:reader-b');
        // 바뀌는 동안은 계정 ID가 없다가 새 계정 ID가 되고, 이전 계정 ID로 돌아가지 않는다.
        expect(new Set(seen.slice(before))).toEqual(new Set([undefined, 'reader-b']));
    });

    test('보호 API가 401을 받아 로그인이 만료되면 계정 ID가 없어져요', async () => {
        await renderProvider();
        await waitFor(() => expect(probe()).toHaveTextContent('signedOut:없음'));
        const token = response('reader-a');
        await act(() => controls.signIn(token));
        expect(probe()).toHaveTextContent('signedIn:reader-a');
        await act(async () => { notifyUnauthorized(token.accessToken); });
        expect(probe()).toHaveTextContent('signedOut:없음');
        expect(controls.notice).toBe('로그인 기간이 만료되었어요. 다시 로그인해 주세요.');
    });

    test('앱에 돌아왔을 때 로그인 기간이 지났으면 계정 ID가 없어져요', async () => {
        await renderProvider();
        await waitFor(() => expect(probe()).toHaveTextContent('signedOut:없음'));
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await act(() => controls.signIn(response('reader-a', expiresAt)));
        expect(probe()).toHaveTextContent('signedIn:reader-a');
        jest.spyOn(Date, 'now').mockReturnValue(Date.parse(expiresAt) + 1);
        await act(async () => { appStateListener?.('active'); });
        expect(probe()).toHaveTextContent('signedOut:없음');
    });
});
