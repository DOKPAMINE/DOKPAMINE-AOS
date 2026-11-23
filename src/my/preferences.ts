import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useState } from 'react';
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

/**
 * FR-08 / S-31: 감상이 아직 없는 책에서 고른 공개 범위를 기기에 계정별로 저장한다.
 * 첫 한줄평·독후감이 이 값을 따르고, 그다음부터는 감상들의 visibility로 책의 공개 범위를 판단한다.
 * 이 값은 서버로 동기화하지 않는다. 앱을 다시 설치하거나 다른 기기에서 열면 S-81 기본 공개 범위로 돌아간다.
 */
export const bookVisibilityPreferences = {
    load(userId: string, bookId: string): ReviewVisibility | null {
        const value = Storage.getItemSync(`book-review-visibility:${userId}:${bookId}`);
        return value === 'PUBLIC' || value === 'PRIVATE' ? value : null;
    },
    save(userId: string, bookId: string, visibility: ReviewVisibility) {
        Storage.setItemSync(`book-review-visibility:${userId}:${bookId}`, visibility);
    },
};

/** #91 S-50: 지금 로그인한 계정의 책별 공개 범위를 저장한다. 로그인 전이면 저장하지 않는다. */
export async function saveBookVisibilityForCurrentUser(bookId: string, visibility: ReviewVisibility): Promise<void> {
    const userId = (await tokenStorage.getSession())?.userId;
    if (userId) bookVisibilityPreferences.save(userId, bookId, visibility);
}

/**
 * S-31·S-51·S-53: 감상이 없는 책이 따를 공개 범위(기기에 저장한 책별 값, 없으면 S-81 기본값)를 읽는다.
 * 계정을 확인한 뒤 화면을 열어 작성 중인 값을 덮어쓰지 않는다. save는 저장 실패 시 예외를 던진다.
 */
export function useBookReviewVisibility(bookId: string) {
    const [state, setState] = useState<{ userId: string | null; visibility: ReviewVisibility }>();
    useEffect(() => {
        let active = true;
        void tokenStorage.getSession().then(session => {
            const userId = session?.userId ?? null;
            const visibility = userId ? bookVisibilityPreferences.load(userId, bookId) ?? reviewPreferences.load(userId) : 'PRIVATE';
            if (active) setState({ userId, visibility });
        }).catch(() => { if (active) setState({ userId: null, visibility: 'PRIVATE' }); });
        return () => { active = false; };
    }, [bookId]);
    const userId = state?.userId ?? null;
    const save = useCallback((visibility: ReviewVisibility) => {
        if (userId) bookVisibilityPreferences.save(userId, bookId, visibility);
        setState({ userId, visibility });
    }, [userId, bookId]);
    return state && { visibility: state.visibility, save };
}
