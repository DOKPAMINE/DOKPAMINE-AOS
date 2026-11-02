import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '../api/errors';
import { onUnauthorized } from '../api/authEvents';
import { queryClient } from '../api/queryClient';
import { tokenStorage, type StoredSession } from '../api/tokenStorage';
import type { TokenResponse } from '../api/types';
import { onboardingStorage } from './onboardingStorage';
import { authSyncLifecycle } from './syncLifecycle';

type AuthStatus = 'loading' | 'error' | 'onboarding' | 'signedOut' | 'signedIn';
interface AuthState { status: AuthStatus; notice?: string }
interface AuthContextValue extends AuthState {
    retry: () => void;
    completeOnboarding: () => Promise<void>;
    signIn: (response: TokenResponse) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const EXPIRED_NOTICE = '로그인 기간이 만료되었어요. 다시 로그인해 주세요.';

export function AuthProvider({ children }: PropsWithChildren) {
    const [state, setState] = useState<AuthState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const session = useRef<StoredSession | null>(null);
    const invalidatedToken = useRef<string | null>(null);
    // 만료 처리와 새 로그인 저장이 겹쳐도 저장 순서를 보장한다.
    const writes = useRef<Promise<unknown>>(Promise.resolve());
    const persist = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
        const next = writes.current.catch(() => {}).then(work);
        writes.current = next;
        return next;
    }, []);

    useEffect(() => {
        let active = true;
        void Promise.all([tokenStorage.getSession(), tokenStorage.get(), onboardingStorage.hasSeen()])
            .then(([saved, token, hasSeen]) => {
                if (!active) return;
                if (saved && saved.accessToken !== invalidatedToken.current && Date.parse(saved.expiresAt) > Date.now()) {
                    session.current = saved;
                    setState({ status: 'signedIn' });
                } else {
                    setState({ status: hasSeen || token ? 'signedOut' : 'onboarding', notice: token ? EXPIRED_NOTICE : undefined });
                }
            }).catch(() => {
                if (active) setState({ status: 'error', notice: '로그인 정보를 불러오지 못했어요. 다시 시도해 주세요.' });
            });
        return () => { active = false; };
    }, [attempt]);

    const expire = useCallback((token: string) => {
        if (session.current?.accessToken !== token) return;
        invalidatedToken.current = token;
        session.current = null;
        authSyncLifecycle.stopRecordSync();
        queryClient.clear();
        setState({ status: 'signedOut', notice: EXPIRED_NOTICE });
        void persist(() => tokenStorage.invalidateSession()).catch(() => {
            setState({ status: 'error', notice: '로그인 상태를 저장하지 못했어요. 다시 시도해 주세요.' });
        });
    }, [persist]);

    useEffect(() => onUnauthorized(expire), [expire]);

    useEffect(() => {
        const current = session.current;
        if (state.status !== 'signedIn' || !current) return;
        const checkExpiry = () => {
            if (Date.parse(current.expiresAt) <= Date.now()) expire(current.accessToken);
        };
        const timer = setTimeout(checkExpiry, Math.min(Date.parse(current.expiresAt) - Date.now(), 2_147_483_647));
        const subscription = AppState.addEventListener('change', next => { if (next === 'active') checkExpiry(); });
        return () => { clearTimeout(timer); subscription.remove(); };
    }, [state, expire]);

    const completeOnboarding = async () => {
        await persist(() => onboardingStorage.complete());
        setState({ status: 'signedOut' });
    };

    const signIn = async (response: TokenResponse) => {
        if (!response.accessToken || !Number.isFinite(Date.parse(response.expiresAt)) || Date.parse(response.expiresAt) <= Date.now()) {
            throw new ApiError('invalid-response', 'INVALID_SESSION', '로그인 응답을 확인하지 못했어요. 다시 시도해 주세요.');
        }
        const next = { accessToken: response.accessToken, expiresAt: response.expiresAt };
        try {
            await persist(async () => {
                await onboardingStorage.complete();
                await tokenStorage.saveSession(next);
            });
        } catch {
            throw new ApiError('storage', 'TOKEN_STORAGE_FAILED', '로그인 정보를 저장하지 못했어요. 다시 시도해 주세요.');
        }
        queryClient.clear();
        invalidatedToken.current = null;
        session.current = next;
        setState({ status: 'signedIn' });
        // 동기화 엔진이 재시도를 관리하며 오프라인에서도 로그인된 화면은 열린다.
        void Promise.resolve().then(() => { if (session.current === next) return authSyncLifecycle.syncAfterLogin(); }).catch(() => {});
    };

    const signOut = async () => {
        authSyncLifecycle.stopRecordSync();
        await persist(() => tokenStorage.remove());
        session.current = null;
        queryClient.clear();
        setState({ status: 'signedOut' });
    };

    return <AuthContext.Provider value={{ ...state, retry: () => { setState({ status: 'loading' }); setAttempt(value => value + 1); }, completeOnboarding, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const value = useContext(AuthContext);
    if (!value) throw new Error('AuthProvider가 필요합니다.');
    return value;
}
