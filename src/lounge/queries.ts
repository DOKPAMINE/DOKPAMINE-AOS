import { useRef } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { feedItem, feedList, likeReview, searchBookReviews, unlikeReview } from '../api/endpoints';
import { subscribeReviewsSynced } from '../sync/runtime';
import { isOnline } from '../api/connectivity';
import { ApiError, offlineError } from '../api/errors';
import type { BookReviewSearchResponse, FeedItem, FeedListResponse, ReviewLikeResponse } from '../api/types';

export const loungeKeys = {
    all: ['lounge'] as const,
    feed: ['lounge', 'feed'] as const,
    books: (query: string) => ['lounge', 'books', query] as const,
    item: (id: string) => ['lounge', 'item', id] as const,
};

async function connected<T>(request: () => Promise<T>): Promise<T> {
    if (!await isOnline()) throw offlineError();
    return request();
}

// always는 Query의 오프라인 대기 대신 500ms 연결 확인 후 StateView로 안내한다.
const options = { networkMode: 'always' as const, retry: false, staleTime: 0 };
export function useFeed() {
    return useQuery({ ...options, queryKey: loungeKeys.feed, queryFn: ({ signal }) => connected(() => feedList(signal)) });
}
/**
 * #91 S-70: 라운지 탭은 화면이 남아 있어 다시 열어도 조회하지 않는다. 탭에 돌아올 때마다 서버에서 다시 받는다.
 * 처음 열 때의 조회와 겹치면 새로 시작하지 않고 그 조회를 기다린다.
 */
export function refetchFeed(client: QueryClient) {
    return client.refetchQueries({ queryKey: loungeKeys.feed, exact: true }, { cancelRefetch: false });
}

/**
 * #91 S-70~72: 내 감상을 고치거나 지우거나 공개 범위를 바꿔 서버에 보낸 동기화가 끝나면 라운지 조회를 모두 무효로 한다.
 * 화면에 있는 목록·검색·상세는 바로 다시 받고, 나머지는 다음에 열 때 받는다. 루트 레이아웃에서 한 번 연결한다.
 */
export function connectLoungeSyncRefresh(client: QueryClient, subscribe: (listener: () => void) => () => void = subscribeReviewsSynced) {
    return subscribe(() => { void client.invalidateQueries({ queryKey: loungeKeys.all }); });
}

/** #91 S-72: 상세가 404면 지워졌거나 비공개로 바뀐 감상이다. 목록·검색에 남은 그 감상을 지우도록 다시 받게 한다. */
export function invalidateLoungeLists(client: QueryClient) {
    return client.invalidateQueries({ queryKey: loungeKeys.all, predicate: query => query.queryKey[1] !== 'item' });
}

export function useBookReviews(query: string) {
    return useQuery({ ...options, queryKey: loungeKeys.books(query), enabled: query.trim().length > 0,
        queryFn: () => connected(() => searchBookReviews(query)) });
}
export function useFeedItem(id: string) {
    return useQuery({ ...options, queryKey: loungeKeys.item(id), enabled: id.length > 0,
        queryFn: ({ signal }) => connected(() => feedItem(id, signal)) });
}

function patchLike(key: QueryKey, data: unknown, id: string, value: ReviewLikeResponse): unknown {
    const patch = (item: FeedItem) => item.id === id ? { ...item, ...value } : item;
    if (key[1] === 'feed') return (data as FeedListResponse | undefined)?.map(patch);
    if (key[1] === 'books') return (data as BookReviewSearchResponse | undefined)?.map(group => ({ ...group, reviews: group.reviews.map(patch) }));
    if (key[1] === 'item' && data) return patch(data as FeedItem);
    return data;
}

export function useReviewLike(id: string) {
    const client = useQueryClient();
    const lock = useRef(false);
    const mutationKey = ['lounge', 'like', id];
    const pending = useIsMutating({ mutationKey }) > 0;
    const update = (targetId: string, value: ReviewLikeResponse) => {
        for (const query of client.getQueryCache().findAll({ queryKey: loungeKeys.all })) {
            client.setQueryData(query.queryKey, (data: unknown) => patchLike(query.queryKey, data, targetId, value));
        }
    };
    const ensureCurrent = (isCurrent: () => boolean) => {
        if (!isCurrent()) throw new ApiError('cancelled', 'CANCELLED', '요청을 취소했어요.');
    };
    const mutation = useMutation({
        mutationKey, networkMode: 'always', retry: false,
        mutationFn: ({ liked, previous, isCurrent }: { liked: boolean; previous: FeedItem; isCurrent: () => boolean }) => connected(() => {
            ensureCurrent(isCurrent);
            return liked ? likeReview(previous.id) : unlikeReview(previous.id);
        }),
        onMutate: async ({ liked, previous, isCurrent }) => {
            if (!await isOnline()) throw offlineError();
            await client.cancelQueries({ queryKey: loungeKeys.all });
            ensureCurrent(isCurrent);
            update(previous.id, { likedByMe: liked, likeCount: previous.likeCount + (liked ? 1 : -1) });
            return previous;
        },
        onSuccess: (value, variables) => { if (variables.isCurrent()) update(variables.previous.id, value); },
        onError: (_error, variables, previous) => {
            if (previous && variables.isCurrent()) update(previous.id, { likeCount: previous.likeCount, likedByMe: previous.likedByMe });
        },
        onSettled: (_data, _error, variables) => {
            lock.current = false;
            // 좋아요 전에 취소된 최초 목록 조회는 데이터 없이 대기하지 않게 재개한다.
            if (variables.isCurrent()) void client.refetchQueries({ queryKey: loungeKeys.all, type: 'active',
                predicate: query => query.state.data === undefined });
        },
    });
    return { ...mutation, pending: pending || mutation.isPending,
        toggle: (item: FeedItem) => {
            if (lock.current || client.isMutating({ mutationKey }) > 0) return;
            lock.current = true;
            // 로그아웃/계정 전환으로 캐시가 교체되면 이전 요청의 결과를 반영하지 않는다.
            const entry = client.getQueryCache().find({ queryKey: loungeKeys.item(item.id), exact: true });
            mutation.mutate({ liked: !item.likedByMe, previous: item,
                isCurrent: () => entry !== undefined && client.getQueryCache().find({ queryKey: loungeKeys.item(item.id), exact: true }) === entry });
        },
    };
}
