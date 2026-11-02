import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'dokpamine.accessToken';
const SESSION_KEY = 'dokpamine.authSession';

export interface StoredSession { accessToken: string; expiresAt: string }

/** 401에서는 삭제하지 않는다. 삭제는 명시적 로그아웃에서만 호출한다(ADR-0003). */
export const tokenStorage = {
    save: (token: string): Promise<void> => SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token),
    get: (): Promise<string | null> => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    remove: async (): Promise<void> => {
        await Promise.all([SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY), SecureStore.deleteItemAsync(SESSION_KEY)]);
    },
    saveSession: async (session: StoredSession): Promise<void> => {
        await tokenStorage.save(session.accessToken);
        await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    },
    getSession: async (): Promise<StoredSession | null> => {
        const [token, raw] = await Promise.all([tokenStorage.get(), SecureStore.getItemAsync(SESSION_KEY)]);
        if (!token || !raw) return null;
        try {
            const value: unknown = JSON.parse(raw);
            if (typeof value === 'object' && value !== null && 'accessToken' in value && value.accessToken === token &&
                'expiresAt' in value && typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt))) {
                return { accessToken: token, expiresAt: value.expiresAt };
            }
        } catch { /* 파손된 메타데이터는 로그인 필요 상태로 처리한다. */ }
        return null;
    },
    // 401에서 원래 토큰과 개인 기록은 보존하고 재실행 시에도 재로그인을 요구한다.
    invalidateSession: (): Promise<void> => SecureStore.deleteItemAsync(SESSION_KEY),
};
