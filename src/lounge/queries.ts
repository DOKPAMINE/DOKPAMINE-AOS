import { useRef } from 'react';
import { keepPreviousData, useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { feedItem, feedList, feedUserBook, likeReview, searchBookReviews, unlikeReview } from '../api/endpoints';
import { subscribeReviewsSynced } from '../sync/runtime';
import { isOnline } from '../api/connectivity';
import { ApiError, offlineError } from '../api/errors';
import type { BookReviewSearchResponse, FeedItem, FeedListResponse, ReviewLikeResponse } from '../api/types';

export const loungeKeys = {
    all: ['lounge'] as const,
    feed: ['lounge', 'feed'] as const,
    books: (query: string) => ['lounge', 'books', query] as const,
    bookSuggestions: (term: string) => ['lounge', 'book-suggestions', term] as const,
    item: (id: string) => ['lounge', 'item', id] as const,
    userBook: (userBookId: string) => ['lounge', 'user-book', userBookId] as const,
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

/**
 * #91 S-72 · #113 S-76: 상세·감상 모음이 404면 지워졌거나 비공개로 바뀐 감상이다. 목록·검색·감상 모음에 남은 그 감상을 지우도록 다시 받게 한다.
 * keep은 404를 받은 그 조회로, 같은 404를 다시 요청하지 않게 뺀다.
 */
export function invalidateLoungeLists(client: QueryClient, keep?: QueryKey) {
    const kept = keep === undefined ? undefined : JSON.stringify(keep);
    return client.invalidateQueries({ queryKey: loungeKeys.all,
        predicate: query => query.queryKey[1] !== 'item' && JSON.stringify(query.queryKey) !== kept });
}

export function useBookReviews(query: string) {
    return useQuery({ ...options, queryKey: loungeKeys.books(query), enabled: query.trim().length > 0,
        queryFn: ({ signal }) => connected(() => searchBookReviews(query, signal)) });
}

/** #124 S-70·S-71: 글자를 멈추고 이만큼 기다린 뒤 자동완성을 조회한다. */
export const bookSuggestionDelayMs = 300;

/** #124: 자동완성 결과. 목록을 만든 검색어를 함께 두어, 고른 책을 그 검색어의 S-71 결과에서 찾게 한다. */
export interface BookSuggestionResult { term: string; groups: BookReviewSearchResponse }

/**
 * #124 S-70·S-71 책 이름 자동완성. term은 앞뒤 공백을 자른, 0.3초 동안 바뀌지 않은 검색어다(빈 값이면 조회하지 않는다).
 * S-71의 책별 감상 조회와 키를 나눠, 자동완성 요청을 취소해도 S-71 조회에는 영향이 없다.
 * 검색어가 바뀌면 이전 검색어의 조회에 남은 화면이 없으므로 Query가 signal로 진행 중인 요청을 취소하고, 마지막 검색어의 결과만 쓴다.
 * 오프라인이면 connected()가 요청 없이 오류를 내므로 화면은 목록을 띄우지 않는다.
 */
export function useBookSuggestions(term: string) {
    // 다음 검색어의 결과를 기다리는 동안 직전 결과를 둔다. 결과마다 term이 있어 고른 책은 그 결과의 검색어로 찾는다.
    return useQuery({ ...options, queryKey: loungeKeys.bookSuggestions(term), enabled: term.length > 0, placeholderData: keepPreviousData,
        queryFn: async ({ signal }): Promise<BookSuggestionResult> =>
            ({ term, groups: await connected(() => searchBookReviews(term, signal)) }) });
}

/** #124: 자동완성에서 책을 고르면 S-71이 같은 검색어 결과를 바로 보여 주도록, 비어 있는 책별 감상 캐시만 채운다. S-71은 열면서 다시 받는다. */
export function primeBookReviews(client: QueryClient, result: BookSuggestionResult) {
    if (client.getQueryData(loungeKeys.books(result.term)) === undefined) client.setQueryData(loungeKeys.books(result.term), result.groups);
}
/** #113 S-76: 박스(한 사람이 한 책에 쓴 공개 감상) 전부. 서버 순서는 publishedAt 최신순이다. */
export function useUserBookFeed(userBookId: string) {
    return useQuery({ ...options, queryKey: loungeKeys.userBook(userBookId), enabled: userBookId.length > 0,
        queryFn: ({ signal }) => connected(() => feedUserBook(userBookId, signal)) });
}
/** #113 S-76: S-72에서 돌아오는 등 화면에 다시 들어올 때 서버에서 다시 받는다. 진행 중인 조회는 기다린다. */
export function refetchUserBookFeed(client: QueryClient, userBookId: string) {
    return client.refetchQueries({ queryKey: loungeKeys.userBook(userBookId), exact: true }, { cancelRefetch: false });
}
export function useFeedItem(id: string) {
    return useQuery({ ...options, queryKey: loungeKeys.item(id), enabled: id.length > 0,
        queryFn: ({ signal }) => connected(() => feedItem(id, signal)) });
}

function patchLike(key: QueryKey, data: unknown, id: string, value: ReviewLikeResponse): unknown {
    const patch = (item: FeedItem) => item.id === id ? { ...item, ...value } : item;
    if (key[1] === 'feed' || key[1] === 'user-book') return (data as FeedListResponse | undefined)?.map(patch);
    if (key[1] === 'books') return (data as BookReviewSearchResponse | undefined)?.map(group => ({ ...group, reviews: group.reviews.map(patch) }));
    if (key[1] === 'item' && data) return patch(data as FeedItem);
    return data;
}

/**
 * owner는 좋아요를 누른 화면의 조회다(기본은 S-72 상세). 로그아웃·계정 전환으로 그 조회가 캐시에서 바뀌면
 * 늦게 도착한 결과를 반영하지 않는다. #113 S-76은 감상 모음 조회를 owner로 준다.
 */
export function useReviewLike(id: string, owner?: QueryKey) {
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
            const ownerKey = owner ?? loungeKeys.item(item.id);
            const entry = client.getQueryCache().find({ queryKey: ownerKey, exact: true });
            mutation.mutate({ liked: !item.likedByMe, previous: item,
                isCurrent: () => entry !== undefined && client.getQueryCache().find({ queryKey: ownerKey, exact: true }) === entry });
        },
    };
}
