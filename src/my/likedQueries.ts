import { useInfiniteQuery, useQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { isOnline } from '../api/connectivity';
import { likedBooks } from '../api/endpoints';
import { ApiError, offlineError } from '../api/errors';
import type { LikedBookPage } from '../api/types';
import { LIKED_PAGE_SIZE, LIKED_PREVIEW_SIZE, nextLikedCursor } from '../domain/likedReviews';

/**
 * #132 FR-09 S-80 좋아요한 감상 조회. 서버 응답은 화면에만 쓰고 로컬 DB에 저장하지 않는다(개인 기록이 아니다).
 * 라운지 키(['lounge', …])와 나눠 라운지의 좋아요 캐시 수정이 이 목록을 건드리지 않게 한다.
 */
export const likedBookKeys = {
    all: ['my', 'liked-books'] as const,
    preview: ['my', 'liked-books', 'preview'] as const,
    list: ['my', 'liked-books', 'list'] as const,
};

/** ADR-0003: 연결을 먼저 확인하고(최대 500ms) 오프라인이면 요청하지 않는다. */
async function connected<T>(request: () => Promise<T>): Promise<T> {
    if (!await isOnline()) throw offlineError();
    return request();
}

// always는 Query의 오프라인 대기 대신 연결 확인 후 StateView로 안내한다(라운지와 같다).
const options = { networkMode: 'always' as const, retry: false, staleTime: 0 };

/** S-80 "좋아요한 감상" 미리보기: 최근 책 묶음 3개. */
export function useLikedPreview() {
    return useQuery({ ...options, queryKey: likedBookKeys.preview,
        queryFn: ({ signal }) => connected(() => likedBooks({ size: LIKED_PREVIEW_SIZE }, signal)) });
}

/** S-80: 마이 탭은 화면이 남아 있어, 들어올 때마다 다시 받는다. 처음 조회와 겹치면 그 조회를 기다린다. */
export function refetchLikedPreview(client: QueryClient) {
    return client.refetchQueries({ queryKey: likedBookKeys.preview, exact: true }, { cancelRefetch: false });
}

/**
 * S-80 하위 좋아요한 감상 목록: 20개씩 nextCursor로 이어 받는다.
 * S-76에 갔다 돌아와도 스크롤 위치를 지키도록 앱 복귀·재연결로는 다시 받지 않는다.
 * 좋아요를 바꾸면 invalidateLikedBooks로 다시 받는다.
 */
export function useLikedBookPages() {
    return useInfiniteQuery({
        ...options, queryKey: likedBookKeys.list, refetchOnWindowFocus: false, refetchOnReconnect: false,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) => connected(() => likedBooks({ size: LIKED_PAGE_SIZE, cursor: pageParam }, signal)),
        getNextPageParam: nextLikedCursor,
    });
}

/** 아래로 당겨 새로고침: 보이던 목록은 둔 채 첫 페이지만 남기고 처음부터 다시 받는다. */
export function refreshLikedBookPages(client: QueryClient) {
    client.setQueryData<InfiniteData<LikedBookPage, string | undefined>>(likedBookKeys.list, data => data && {
        pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1),
    });
    return client.refetchQueries({ queryKey: likedBookKeys.list, exact: true });
}

/** 400(잘못된 cursor 등): 받아 둔 페이지를 버리고 처음부터 다시 받는다. */
export function restartLikedBookPages(client: QueryClient) {
    return client.resetQueries({ queryKey: likedBookKeys.list, exact: true });
}

/**
 * S-72·S-76 등에서 좋아요를 누르거나 취소했거나, S-76이 404(삭제·비공개 전환)일 때 좋아요한 감상 조회를 무효로 한다.
 * - 전체 목록: 화면에 남아 있으면 바로 다시 받아 돌아왔을 때 목록이 맞다.
 * - 미리보기: 마이 탭은 늘 떠 있어 바로 다시 받으면 좋아요마다 요청이 나간다. 표시만 하고 마이 탭에 들어올 때 받는다.
 */
export function invalidateLikedBooks(client: QueryClient) {
    return Promise.all([
        client.invalidateQueries({ queryKey: likedBookKeys.preview, exact: true, refetchType: 'none' }),
        client.invalidateQueries({ queryKey: likedBookKeys.list, exact: true }),
    ]);
}

export const isBadRequest = (error: unknown) => error instanceof ApiError && error.status === 400;
export const isOfflineError = (error: unknown) => error instanceof ApiError && error.kind === 'offline';
