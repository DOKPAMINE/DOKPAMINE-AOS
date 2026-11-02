import { useRef } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { feedItem, feedList, likeReview, searchBookReviews, unlikeReview } from '../api/endpoints';
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
