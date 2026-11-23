import { router, Slot, Tabs } from 'expo-router';
import { RefreshControl, Text, type RefreshControlProps } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import Lounge from '../../../app/(tabs)/lounge';
import Search from '../../../app/lounge/search';
import Detail from '../../../app/lounge/[id]';
import { feedItem, feedList, likeReview, searchBookReviews, unlikeReview } from '../../api/endpoints';
import { ApiError } from '../../api/errors';
import type { BookReviewSearchResponse, FeedItem, ReviewLikeResponse } from '../../api/types';
import { connectLoungeSyncRefresh, loungeKeys, useFeed } from '../queries';

jest.mock('../../api/endpoints', () => ({ feedItem: jest.fn(), feedList: jest.fn(), likeReview: jest.fn(), searchBookReviews: jest.fn(), unlikeReview: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));

const item: FeedItem = {
    id: 'review-1', nickname: '독자', bookTitle: '데미안', bookAuthor: '헤르만 헤세', genre: '소설',
    oneLine: '나를 돌아보는 책', body: '각자의 길을 찾는 이야기가 오래 남았어요.',
    likeCount: 2, likedByMe: false, mine: false,
};
const groups: BookReviewSearchResponse = [
    { bookKey: 'isbn:9788937460449', bookTitle: item.bookTitle, bookAuthor: item.bookAuthor, isbn: '9788937460449', reviews: [item] },
    { bookKey: 'text:other', bookTitle: item.bookTitle, bookAuthor: '다른 저자', reviews: [{ ...item, id: 'review-2', nickname: '산책' }] },
];
let client: QueryClient;
const routes = {
    _layout: () => <QueryClientProvider client={client}><Slot /></QueryClientProvider>,
    '(tabs)/lounge': Lounge,
    'lounge/search': Search,
    'lounge/[id]': Detail,
};
const offlineMessage = '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.';
beforeEach(() => {
    jest.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    onlineManager.setOnline(true);
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as NetInfoState);
    jest.mocked(feedList).mockResolvedValue([item]);
    jest.mocked(searchBookReviews).mockResolvedValue(groups);
    jest.mocked(feedItem).mockResolvedValue(item);
    jest.mocked(likeReview).mockResolvedValue({ likeCount: 3, likedByMe: true });
    jest.mocked(unlikeReview).mockResolvedValue({ likeCount: 2, likedByMe: false });
});
afterEach(() => { client.clear(); onlineManager.setOnline(true); });

test('FR-16 FR-08 FR-09 S-70~72 검색→책 묶음→상세→좋아요·취소가 이어져요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge' });
    expect(await screen.findByText('최근 공개 감상')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '독서왕 랭킹' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '책 감상 검색' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('책 이름'), ' 데미안 ');
    await fireEvent.press(screen.getByRole('button', { name: '책 감상 검색' }));
    expect(await screen.findByText('헤르만 헤세 · ISBN 9788937460449')).toBeOnTheScreen();
    expect(screen.getByText('다른 저자')).toBeOnTheScreen();
    expect(searchBookReviews).toHaveBeenCalledWith('데미안');
    await fireEvent.press(screen.getByRole('button', { name: '데미안 · 독자님의 감상 보기' }));
    expect(await screen.findByText(item.body!)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '좋아요' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '좋아요 취소' })).not.toBeDisabled());
    expect(screen.getByText('좋아요 누름 · 3개')).toBeOnTheScreen();
    expect(client.getQueryData(loungeKeys.feed)).toEqual([expect.objectContaining({ likedByMe: true, likeCount: 3 })]);
    expect(client.getQueryData<BookReviewSearchResponse>(loungeKeys.books('데미안'))?.[0].reviews[0].likedByMe).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: '좋아요 취소' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '좋아요' })).not.toBeDisabled());
    expect(screen.getByText('좋아요 · 2개')).toBeOnTheScreen();
    expect(likeReview).toHaveBeenCalledTimes(1);
    expect(unlikeReview).toHaveBeenCalledTimes(1);
});

test('FR-09 S-72 낙관적 좋아요는 연속 탭에도 한 번 요청하고 실패하면 캐시를 되돌려요', async () => {
    let reject!: (error: Error) => void;
    jest.mocked(likeReview).mockImplementation(() => new Promise<ReviewLikeResponse>((_resolve, fail) => { reject = fail; }));
    client.setQueryData(loungeKeys.feed, [item]);
    client.setQueryData(loungeKeys.books('데미안'), groups);
    await renderRouter(routes, { initialUrl: '/lounge/review-1' });
    const button = await screen.findByRole('button', { name: '좋아요' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(likeReview).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('좋아요 누름 · 3개 · 반영 중')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '좋아요 취소' })).toBeDisabled();
    await act(async () => reject(new ApiError('http', 'FAIL', '좋아요를 반영하지 못했어요.', 500)));
    await waitFor(() => expect(screen.getByRole('button', { name: '좋아요' })).not.toBeDisabled());
    expect(client.getQueryData(loungeKeys.feed)).toEqual([item]);
    expect(client.getQueryData(loungeKeys.books('데미안'))).toEqual(groups);
    expect(screen.getByText('좋아요 · 2개')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
});

test.each(['/lounge', '/lounge/search?query=데미안', '/lounge/review-1'])(
    'NFR-06 S-70~72 %s 오프라인이면 대기하지 않고 요청 없이 안내해요', async initialUrl => {
        onlineManager.setOnline(false);
        jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as NetInfoState);
        await renderRouter(routes, { initialUrl });
        expect(await screen.findByText(offlineMessage)).toBeOnTheScreen();
        expect(feedList).not.toHaveBeenCalled();
        expect(searchBookReviews).not.toHaveBeenCalled();
        expect(feedItem).not.toHaveBeenCalled();
    },
);

test('NFR-06 S-71 연결 조회가 멈춰도 1초 이내 안내하고 재시도할 수 있어요', async () => {
    jest.mocked(NetInfo.fetch).mockImplementation(() => new Promise(() => {}));
    await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
    expect(await screen.findByText(offlineMessage, {}, { timeout: 900 })).toBeOnTheScreen();
    expect(searchBookReviews).not.toHaveBeenCalled();
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true } as NetInfoState);
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByText('다른 저자')).toBeOnTheScreen();
});

test('NFR-06 FR-09 S-72 상세를 읽던 중 오프라인이면 좋아요 요청 없이 안내해요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge/review-1' });
    const button = await screen.findByRole('button', { name: '좋아요' });
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as NetInfoState);
    await fireEvent.press(button);
    expect(await screen.findByText(offlineMessage)).toBeOnTheScreen();
    expect(likeReview).not.toHaveBeenCalled();
    expect(screen.getByText('좋아요 · 2개')).toBeOnTheScreen();
});

test.each(['detail', 'like'])('#91 FR-08 S-72 %s 응답이 404면 감상과 좋아요를 숨기고 삭제됐거나 비공개로 바뀐 감상이라고 알려요', async mode => {
    const missing = new ApiError('http', 'NOT_FOUND', '감상이 없어요.', 404);
    if (mode === 'detail') jest.mocked(feedItem).mockRejectedValue(missing);
    else jest.mocked(likeReview).mockRejectedValue(missing);
    await renderRouter(routes, { initialUrl: '/lounge/review-1' });
    if (mode === 'like') await fireEvent.press(await screen.findByRole('button', { name: '좋아요' }));
    expect(await screen.findByText('삭제됐거나 비공개로 바뀐 감상이에요.')).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(item.body!)).toBeNull();
    expect(screen.queryByRole('button', { name: '좋아요' })).toBeNull();
});

test('FR-16 S-71 결과가 없으면 빈 상태를 안내해요', async () => {
    jest.mocked(searchBookReviews).mockResolvedValue([]);
    await renderRouter(routes, { initialUrl: '/lounge/search?query=없는책' });
    expect(await screen.findByText('아직 공개된 감상이 없어요')).toBeOnTheScreen();
});

test('FR-16 S-71 공백 검색은 요청하지 않고 책 이름 입력을 안내해요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge/search' });
    expect(screen.getByText('책 이름을 입력해 주세요.')).toBeOnTheScreen();
    expect(searchBookReviews).not.toHaveBeenCalled();
});

test('FR-09 S-72 좋아요 취소가 실패하면 선택 상태와 개수를 되돌린 뒤 재시도해요', async () => {
    const liked = { ...item, likedByMe: true, likeCount: 3 };
    jest.mocked(feedItem).mockResolvedValue(liked);
    jest.mocked(unlikeReview).mockRejectedValueOnce(new ApiError('http', 'FAIL', '좋아요를 반영하지 못했어요.', 500));
    await renderRouter(routes, { initialUrl: '/lounge/review-1' });
    await fireEvent.press(await screen.findByRole('button', { name: '좋아요 취소' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('좋아요를 반영하지 못했어요.');
    expect(screen.getByText('좋아요 누름 · 3개')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '좋아요 취소' })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: '좋아요 취소' }));
    expect(await screen.findByText('좋아요 · 2개')).toBeOnTheScreen();
    expect(unlikeReview).toHaveBeenCalledTimes(2);
});

test('FR-09 S-72 계정 전환으로 캐시를 비운 뒤 도착한 좋아요는 새 캐시를 바꾸지 않아요', async () => {
    let resolve!: (value: ReviewLikeResponse) => void;
    jest.mocked(likeReview).mockImplementation(() => new Promise<ReviewLikeResponse>(done => { resolve = done; }));
    await renderRouter(routes, { initialUrl: '/lounge/review-1' });
    await fireEvent.press(await screen.findByRole('button', { name: '좋아요' }));
    await waitFor(() => expect(likeReview).toHaveBeenCalledTimes(1));
    await act(async () => {
        client.clear();
        client.setQueryData(loungeKeys.feed, [item]);
        client.setQueryData(loungeKeys.item(item.id), item);
        resolve({ likeCount: 3, likedByMe: true });
    });
    expect(client.getQueryData(loungeKeys.feed)).toEqual([item]);
    expect(client.getQueryData(loungeKeys.item(item.id))).toEqual(item);
});

test('FR-08 S-70 조회 오류는 재시도하면 최근 감상을 표시해요', async () => {
    jest.mocked(feedList).mockRejectedValueOnce(new ApiError('network', 'NETWORK_ERROR', '서버에 연결하지 못했어요.'));
    await renderRouter(routes, { initialUrl: '/lounge' });
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결하지 못했어요.');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByRole('button', { name: '데미안 · 독자님의 감상 보기' })).toBeOnTheScreen();
});

test('FR-08 FR-09 S-70 S-72 좋아요 전에 취소한 최초 목록 조회는 다시 시작해요', async () => {
    jest.mocked(feedList).mockImplementationOnce(() => new Promise(() => {}))
        .mockResolvedValueOnce([{ ...item, likeCount: 3, likedByMe: true }]);
    function RecentFeedState() {
        const feed = useFeed();
        return <Text>{feed.data ? '최근 목록 조회 완료' : '최근 목록 조회 중'}</Text>;
    }
    await renderRouter({ ...routes,
        _layout: () => <QueryClientProvider client={client}><RecentFeedState /><Slot /></QueryClientProvider>,
    }, { initialUrl: '/lounge/review-1' });
    await fireEvent.press(await screen.findByRole('button', { name: '좋아요' }));
    expect(await screen.findByText('최근 목록 조회 완료')).toBeOnTheScreen();
    expect(feedList).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(loungeKeys.feed)).toEqual([expect.objectContaining({ likeCount: 3, likedByMe: true })]);
});

describe('#91 라운지 새로고침', () => {
    const removed = { ...item, id: 'review-removed', nickname: '지운 독자' };
    const removedRow = { name: '데미안 · 지운 독자님의 감상 보기' };
    const tabRoutes = {
        '(tabs)/_layout': () => <QueryClientProvider client={client}><Tabs>
            <Tabs.Screen name="lounge" /><Tabs.Screen name="shelf" />
        </Tabs></QueryClientProvider>,
        '(tabs)/lounge': Lounge,
        '(tabs)/shelf': () => <Text>책장</Text>,
        'lounge/[id]': Detail,
    };

    test('S-70 라운지 탭으로 돌아올 때마다 최근 공개 감상을 다시 받아 지운 감상이 사라져요', async () => {
        jest.mocked(feedList).mockResolvedValueOnce([item, removed]).mockResolvedValue([item]);
        await renderRouter(tabRoutes, { initialUrl: '/lounge' });
        expect(await screen.findByRole('button', removedRow)).toBeOnTheScreen();
        // 처음 열 때 탭 포커스와 목록 조회가 겹쳐도 한 번만 요청한다.
        expect(feedList).toHaveBeenCalledTimes(1);
        await act(async () => router.navigate('/shelf'));
        await act(async () => router.navigate('/lounge'));
        await waitFor(() => expect(screen.queryByRole('button', removedRow)).toBeNull());
        expect(feedList).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('button', { name: '데미안 · 독자님의 감상 보기' })).toBeOnTheScreen();
    });

    test('S-70 목록을 아래로 당기면 서버에서 다시 받아요', async () => {
        jest.mocked(feedList).mockResolvedValueOnce([item, removed]).mockResolvedValue([item]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        expect(await screen.findByRole('button', removedRow)).toBeOnTheScreen();
        // jest의 RefreshControl 대체 구현은 속성을 화면 트리에 넘기지 않아, 마지막으로 그린 컨트롤의 속성으로 당김을 흉내 낸다.
        const pull = () => (RefreshControl as unknown as { latestRef: { props: RefreshControlProps } }).latestRef.props;
        expect(pull()).toMatchObject({ refreshing: false, accessibilityLabel: '라운지 새로고침' });
        await act(async () => pull().onRefresh?.());
        await waitFor(() => expect(screen.queryByRole('button', removedRow)).toBeNull());
        expect(feedList).toHaveBeenCalledTimes(2);
        expect(pull().refreshing).toBe(false);
    });

    test('S-70 S-72 내 감상을 보낸 동기화가 끝나면 라운지 목록을 다시 받고, 구독을 끊으면 받지 않아요', async () => {
        let synced!: () => void;
        const unsubscribe = jest.fn();
        const disconnect = connectLoungeSyncRefresh(client, listener => { synced = listener; return unsubscribe; });
        jest.mocked(feedList).mockResolvedValueOnce([item, removed]).mockResolvedValue([item]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        expect(await screen.findByRole('button', removedRow)).toBeOnTheScreen();
        await act(async () => synced());
        await waitFor(() => expect(screen.queryByRole('button', removedRow)).toBeNull());
        expect(feedList).toHaveBeenCalledTimes(2);
        disconnect();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    test('S-72 상세가 404면 목록·검색 캐시를 무효로 해 지운 감상이 남지 않게 해요', async () => {
        jest.mocked(feedItem).mockRejectedValue(new ApiError('http', 'NOT_FOUND', '감상이 없어요.', 404));
        client.setQueryData(loungeKeys.feed, [item, removed]);
        client.setQueryData(loungeKeys.books('데미안'), groups);
        await renderRouter(routes, { initialUrl: '/lounge/review-removed' });
        expect(await screen.findByText('삭제됐거나 비공개로 바뀐 감상이에요.')).toBeOnTheScreen();
        await waitFor(() => expect(client.getQueryState(loungeKeys.feed)?.isInvalidated).toBe(true));
        expect(client.getQueryState(loungeKeys.books('데미안'))?.isInvalidated).toBe(true);
    });
});
