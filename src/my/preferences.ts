import Storage from 'expo-sqlite/kv-store';
import { useEffect, useState } from 'react';
import { tokenStorage } from '../api/tokenStorage';

export type ReviewVisibility = 'PRIVATE' | 'PUBLIC';

/** S-81 / FR-08: 기기 내 계정별 설정이며 기존 감상의 공개 범위는 바꾸지 않는다. */
export const reviewPreferences = {
    load(userId: string): ReviewVisibility {
        return Storage.getItemSync(`review-visibility:${userId}`) === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
    },
    save(userId: string, visibility: ReviewVisibility) {
        Storage.setItemSync(`review-visibility:${userId}`, visibility);
    },
};

/** S-51: 계정의 기본값을 읽은 뒤 폼을 열어 작성 중인 선택을 덮어쓰지 않는다. */
export function useReviewVisibility() {
    const [visibility, setVisibility] = useState<ReviewVisibility>();
    useEffect(() => {
        let active = true;
        void tokenStorage.getSession().then(session => {
            const value = session ? reviewPreferences.load(session.userId) : 'PRIVATE';
            if (active) setVisibility(value);
        }).catch(() => { if (active) setVisibility('PRIVATE'); });
        return () => { active = false; };
    }, []);
    return visibility;
}
