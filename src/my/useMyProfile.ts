import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { isOnline } from '../api/connectivity';
import { me } from '../api/endpoints';
import { tokenStorage } from '../api/tokenStorage';
import type { MeResponse } from '../api/types';

type ProfileState = { kind: 'loading' | 'error' } | {
    kind: 'ready'; userId: string; profile: MeResponse | null; offline: boolean; failed: boolean;
};

function cachedProfile(userId: string): MeResponse | null {
    try {
        const raw = Storage.getItemSync(`my-profile:${userId}`);
        const value: unknown = raw === null ? null : JSON.parse(raw);
        if (value && typeof value === 'object' && 'id' in value && value.id === userId &&
            'nickname' in value && typeof value.nickname === 'string' &&
            'rankingOptIn' in value && typeof value.rankingOptIn === 'boolean') return value as MeResponse;
    } catch { /* 캐시가 없어도 개인 기록은 조회할 수 있다. */ }
    return null;
}

/** S-80~81: 연결 확인 후 계정을 조회하고 마지막 닉네임을 계정별로 보관한다. */
export function useMyProfile() {
    const [state, setState] = useState<ProfileState>({ kind: 'loading' });
    const [attempt, setAttempt] = useState(0);
    useFocusEffect(useCallback(() => {
        let active = true;
        void (async () => {
            const session = await tokenStorage.getSession();
            if (!session) throw new Error('로그인이 필요해요.');
            const cached = cachedProfile(session.userId);
            if (!active) return;
            setState({ kind: 'ready', userId: session.userId, profile: cached, offline: false, failed: false });
            const online = await isOnline();
            if (!active) return;
            if (!online) {
                setState({ kind: 'ready', userId: session.userId, profile: cached, offline: true, failed: false });
                return;
            }
            try {
                const profile = await me();
                if (!active) return;
                if (profile.id !== session.userId) throw new Error('계정을 확인하지 못했어요.');
                try { Storage.setItemSync(`my-profile:${session.userId}`, JSON.stringify(profile)); } catch { /* 캐시 실패는 조회 성공을 막지 않는다. */ }
                setState({ kind: 'ready', userId: session.userId, profile, offline: false, failed: false });
            } catch {
                if (active) setState({ kind: 'ready', userId: session.userId, profile: cached, offline: false, failed: true });
            }
        })().catch(() => { if (active) setState({ kind: 'error' }); });
        return () => { active = false; };
    // 재시도는 포커스 조회를 다시 실행하는 키다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]));
    return { state, retry: () => setAttempt(value => value + 1) };
}
