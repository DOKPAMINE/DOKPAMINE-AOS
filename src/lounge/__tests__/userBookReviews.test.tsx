import { router, Slot, Stack } from 'expo-router';
import { RefreshControl, type RefreshControlProps } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import Lounge from '../../../app/(tabs)/lounge';
import Search from '../../../app/lounge/search';
import Detail from '../../../app/lounge/[id]';
import UserBook from '../../../app/lounge/user-books/[userBookId]';
import { feedItem, feedList, feedUserBook, likeReview, searchBookReviews, unlikeReview } from '../../api/endpoints';
import { ApiError } from '../../api/errors';
import type { FeedItem } from '../../api/types';
import { connectLoungeSyncRefresh, loungeKeys } from '../queries';

jest.mock('../../api/endpoints', () => ({
    feedItem: jest.fn(), feedList: jest.fn(), feedUserBook: jest.fn(), likeReview: jest.fn(), searchBookReviews: jest.fn(), unlikeReview: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));

const base = { nickname: '독자', bookTitle: '데미안', bookAuthor: '헤르만 헤세', genre: '소설', likeCount: 2, likedByMe: false, mine: false };
const reportNew: FeedItem = { ...base, id: 'review-new', userBookId: 'user-book-1', oneLine: null,
    body: '두 번째로 읽으니 싱클레어가 다르게 보였어요.', bodyWrittenAt: '2026-11-24T15:30:00Z' };
const oneLine: FeedItem = { ...base, id: 'review-one-line', userBookId: 'user-book-1', oneLine: '나를 돌아보는 책', body: null, bodyWrittenAt: null };
const legacy: FeedItem = { ...base, id: 'review-legacy', userBookId: 'user-book-1', oneLine: '예전 한줄평',
    body: '처음 읽었을 때의 독후감이에요.', bodyWrittenAt: '2026-10-01T00:00:00Z' };
const otherBox: FeedItem = { ...base, id: 'review-other', userBookId: 'user-book-2', nickname: '산책', bookTitle: '어린 왕자',
    bookAuthor: '생텍쥐페리', oneLine: '어른이 되어 다시 읽은 책', body: '여우의 말이 오래 남았어요.', bodyWrittenAt: '2026-11-20T01:00:00Z', likeCount: 9 };

const boxName = '독자 · 『데미안』, 2026년 11월 25일에 쓴 독후감, 감상 모음 보기';
const removedMessage = '삭제됐거나 비공개로 바뀐 감상이에요.';
const offlineMessage = '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.';
const notFound = () => new ApiError('http', 'NOT_FOUND', '감상이 없어요.', 404);
const pull = () => (RefreshControl as unknown as { latestRef: { props: RefreshControlProps } }).latestRef.props;
const labelOf = (node: { props: { accessibilityLabel?: string; children?: unknown } }) => node.props.accessibilityLabel ?? node.props.children;

let client: QueryClient;
const screens = {
    '(tabs)/lounge': Lounge,
    'lounge/search': Search,
    'lounge/[id]': Detail,
    'lounge/user-books/[userBookId]': UserBook,
};
const routes = { _layout: () => <QueryClientProvider client={client}><Slot /></QueryClientProvider>, ...screens };
// 상세로 갔다 돌아와도 S-76이 남아 있는 스택. 화면 복귀 때 다시 받는지 확인한다.
const stackRoutes = { _layout: () => <QueryClientProvider client={client}><Stack /></QueryClientProvider>, ...screens };

beforeEach(() => {
    jest.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    onlineManager.setOnline(true);
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as NetInfoState);
    jest.mocked(feedList).mockResolvedValue([reportNew, otherBox]);
    jest.mocked(feedUserBook).mockResolvedValue([reportNew, oneLine, legacy]);
    jest.mocked(feedItem).mockImplementation(async id => [reportNew, oneLine, legacy, otherBox].find(item => item.id === id)!);
    jest.mocked(likeReview).mockResolvedValue({ likeCount: 3, likedByMe: true });
    jest.mocked(unlikeReview).mockResolvedValue({ likeCount: 2, likedByMe: false });
});
afterEach(() => { client.clear(); onlineManager.setOnline(true); });

test('#113 FR-08 S-70 최근 공개 감상은 서버 순서대로 사람의 책 박스로 보이고 닉네임·책 제목·독후감 앞부분·쓴 날짜를 보여 줘요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge' });
    const boxes = await screen.findAllByRole('button', { name: /감상 모음 보기$/ });
    expect(boxes.map(labelOf)).toEqual([boxName, '산책 · 『어린 왕자』, 2026년 11월 20일에 쓴 독후감, 감상 모음 보기']);
    expect(screen.getByText('독자 · 『데미안』')).toBeOnTheScreen();
    expect(screen.getByText(reportNew.body!)).toBeOnTheScreen();
    // 2026-11-24T15:30Z는 KST로 11월 25일이다.
    expect(screen.getByText('2026. 11. 25.')).toBeOnTheScreen();
    // 대표 감상에 한줄평이 있어도 박스에는 독후감을 보여 주고, 박스 전체로 오해할 좋아요 수는 보여 주지 않는다.
    expect(screen.getByText(otherBox.body!)).toBeOnTheScreen();
    expect(screen.queryByText(otherBox.oneLine!)).toBeNull();
    expect(screen.queryByText(/좋아요/)).toBeNull();
});

test('#113 FR-08 S-70 S-76 S-72 박스를 누르면 그 책의 공개 감상을 한줄평·독후감으로 나눠 보여 주고 독후감을 누르면 상세로 가요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge' });
    await fireEvent.press(await screen.findByRole('button', { name: boxName }));
    expect(await screen.findByText(oneLine.oneLine!)).toBeOnTheScreen();
    expect(feedUserBook).toHaveBeenCalledWith('user-book-1', expect.anything());
    expect(screen.getAllByRole('header').map(labelOf)).toEqual(['감상 모음', '독자 · 『데미안』', '한줄평', '독후감']);
    expect(screen.getByText('헤르만 헤세 · 소설')).toBeOnTheScreen();
    // 독후감 섹션은 서버 순서를 지키고, 한줄평이 함께 든 예전 감상은 독후감에 한 번만 나오며 한줄평도 함께 보인다.
    expect(screen.getAllByRole('button', { name: /^독후감 \d.* 보기$/ }).map(labelOf))
        .toEqual(['독후감 2, 2026년 11월 25일 보기', '독후감 1, 2026년 10월 1일 보기']);
    expect(screen.getByText('한줄평 · 예전 한줄평')).toBeOnTheScreen();
    expect(screen.queryByText('예전 한줄평')).toBeNull();
    expect(screen.getAllByRole('button', { name: /좋아요$/ })).toHaveLength(3);
    // 한줄평은 상세로 가는 버튼이 아니다.
    expect(screen.queryByRole('button', { name: /한줄평 보기/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '독후감 1, 2026년 10월 1일 보기' }));
    expect(await screen.findByText('감상 상세')).toBeOnTheScreen();
    expect(feedItem).toHaveBeenCalledWith('review-legacy', expect.anything());
    expect(await screen.findByText(legacy.body!)).toBeOnTheScreen();
});

test('#113 FR-09 S-76 좋아요는 감상마다 누르고 취소하며 그 감상에만 반영돼요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 좋아요' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '한줄평 좋아요 취소' })).not.toBeDisabled());
    expect(likeReview).toHaveBeenCalledWith('review-one-line');
    expect(screen.getByRole('button', { name: '한줄평 좋아요 취소' })).toBeSelected();
    expect(screen.getAllByText('좋아요 누름 · 3개')).toHaveLength(1);
    expect(screen.getAllByText('좋아요 · 2개')).toHaveLength(2);
    expect(client.getQueryData<FeedItem[]>(loungeKeys.userBook('user-book-1'))?.map(item => item.likeCount)).toEqual([2, 3, 2]);
    await fireEvent.press(screen.getByRole('button', { name: '독후감 2, 2026년 11월 25일 좋아요' }));
    await waitFor(() => expect(screen.getAllByText('좋아요 누름 · 3개')).toHaveLength(2));
    expect(likeReview).toHaveBeenLastCalledWith('review-new');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 좋아요 취소' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '한줄평 좋아요' })).not.toBeDisabled());
    expect(unlikeReview).toHaveBeenCalledWith('review-one-line');
    expect(screen.getAllByText('좋아요 누름 · 3개')).toHaveLength(1);
});

test('#113 FR-08 S-70 userBookId를 주지 않는 구버전 서버의 박스는 대표 감상 상세를 열어요', async () => {
    jest.mocked(feedList).mockResolvedValue([{ ...reportNew, userBookId: undefined, bodyWrittenAt: undefined }]);
    await renderRouter(routes, { initialUrl: '/lounge' });
    await fireEvent.press(await screen.findByRole('button', { name: '독자 · 『데미안』, 감상 모음 보기' }));
    expect(await screen.findByText('감상 상세')).toBeOnTheScreen();
    expect(feedItem).toHaveBeenCalledWith('review-new', expect.anything());
    expect(feedUserBook).not.toHaveBeenCalled();
});

test('#113 #92 S-76 404면 삭제됐거나 비공개로 바뀐 감상이라고 알리고 라운지 목록을 다시 받아요', async () => {
    jest.mocked(feedUserBook).mockRejectedValue(notFound());
    client.setQueryData(loungeKeys.feed, [reportNew, otherBox]);
    await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
    expect(await screen.findByText(removedMessage)).toBeOnTheScreen();
    await waitFor(() => expect(client.getQueryState(loungeKeys.feed)?.isInvalidated).toBe(true));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /좋아요/ })).toBeNull();
    // 404를 받은 감상 모음은 같은 요청을 되풀이하지 않는다.
    expect(feedUserBook).toHaveBeenCalledTimes(1);
});

test('#113 #92 S-76 S-70 박스를 열었는데 404면 돌아간 라운지에서 그 박스가 사라져요', async () => {
    jest.mocked(feedUserBook).mockRejectedValue(notFound());
    jest.mocked(feedList).mockResolvedValueOnce([reportNew, otherBox]).mockResolvedValue([otherBox]);
    await renderRouter(stackRoutes, { initialUrl: '/lounge' });
    await fireEvent.press(await screen.findByRole('button', { name: boxName }));
    expect(await screen.findByText(removedMessage)).toBeOnTheScreen();
    await waitFor(() => expect(feedList).toHaveBeenCalledTimes(2));
    await act(async () => router.back());
    await waitFor(() => expect(screen.queryByRole('button', { name: boxName })).toBeNull());
});

test('#113 FR-09 S-76 좋아요가 404면 그 감상을 알리고 감상 모음을 다시 받아 남은 감상만 보여 줘요', async () => {
    jest.mocked(likeReview).mockRejectedValue(notFound());
    jest.mocked(feedUserBook).mockResolvedValueOnce([reportNew, oneLine, legacy]).mockResolvedValue([reportNew, legacy]);
    await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 좋아요' }));
    await waitFor(() => expect(feedUserBook).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(oneLine.oneLine!)).toBeNull());
    expect(screen.queryByText('한줄평')).toBeNull();
    expect(screen.getByText(reportNew.body!)).toBeOnTheScreen();
});

describe('#113 #92 S-76 새로고침', () => {
    test('상세에서 돌아오면 다시 받고, 처음 열 때는 한 번만 받아요', async () => {
        jest.mocked(feedUserBook).mockResolvedValueOnce([reportNew, oneLine, legacy]).mockResolvedValue([reportNew, legacy]);
        await renderRouter(stackRoutes, { initialUrl: '/lounge/user-books/user-book-1' });
        expect(await screen.findByText(oneLine.oneLine!)).toBeOnTheScreen();
        expect(feedUserBook).toHaveBeenCalledTimes(1);
        await fireEvent.press(screen.getByRole('button', { name: '독후감 2, 2026년 11월 25일 보기' }));
        expect(await screen.findByText('감상 상세')).toBeOnTheScreen();
        await act(async () => router.back());
        await waitFor(() => expect(feedUserBook).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByText(oneLine.oneLine!)).toBeNull());
    });

    test('아래로 당기면 서버에서 다시 받아요', async () => {
        jest.mocked(feedUserBook).mockResolvedValueOnce([reportNew, oneLine, legacy]).mockResolvedValue([reportNew, legacy]);
        await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
        expect(await screen.findByText(oneLine.oneLine!)).toBeOnTheScreen();
        expect(pull()).toMatchObject({ refreshing: false, accessibilityLabel: '감상 모음 새로고침' });
        await act(async () => pull().onRefresh?.());
        await waitFor(() => expect(screen.queryByText(oneLine.oneLine!)).toBeNull());
        expect(feedUserBook).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(pull().refreshing).toBe(false));
    });

    test('다시 받는 중에 당겨도 진행 중인 요청을 취소하지 않고 그 결과를 기다려요', async () => {
        let resolve!: (value: FeedItem[]) => void;
        jest.mocked(feedUserBook).mockResolvedValueOnce([reportNew, oneLine, legacy])
            .mockImplementationOnce(() => new Promise<FeedItem[]>(done => { resolve = done; }));
        await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
        expect(await screen.findByText(oneLine.oneLine!)).toBeOnTheScreen();
        await act(async () => { void client.refetchQueries({ queryKey: loungeKeys.userBook('user-book-1') }); });
        await waitFor(() => expect(feedUserBook).toHaveBeenCalledTimes(2));
        await act(async () => { pull().onRefresh?.(); });
        expect(pull().refreshing).toBe(true);
        await act(async () => resolve([reportNew]));
        await waitFor(() => expect(pull().refreshing).toBe(false));
        expect(feedUserBook).toHaveBeenCalledTimes(2);
        expect(screen.queryByText(oneLine.oneLine!)).toBeNull();
    });

    test('내 감상을 보낸 동기화가 끝나면 다시 받아요', async () => {
        let synced!: () => void;
        const disconnect = connectLoungeSyncRefresh(client, listener => { synced = listener; return () => {}; });
        jest.mocked(feedUserBook).mockResolvedValueOnce([reportNew, oneLine, legacy]).mockResolvedValue([reportNew, legacy]);
        await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
        expect(await screen.findByText(oneLine.oneLine!)).toBeOnTheScreen();
        await act(async () => synced());
        await waitFor(() => expect(screen.queryByText(oneLine.oneLine!)).toBeNull());
        expect(feedUserBook).toHaveBeenCalledTimes(2);
        disconnect();
    });
});

test('#113 NFR-06 S-76 오프라인이면 요청하지 않고 1초 안에 안내해요', async () => {
    onlineManager.setOnline(false);
    jest.mocked(NetInfo.fetch).mockImplementation(() => new Promise(() => {}));
    await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
    expect(await screen.findByText(offlineMessage, {}, { timeout: 900 })).toBeOnTheScreen();
    expect(feedUserBook).not.toHaveBeenCalled();
});


test('#113 S-76 독후감 카드에 쓴 순서 번호와 날짜를 붙이고 카드 순서는 서버 순서 그대로예요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
    expect(await screen.findByText('독후감 2 · 2026. 11. 25.')).toBeOnTheScreen();
    expect(screen.getByText('독후감 1 · 2026. 10. 1.')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^독후감 \d.* 보기$/ }).map(labelOf))
        .toEqual(['독후감 2, 2026년 11월 25일 보기', '독후감 1, 2026년 10월 1일 보기']);
    expect(screen.getByRole('button', { name: '독후감 1, 2026년 10월 1일 좋아요' })).toBeOnTheScreen();
});

describe('#113 FR-16 S-71 책 감상 검색 박스', () => {
    const r1 = { ...reportNew, publishedAt: '2026-11-24T15:30:00Z' };
    const r2: FeedItem = { ...base, id: 'review-walk', userBookId: 'user-book-3', nickname: '산책', oneLine: '산책하며 읽은 책', body: null,
        bodyWrittenAt: null, publishedAt: '2026-11-20T00:00:00Z', likeCount: 9 };
    const r3 = { ...legacy, publishedAt: '2026-10-01T00:00:00Z' };
    const r4: FeedItem = { ...base, id: 'review-old', nickname: '옛 독자', oneLine: null, body: '예전 서버의 감상이에요.',
        publishedAt: '2026-09-01T00:00:00Z', likeCount: 0 };
    const r5 = { ...oneLine, publishedAt: null };
    const boxNames = /(감상 모음 보기|님의 감상 보기)$/;
    const walkBox = '산책 · 『데미안』, 감상 모음 보기';
    const otherBookBox = '다른 독자 · 『데미안』, 감상 모음 보기';
    const oldRow = '데미안 · 옛 독자님의 감상 보기';
    beforeEach(() => {
        jest.mocked(searchBookReviews).mockResolvedValue([
            { bookKey: 'isbn:9788937460449', bookTitle: '데미안', bookAuthor: '헤르만 헤세', isbn: '9788937460449', reviews: [r1, r2, r3, r4, r5] },
            { bookKey: 'text:other', bookTitle: '데미안', bookAuthor: '다른 저자',
                reviews: [{ ...r2, id: 'review-other-book', userBookId: 'user-book-9', nickname: '다른 독자', likeCount: 99 }] },
        ]);
    });

    test('책 묶음은 그대로 두고 묶음 안 감상을 사람의 책 박스로 묶어 대표 감상을 보여 줘요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        expect(await screen.findByText('헤르만 헤세 · ISBN 9788937460449')).toBeOnTheScreen();
        expect(screen.getByText('다른 저자')).toBeOnTheScreen();
        expect(screen.getAllByRole('button', { name: boxNames }).map(labelOf)).toEqual([boxName, walkBox, oldRow, otherBookBox]);
        // 독자의 대표는 가장 최근에 쓴 독후감이고, 산책은 독후감이 없어 한줄평이다.
        expect(screen.getByText(r1.body!)).toBeOnTheScreen();
        expect(screen.queryByText(r3.body!)).toBeNull();
        expect(screen.queryByText(r5.oneLine!)).toBeNull();
        expect(screen.getAllByText(r2.oneLine!)).toHaveLength(2);
        expect(screen.getByRole('radio', { name: '최신순' })).toBeSelected();
        expect(screen.getByRole('radio', { name: '좋아요 많은 순' })).not.toBeSelected();
    });

    test('[좋아요 많은 순]은 박스 안 좋아요 합계로 묶음 안에서만 정렬하고 [최신순]으로 되돌려요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        await screen.findByText('헤르만 헤세 · ISBN 9788937460449');
        await fireEvent.press(screen.getByRole('radio', { name: '좋아요 많은 순' }));
        expect(screen.getByRole('radio', { name: '좋아요 많은 순' })).toBeSelected();
        expect(screen.getByRole('radio', { name: '최신순' })).not.toBeSelected();
        // 산책 9개 > 독자 2+2+2=6개 > 옛 독자 0개. 좋아요가 더 많아도 다른 책 묶음은 그 묶음에 남는다.
        expect(screen.getAllByRole('button', { name: boxNames }).map(labelOf)).toEqual([walkBox, boxName, oldRow, otherBookBox]);
        await fireEvent.press(screen.getByRole('radio', { name: '최신순' }));
        expect(screen.getAllByRole('button', { name: boxNames }).map(labelOf)).toEqual([boxName, walkBox, oldRow, otherBookBox]);
    });

    test('박스는 S-76, userBookId가 없는 예전 감상은 S-72로 가요', async () => {
        await renderRouter(stackRoutes, { initialUrl: '/lounge/search?query=데미안' });
        await fireEvent.press(await screen.findByRole('button', { name: walkBox }));
        await waitFor(() => expect(feedUserBook).toHaveBeenCalledWith('user-book-3', expect.anything()));
        expect(await screen.findByRole('button', { name: '한줄평 좋아요' })).toBeOnTheScreen();
        await act(async () => router.back());
        await fireEvent.press(await screen.findByRole('button', { name: oldRow }));
        expect(await screen.findByText('감상 상세')).toBeOnTheScreen();
        expect(feedItem).toHaveBeenCalledWith('review-old', expect.anything());
    });
});

test('#113 FR-16 S-70 검색해서 결과 화면으로 넘어가면 라운지 검색창을 비워요', async () => {
    jest.mocked(searchBookReviews).mockResolvedValue([]);
    await renderRouter(stackRoutes, { initialUrl: '/lounge' });
    await fireEvent.changeText(await screen.findByLabelText('책 이름'), '데미안');
    await fireEvent(screen.getByLabelText('책 이름'), 'submitEditing');
    expect(await screen.findByText('“데미안” 검색 결과')).toBeOnTheScreen();
    expect(searchBookReviews).toHaveBeenCalledWith('데미안');
    await act(async () => router.back());
    expect(await screen.findByLabelText('책 이름')).toHaveProp('value', '');
    expect(screen.getByRole('button', { name: '책 감상 검색' })).toBeDisabled();
});

describe('#113 S-70 S-71 S-76 책 표지', () => {
    const coverUrl = 'https://image.example.com/demian.jpg';

    test('S-70 박스 위쪽에 책 표지를 보여 주고, 표지가 없으면 책장의 기본 표지를 보여 줘요', async () => {
        jest.mocked(feedList).mockResolvedValue([{ ...reportNew, coverUrl }, { ...otherBox, coverUrl: null }]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        const [withCover, withoutCover] = await screen.findAllByRole('button', { name: /감상 모음 보기$/ });
        expect(within(withCover).getByTestId('book-cover-image')).toHaveProp('source', { uri: coverUrl });
        expect(within(withCover).queryByTestId('book-cover-default')).toBeNull();
        expect(within(withoutCover).queryByTestId('book-cover-image')).toBeNull();
        expect(within(withoutCover).getByTestId('book-cover-default')).toHaveTextContent(otherBox.genre);
    });

    test('S-70 표지를 불러오지 못하면 기본 표지로 바꿔요', async () => {
        jest.mocked(feedList).mockResolvedValue([{ ...reportNew, coverUrl }]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        const box = await screen.findByRole('button', { name: boxName });
        await fireEvent(within(box).getByTestId('book-cover-image'), 'error');
        expect(within(box).queryByTestId('book-cover-image')).toBeNull();
        expect(within(box).getByTestId('book-cover-default')).toBeOnTheScreen();
    });

    test('S-71 검색 박스는 대표 감상의 책 표지를 보여 줘요', async () => {
        jest.mocked(searchBookReviews).mockResolvedValue([{ bookKey: 'isbn:9788937460449', bookTitle: '데미안', bookAuthor: '헤르만 헤세',
            isbn: '9788937460449', reviews: [{ ...reportNew, coverUrl }, { ...otherBox, userBookId: 'user-book-2' }] }]);
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        const [withCover, oldServer] = await screen.findAllByRole('button', { name: /감상 모음 보기$/ });
        expect(within(withCover).getByTestId('book-cover-image')).toHaveProp('source', { uri: coverUrl });
        // coverUrl을 주지 않는 구버전 서버 응답도 기본 표지로 보여 준다.
        expect(within(oldServer).getByTestId('book-cover-default')).toBeOnTheScreen();
    });

    test('S-76 위쪽에 책 표지를 한 번 보여 줘요', async () => {
        jest.mocked(feedUserBook).mockResolvedValue([{ ...reportNew, coverUrl }, { ...oneLine, coverUrl }]);
        await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
        expect(await screen.findByTestId('book-cover-image')).toHaveProp('source', { uri: coverUrl });
        expect(screen.getAllByTestId('book-cover-image')).toHaveLength(1);
    });

    test('S-76 표지를 주지 않는 구버전 서버면 책장의 기본 표지를 보여 줘요', async () => {
        jest.mocked(feedUserBook).mockResolvedValue([reportNew, oneLine]);
        await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
        expect(await screen.findByTestId('book-cover-default')).toHaveTextContent(reportNew.genre);
        expect(screen.queryByTestId('book-cover-image')).toBeNull();
    });
});
