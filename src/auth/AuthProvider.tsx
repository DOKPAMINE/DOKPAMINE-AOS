import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '../api/errors';
import { onUnauthorized, wasUnauthorized } from '../api/authEvents';
import { queryClient } from '../api/queryClient';
import { tokenStorage, type StoredSession } from '../api/tokenStorage';
import type { TokenResponse } from '../api/types';
import { onboardingStorage } from './onboardingStorage';
import { authSyncLifecycle } from './syncLifecycle';

type AuthStatus = 'loading' | 'error' | 'onboarding' | 'signedOut' | 'signedIn';
interface AuthState { status: AuthStatus; notice?: string }
interface AuthContextValue extends AuthState {
    retry: () => void;
    recoverSession: () => Promise<void>;
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
    const revision = useRef(0);
    const advanceRevision = useCallback(() => ++revision.current, []);
    // 만료 처리와 새 로그인 저장이 겹쳐도 저장 순서를 보장한다.
    const writes = useRef<Promise<unknown>>(Promise.resolve());
    const persist = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
        const next = writes.current.catch(() => {}).then(work);
        writes.current = next;
        return next;
    }, []);

    useEffect(() => {
        let active = true;
        const started = advanceRevision();
        authSyncLifecycle.stopRecordSync();
        void Promise.all([tokenStorage.getSession(), tokenStorage.get(), onboardingStorage.hasSeen()])
            .then(async ([saved, token, hasSeen]) => {
                if (!active || started !== revision.current) return;
                if (saved && saved.accessToken !== invalidatedToken.current && !wasUnauthorized(saved.accessToken) && Date.parse(saved.expiresAt) > Date.now()) {
                    await authSyncLifecycle.prepareAccount(saved.userId);
                    if (!active || started !== revision.current) return;
                    if (wasUnauthorized(saved.accessToken) || Date.parse(saved.expiresAt) <= Date.now()) {
                        setState({ status: 'signedOut', notice: EXPIRED_NOTICE });
                        return;
                    }
                    session.current = saved;
                    setState({ status: 'signedIn' });
                    void Promise.resolve().then(() => {
                        if (active && session.current === saved) return authSyncLifecycle.syncAfterLogin(saved.userId, saved.accessToken);
                    }).catch(() => {});
                } else {
                    setState({ status: hasSeen || token ? 'signedOut' : 'onboarding', notice: token ? EXPIRED_NOTICE : undefined });
                }
            }).catch(() => {
                if (active && started === revision.current) setState({ status: 'error', notice: '로그인 정보를 불러오지 못했어요. 다시 시도해 주세요.' });
            });
        return () => { active = false; advanceRevision(); authSyncLifecycle.stopRecordSync(); };
    }, [attempt, advanceRevision]);

    const expire = useCallback((token: string) => {
        if (session.current?.accessToken !== token) return;
        const started = ++revision.current;
        invalidatedToken.current = token;
        session.current = null;
        authSyncLifecycle.stopRecordSync();
        queryClient.clear();
        setState({ status: 'signedOut', notice: EXPIRED_NOTICE });
        void persist(() => tokenStorage.invalidateSession()).catch(() => {
            if (started === revision.current) setState({ status: 'error', notice: '로그인 상태를 저장하지 못했어요. 다시 시도해 주세요.' });
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

    const recoverSession = async () => {
        const started = ++revision.current;
        // 인증 키만 정리한다. DB의 개인 기록과 안내 완료 상태는 보존한다.
        authSyncLifecycle.stopRecordSync();
        session.current = null;
        setState({ status: 'loading' });
        try {
            await persist(() => tokenStorage.remove());
            if (started !== revision.current) return;
            queryClient.clear();
            setState({ status: 'signedOut', notice: '로그인 정보를 새로 저장할 수 있도록 다시 로그인해 주세요.' });
        } catch {
            if (started === revision.current) setState({ status: 'error', notice: '로그인 정보를 초기화하지 못했어요. 다시 시도해 주세요.' });
        }
    };

    const completeOnboarding = async () => {
        await persist(() => onboardingStorage.complete());
        setState({ status: 'signedOut' });
    };

    const signIn = async (response: TokenResponse) => {
        if (!response.accessToken || !response.user?.id?.trim() || response.user.id.length > 128 || wasUnauthorized(response.accessToken) || !Number.isFinite(Date.parse(response.expiresAt)) || Date.parse(response.expiresAt) <= Date.now()) {
            throw new ApiError('invalid-response', 'INVALID_SESSION', '로그인 응답을 확인하지 못했어요. 다시 시도해 주세요.');
        }
        const next = { accessToken: response.accessToken, expiresAt: response.expiresAt, userId: response.user.id };
        const started = ++revision.current;
        authSyncLifecycle.stopRecordSync();
        session.current = null;
        queryClient.clear();
        setState({ status: 'signedOut' });
        try {
            await persist(async () => {
                await authSyncLifecycle.prepareAccount(next.userId);
                await onboardingStorage.complete();
                await tokenStorage.saveSession(next);
            });
        } catch {
            throw new ApiError('storage', 'TOKEN_STORAGE_FAILED', '로그인 정보를 저장하지 못했어요. 다시 시도해 주세요.');
        }
        if (started !== revision.current) return;
        if (wasUnauthorized(next.accessToken) || Date.parse(next.expiresAt) <= Date.now()) {
            invalidatedToken.current = next.accessToken;
            await persist(() => tokenStorage.invalidateSession());
            throw new ApiError('unauthorized', 'SESSION_EXPIRED', EXPIRED_NOTICE);
        }
        queryClient.clear();
        invalidatedToken.current = null;
        session.current = next;
        setState({ status: 'signedIn' });
        // 동기화 엔진이 재시도를 관리하며 오프라인에서도 로그인된 화면은 열린다.
        void Promise.resolve().then(() => { if (session.current === next) return authSyncLifecycle.syncAfterLogin(next.userId, next.accessToken); }).catch(() => {});
    };

    const signOut = async () => {
        const started = ++revision.current;
        authSyncLifecycle.stopRecordSync();
        invalidatedToken.current = session.current?.accessToken ?? invalidatedToken.current;
        session.current = null;
        queryClient.clear();
        setState({ status: 'loading' });
        try {
            await persist(() => tokenStorage.remove());
            if (started === revision.current) setState({ status: 'signedOut' });
        } catch {
            if (started === revision.current) setState({ status: 'error', notice: '로그아웃 정보를 저장하지 못했어요. 다시 로그인하기로 초기화해 주세요.' });
        }
    };

    return <AuthContext.Provider value={{ ...state, retry: () => { setState({ status: 'loading' }); setAttempt(value => value + 1); }, recoverSession, completeOnboarding, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const value = useContext(AuthContext);
    if (!value) throw new Error('AuthProvider가 필요합니다.');
    return value;
}
