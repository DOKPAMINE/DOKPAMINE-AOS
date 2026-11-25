import { router, Slot, Stack } from 'expo-router';
import { Dimensions, RefreshControl, StyleSheet, type RefreshControlProps } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { isLoaded } from 'expo-font';
import Lounge from '../../../app/(tabs)/lounge';
import Search from '../../../app/lounge/search';
import Detail from '../../../app/lounge/[id]';
import UserBook from '../../../app/lounge/user-books/[userBookId]';
import { feedItem, feedList, feedUserBook, likeReview, searchBookReviews, unlikeReview } from '../../api/endpoints';
import { ApiError } from '../../api/errors';
import type { BookReviewSearchResponse, FeedItem } from '../../api/types';
import { colors, radii } from '../../theme';
import { connectLoungeSyncRefresh, loungeKeys } from '../queries';
import { openingBracketIndent, previewText } from '../../domain/loungeRules';

jest.mock('../../api/endpoints', () => ({
    feedItem: jest.fn(), feedList: jest.fn(), feedUserBook: jest.fn(), likeReview: jest.fn(), searchBookReviews: jest.fn(), unlikeReview: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: jest.fn() }));

const base = { nickname: '독자', bookTitle: '데미안', bookAuthor: '헤르만 헤세', genre: '소설', likeCount: 2, likedByMe: false, mine: false };
const reportNew: FeedItem = { ...base, id: 'review-new', userBookId: 'user-book-1', oneLine: null,
    body: '두 번째로 읽으니 싱클레어가 다르게 보였어요.', bodyWrittenAt: '2026-11-24T15:30:00Z' };
const oneLine: FeedItem = { ...base, id: 'review-one-line', userBookId: 'user-book-1', oneLine: '나를 돌아보는 책', body: null, bodyWrittenAt: null };
const legacy: FeedItem = { ...base, id: 'review-legacy', userBookId: 'user-book-1', oneLine: '예전 한줄평',
    body: '처음 읽었을 때의 독후감이에요.', bodyWrittenAt: '2026-10-01T00:00:00Z' };
const otherBox: FeedItem = { ...base, id: 'review-other', userBookId: 'user-book-2', nickname: '산책', bookTitle: '어린 왕자',
    bookAuthor: '생텍쥐페리', oneLine: '어른이 되어 다시 읽은 책', body: '여우의 말이 오래 남았어요.', bodyWrittenAt: '2026-11-20T01:00:00Z', likeCount: 9 };

// S-70 박스는 『제목』 → 닉네임 → 감상 → 날짜 순서로 읽는다.
const boxName = '『데미안』, 독자, 두 번째로 읽으니 싱클레어가 다르게 보였어요., 2026년 11월 25일에 쓴 독후감';
const openBox = '감상 모음을 열어요';
const removedMessage = '삭제됐거나 비공개로 바뀐 감상이에요.';
const offlineMessage = '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.';
const notFound = () => new ApiError('http', 'NOT_FOUND', '감상이 없어요.', 404);
const pull = () => (RefreshControl as unknown as { latestRef: { props: RefreshControlProps } }).latestRef.props;
const labelOf = (node: { props: { accessibilityLabel?: string; children?: unknown } }) => node.props.accessibilityLabel ?? node.props.children;
const styleOf = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) ?? {};

type Node = ReturnType<typeof screen.getByTestId>;
/** 화면에 그려지는 순서대로 칸 안의 글(호스트 Text)을 모은다. */
const texts = (node: Node) => {
    const found: Node[] = [];
    const walk = (parent: Node) => {
        for (const child of parent.children) {
            if (typeof child === 'string') continue;
            if (child.type === 'Text') found.push(child);
            else walk(child);
        }
    };
    walk(node);
    return found;
};

let client: QueryClient;
const screens = {
    '(tabs)/lounge': Lounge,
    'lounge/search': Search,
    'lounge/[id]': Detail,
    'lounge/user-books/[userBookId]': UserBook,
};
const routes = { _layout: () => <QueryClientProvider client={client}><Slot /></QueryClientProvider>, ...screens };
// 상세로 갔다 돌아와도 앞 화면이 남아 있는 스택. 화면 복귀와 뒤로 가기를 확인한다.
const stackRoutes = { _layout: () => <QueryClientProvider client={client}><Stack /></QueryClientProvider>, ...screens };

beforeEach(() => {
    jest.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    onlineManager.setOnline(true);
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as NetInfoState);
    // 앱은 Noto Sans KR을 불러온 뒤 화면을 그린다.
    jest.mocked(isLoaded).mockReturnValue(true);
    jest.mocked(feedList).mockResolvedValue([reportNew, otherBox]);
    jest.mocked(feedUserBook).mockResolvedValue([reportNew, oneLine, legacy]);
    jest.mocked(feedItem).mockImplementation(async id => [reportNew, oneLine, legacy, otherBox].find(item => item.id === id)!);
    jest.mocked(likeReview).mockResolvedValue({ likeCount: 3, likedByMe: true });
    jest.mocked(unlikeReview).mockResolvedValue({ likeCount: 2, likedByMe: false });
});
afterEach(() => { client.clear(); onlineManager.setOnline(true); });

test('#113 FR-08 S-70 최근 공개 감상은 서버 순서대로 사람의 책 박스로 보이고 제목·닉네임·독후감 앞부분·쓴 날짜를 보여 줘요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge' });
    const boxes = await screen.findAllByHintText(openBox);
    expect(boxes.map(labelOf)).toEqual([boxName, '『어린 왕자』, 산책, 여우의 말이 오래 남았어요., 2026년 11월 20일에 쓴 독후감']);
    expect(texts(within(boxes[0]).getByTestId('lounge-box-text')).map(text => text.props.children))
        .toEqual(['『', '데미안', '』', '독자', reportNew.body, '2026. 11. 25.']);
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
    expect(screen.getAllByRole('header').map(labelOf)).toEqual(['감상 모음', '『데미안』', '한줄평', '독후감']);
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
    const box = await screen.findByHintText('감상 상세를 열어요');
    expect(labelOf(box)).toBe('『데미안』, 독자, 두 번째로 읽으니 싱클레어가 다르게 보였어요.');
    await fireEvent.press(box);
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

describe('#113 FR-16 S-71 책 감상 검색 결과', () => {
    const coverUrl = 'https://image.example.com/demian.jpg';
    const r1 = { ...reportNew, publishedAt: '2026-11-24T15:30:00Z' };
    const r2: FeedItem = { ...base, id: 'review-walk', userBookId: 'user-book-3', nickname: '산책', oneLine: '산책하며 읽은 책', body: null,
        bodyWrittenAt: null, publishedAt: '2026-11-20T00:00:00Z', likeCount: 9, coverUrl };
    const r3 = { ...legacy, publishedAt: '2026-10-01T00:00:00Z' };
    const r4: FeedItem = { ...base, id: 'review-old', nickname: '옛 독자', oneLine: null, body: '예전 서버의 감상이에요.',
        publishedAt: '2026-09-01T00:00:00Z', likeCount: 0 };
    const r5 = { ...oneLine, publishedAt: null };
    const groups: BookReviewSearchResponse = [
        { bookKey: 'isbn:9788937460449', bookTitle: '데미안', bookAuthor: '헤르만 헤세', isbn: '9788937460449', reviews: [r1, r2, r3, r4, r5] },
        { bookKey: 'text:other', bookTitle: '데미안', bookAuthor: '다른 저자',
            reviews: [{ ...r2, id: 'review-other-book', userBookId: 'user-book-9', nickname: '다른 독자', likeCount: 99, coverUrl: null }] },
    ];
    // S-71 박스는 책 제목 없이 닉네임 → 감상 → 날짜 순서로 읽는다.
    const readerBox = '독자, 두 번째로 읽으니 싱클레어가 다르게 보였어요., 2026년 11월 25일에 쓴 독후감';
    const walkBox = '산책, 산책하며 읽은 책';
    const otherBookBox = '다른 독자, 산책하며 읽은 책';
    const oldRow = '데미안 · 옛 독자님의 감상 보기';
    // 박스(감상 모음을 여는 힌트)와 예전 응답의 감상 한 줄("…님의 감상 보기")을 화면 순서대로 모은다.
    const searchRows = () => screen.getAllByRole('button').filter(button =>
        button.props.accessibilityHint === openBox || /님의 감상 보기$/.test(button.props.accessibilityLabel ?? ''));
    const selectedOrders = () => ({
        latest: screen.getAllByRole('radio', { name: '최신순' }).map(radio => radio.props.accessibilityState?.selected),
        likes: screen.getAllByRole('radio', { name: '좋아요 많은 순' }).map(radio => radio.props.accessibilityState?.selected),
    });
    beforeEach(() => { jest.mocked(searchBookReviews).mockResolvedValue(groups); });

    test('책 묶음 정보(표지·제목·저자·ISBN), 구분선, "N명의 감상", 카드 모양 박스 순서로 보여 줘요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        const [first, second] = await screen.findAllByTestId('book-group');
        const header = within(first).getByTestId('book-group-header');
        expect(styleOf(header)).toMatchObject({ flexDirection: 'row' });
        // 묶음 표지는 coverUrl이 있는 첫 감상(산책)의 것이고, 없는 묶음은 책장의 기본 표지다.
        expect(within(header).getByTestId('book-cover-image')).toHaveProp('source', { uri: coverUrl });
        expect(styleOf(within(header).getByTestId('book-cover-image'))).toMatchObject({ width: 66, height: 99 });
        expect(texts(within(first).getByTestId('book-group-header-text')).map(text => text.props.children))
            .toEqual(['데미안', ['헤르만 헤세', ' · ISBN 9788937460449']]);
        expect(within(second).getByTestId('book-cover-default')).toHaveTextContent('소설');
        expect(styleOf(within(first).getByTestId('book-group-divider'))).toMatchObject({ height: 1, backgroundColor: colors.line.border });
        // N은 박스 수(사람 수)다. 독자의 감상 3개는 한 박스, 산책 1개, 예전 응답 1개 → 3명.
        expect(within(first).getByRole('header', { name: '3명의 감상' })).toBeOnTheScreen();
        expect(within(second).getByRole('header', { name: '1명의 감상' })).toBeOnTheScreen();
        expect(searchRows().map(labelOf)).toEqual([readerBox, walkBox, oldRow, otherBookBox]);
        // 박스에는 표지와 책 제목이 없고, 박스와 예전 응답의 감상은 공통 Card와 같은 카드 모양이다.
        const cardStyle = { borderRadius: radii.card, borderWidth: 1, borderColor: colors.line.border, backgroundColor: colors.surface.card };
        for (const row of searchRows()) {
            expect(styleOf(row)).toMatchObject(cardStyle);
            expect(within(row).queryByTestId('book-cover-image')).toBeNull();
            expect(within(row).queryByTestId('book-cover-default')).toBeNull();
        }
        const readerText = within(screen.getByRole('button', { name: readerBox })).getByTestId('lounge-box-text');
        expect(texts(readerText).map(text => text.props.children)).toEqual(['독자', r1.body, '2026. 11. 25.']);
        // 대표는 가장 최근에 쓴 독후감이고, 산책은 독후감이 없어 한줄평이다.
        expect(screen.queryByText(r3.body!)).toBeNull();
        expect(screen.queryByText(r5.oneLine!)).toBeNull();
    });

    test('정렬 버튼은 묶음마다 "N명의 감상" 옆에 있고 기본은 최신순이에요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        const groupNodes = await screen.findAllByTestId('book-group');
        for (const group of groupNodes) {
            const row = within(group).getByTestId('book-group-count-row');
            // 좁은 화면이나 큰 글씨에서는 버튼이 제목 아래 줄로 내려간다.
            expect(styleOf(row)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
            expect(within(row).getByRole('radio', { name: '최신순' })).toBeOnTheScreen();
            expect(within(row).getByRole('radio', { name: '좋아요 많은 순' })).toBeOnTheScreen();
        }
        expect(screen.getAllByLabelText('데미안 감상 정렬')).toHaveLength(2);
        expect(selectedOrders()).toEqual({ latest: [true, true], likes: [false, false] });
    });

    test('어느 묶음에서 정렬을 바꿔도 모든 묶음의 정렬과 선택 표시가 같이 바뀌고, 정렬은 묶음 안에서만 해요', async () => {
        jest.mocked(searchBookReviews).mockResolvedValue([groups[0], { ...groups[1], reviews: [
            { ...groups[1].reviews[0], publishedAt: '2026-11-25T00:00:00Z', likeCount: 0 },
            { ...groups[1].reviews[0], id: 'review-popular', userBookId: 'user-book-10', nickname: '인기 독자', publishedAt: '2026-11-01T00:00:00Z', likeCount: 50 },
        ] }]);
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        await screen.findAllByTestId('book-group');
        expect(searchRows().map(labelOf)).toEqual([readerBox, walkBox, oldRow, otherBookBox, '인기 독자, 산책하며 읽은 책']);
        // 두 번째 묶음의 버튼으로 바꿔도 첫 번째 묶음까지 같이 바뀐다.
        await fireEvent.press(screen.getAllByRole('radio', { name: '좋아요 많은 순' })[1]);
        expect(selectedOrders()).toEqual({ latest: [false, false], likes: [true, true] });
        // 산책 9개 > 독자 2+2+2=6개 > 옛 독자 0개, 인기 독자 50개 > 다른 독자 0개. 묶음 순서는 그대로다.
        expect(searchRows().map(labelOf)).toEqual([walkBox, readerBox, oldRow, '인기 독자, 산책하며 읽은 책', otherBookBox]);
        await fireEvent.press(screen.getAllByRole('radio', { name: '최신순' })[0]);
        expect(selectedOrders()).toEqual({ latest: [true, true], likes: [false, false] });
        expect(searchRows().map(labelOf)).toEqual([readerBox, walkBox, oldRow, otherBookBox, '인기 독자, 산책하며 읽은 책']);
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

    test('내가 쓴 박스는 닉네임 뒤에 "(내 감상)"을 붙여요', async () => {
        jest.mocked(searchBookReviews).mockResolvedValue([{ ...groups[0], reviews: [{ ...r1, mine: true }] }]);
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        const box = await screen.findByHintText(openBox);
        expect(labelOf(box)).toBe('독자 (내 감상), 두 번째로 읽으니 싱클레어가 다르게 보였어요., 2026년 11월 25일에 쓴 독후감');
        expect(texts(within(box).getByTestId('lounge-box-text'))[0]).toHaveTextContent('독자 (내 감상)');
    });
});

describe('#113 FR-16 S-71 맨 위 검색창', () => {
    const searchInputs = () => screen.getAllByLabelText('책 이름');

    test('들어올 때 검색한 단어가 채워져 있고, 고쳐서 검색하면 같은 화면에서 결과만 바뀌며 뒤로 가기는 라운지로 가요', async () => {
        jest.mocked(searchBookReviews).mockResolvedValue([]);
        await renderRouter(stackRoutes, { initialUrl: '/lounge' });
        await fireEvent.changeText(await screen.findByLabelText('책 이름'), '데미안');
        await fireEvent.press(screen.getByRole('button', { name: '책 감상 검색' }));
        expect(await screen.findByText('“데미안” 검색 결과')).toBeOnTheScreen();
        const input = () => searchInputs().find(node => node.props.value !== '')!;
        expect(input()).toHaveProp('value', '데미안');
        await fireEvent.changeText(input(), ' 어린왕자 ');
        await fireEvent(input(), 'submitEditing');
        expect(await screen.findByText('“어린왕자” 검색 결과')).toBeOnTheScreen();
        expect(searchBookReviews).toHaveBeenLastCalledWith('어린왕자');
        expect(input()).toHaveProp('value', '어린왕자');
        // 다시 검색해도 화면을 쌓지 않으므로 한 번 뒤로 가면 라운지다.
        await act(async () => router.back());
        expect(await screen.findByText('최근 공개 감상')).toBeOnTheScreen();
        expect(screen.queryByText(/검색 결과/)).toBeNull();
        expect(router.canGoBack()).toBe(false);
    });

    test('빈 칸이면 검색 버튼을 막고 키보드 검색도 요청하지 않아요', async () => {
        jest.mocked(searchBookReviews).mockResolvedValue(groupsForEmpty());
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        await screen.findByText('“데미안” 검색 결과');
        const input = screen.getByLabelText('책 이름');
        expect(screen.getByRole('button', { name: '책 감상 검색' })).not.toBeDisabled();
        await fireEvent.changeText(input, '   ');
        expect(screen.getByRole('button', { name: '책 감상 검색' })).toBeDisabled();
        await fireEvent(input, 'submitEditing');
        expect(searchBookReviews).toHaveBeenCalledTimes(1);
        expect(screen.getByText('“데미안” 검색 결과')).toBeOnTheScreen();
    });

    function groupsForEmpty(): BookReviewSearchResponse { return []; }

    // 최신순이면 최근 독자 → 인기 독자, 좋아요 많은 순이면 인기 독자 → 최근 독자다.
    const sortGroups: BookReviewSearchResponse = [{ bookKey: 'isbn:9788937460449', bookTitle: '데미안', bookAuthor: '헤르만 헤세', reviews: [
        { ...oneLine, id: 'review-recent', userBookId: 'user-book-recent', nickname: '최근 독자', publishedAt: '2026-11-24T00:00:00Z', likeCount: 0 },
        { ...oneLine, id: 'review-popular', userBookId: 'user-book-popular', nickname: '인기 독자', publishedAt: '2026-10-01T00:00:00Z', likeCount: 9 },
    ] }];
    const boxOrder = () => screen.getAllByHintText(openBox).map(box => texts(within(box).getByTestId('lounge-box-text'))[0].props.children);
    const latestSelected = () => screen.getByRole('radio', { name: '최신순' }).props.accessibilityState?.selected;

    test('같은 검색어로 다시 검색하면 결과를 다시 받아 오고 고른 정렬은 그대로예요', async () => {
        jest.mocked(searchBookReviews).mockResolvedValueOnce(sortGroups)
            .mockResolvedValue([{ ...sortGroups[0], reviews: [sortGroups[0].reviews[1]] }]);
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        await screen.findByText('2명의 감상');
        expect(searchBookReviews).toHaveBeenCalledTimes(1);
        await fireEvent.press(screen.getByRole('radio', { name: '좋아요 많은 순' }));
        // 앞뒤 공백만 다른 같은 검색어다.
        await fireEvent.changeText(screen.getByLabelText('책 이름'), ' 데미안 ');
        await fireEvent.press(screen.getByRole('button', { name: '책 감상 검색' }));
        await waitFor(() => expect(searchBookReviews).toHaveBeenCalledTimes(2));
        expect(searchBookReviews).toHaveBeenLastCalledWith('데미안');
        expect(await screen.findByText('1명의 감상')).toBeOnTheScreen();
        expect(screen.getByText('“데미안” 검색 결과')).toBeOnTheScreen();
        expect(latestSelected()).toBe(false);
    });

    test('검색어가 바뀌면 정렬을 최신순으로 되돌려요', async () => {
        jest.mocked(searchBookReviews).mockResolvedValue(sortGroups);
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        await screen.findByText('2명의 감상');
        expect(boxOrder()).toEqual(['최근 독자', '인기 독자']);
        await fireEvent.press(screen.getByRole('radio', { name: '좋아요 많은 순' }));
        expect(boxOrder()).toEqual(['인기 독자', '최근 독자']);
        await fireEvent.changeText(screen.getByLabelText('책 이름'), '데미안 개정판');
        await fireEvent(screen.getByLabelText('책 이름'), 'submitEditing');
        expect(await screen.findByText('“데미안 개정판” 검색 결과')).toBeOnTheScreen();
        await screen.findByText('2명의 감상');
        expect(latestSelected()).toBe(true);
        expect(boxOrder()).toEqual(['최근 독자', '인기 독자']);
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

describe('#113 S-70 S-76 책 표지', () => {
    const coverUrl = 'https://image.example.com/demian.jpg';

    test('S-70 박스 왼쪽에 책 표지를 보여 주고, 표지가 없으면 책장의 기본 표지를 보여 줘요', async () => {
        jest.mocked(feedList).mockResolvedValue([{ ...reportNew, coverUrl }, { ...otherBox, coverUrl: null }]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        const [withCover, withoutCover] = await screen.findAllByHintText(openBox);
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

describe('#113 S-70 S-71 S-76 표지 왼쪽·글 오른쪽 배치', () => {
    const longTitle = '데미안: 에밀 싱클레어의 젊은 날 이야기 완역 개정판';
    const longItem: FeedItem = { ...reportNew, nickname: '아주긴닉네임을가진독자님', bookTitle: longTitle, body: '긴 독후감 '.repeat(200), coverUrl: null };
    const expectScalableWrapping = (node: Node) => {
        // 글 칸은 표지 옆 남은 너비만 쓰고(flex 1, minWidth 0) 그 안에서 줄바꿈한다.
        expect(styleOf(node)).toMatchObject({ flex: 1, minWidth: 0 });
        for (const text of texts(node)) {
            // 큰 글씨 설정을 막지 않는다.
            expect(text.props.allowFontScaling).not.toBe(false);
            expect(text.props.maxFontSizeMultiplier).toBeUndefined();
        }
    };

    test('S-70 박스는 왼쪽 작은 표지(책장 2:3 비율), 오른쪽 칸에 『제목』, 닉네임, 감상, 날짜를 세로로 두고 긴 글도 칸 안에서 줄바꿈해요', async () => {
        jest.mocked(feedList).mockResolvedValue([longItem]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        const box = await screen.findByHintText(openBox);
        expect(styleOf(box)).toMatchObject({ flexDirection: 'row' });
        expect(styleOf(within(box).getByTestId('book-cover-default'))).toMatchObject({ width: 44, height: 66 });
        const column = within(box).getByTestId('lounge-box-text');
        expectScalableWrapping(column);
        const [open, title, close, nickname, preview, date] = texts(column);
        expect([open, title, close].map(text => text.props.children)).toEqual(['『', longTitle, '』']);
        expect(nickname).toHaveTextContent('아주긴닉네임을가진독자님');
        // 닉네임·날짜는 줄 수를 제한하지 않아 잘리지 않고, 감상은 앞부분 3줄로 줄인다.
        for (const text of [nickname, date]) expect(text.props.numberOfLines).toBeUndefined();
        expect(preview.props.numberOfLines).toBe(3);
        expect(date).toHaveTextContent('2026. 11. 25.');
    });

    test('S-70 스크린리더는 『제목』 → 닉네임 → 감상 → 날짜 순서로 읽고, 긴 감상은 앞부분만 읽어요', async () => {
        jest.mocked(feedList).mockResolvedValue([longItem, { ...reportNew, userBookId: undefined, mine: true }]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        const box = await screen.findByHintText(openBox);
        expect(labelOf(box)).toBe(`『${longTitle}』, 아주긴닉네임을가진독자님, ${previewText(longItem.body!)}, 2026년 11월 25일에 쓴 독후감`);
        const mineBox = screen.getByHintText('감상 상세를 열어요');
        expect(labelOf(mineBox)).toBe(`『데미안』 내 감상, 독자, ${reportNew.body}, 2026년 11월 25일에 쓴 독후감`);
        expect(within(mineBox).getByTestId('bracket-mine')).toHaveTextContent('(내 감상)');
    });

    test('S-71 검색 박스는 표지 없이 글 칸만 두고 칸 안에서 줄바꿈하며, 묶음 제목은 1줄까지 보여요', async () => {
        jest.mocked(searchBookReviews).mockResolvedValue([{ bookKey: 'text:long', bookTitle: longTitle, bookAuthor: '헤르만 헤세', reviews: [longItem] }]);
        await renderRouter(routes, { initialUrl: '/lounge/search?query=데미안' });
        const box = await screen.findByHintText(openBox);
        expect(styleOf(box)).toMatchObject({ flexDirection: 'row' });
        const column = within(box).getByTestId('lounge-box-text');
        expectScalableWrapping(column);
        expect(texts(column)[0]).toHaveTextContent('아주긴닉네임을가진독자님');
        const header = screen.getByTestId('book-group-header-text');
        expectScalableWrapping(header);
        const [groupTitle] = texts(header);
        expect(groupTitle).toHaveTextContent(longTitle);
        expect(groupTitle.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail', accessibilityLabel: longTitle });
    });

    test('S-76 위쪽은 왼쪽 표지, 오른쪽 칸에 『제목』 (내 감상), 닉네임, 저자를 두고 줄바꿈해요', async () => {
        jest.mocked(feedUserBook).mockResolvedValue([{ ...longItem, mine: true }, oneLine]);
        await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
        const column = await screen.findByTestId('user-book-header-text');
        expectScalableWrapping(column);
        const [open, title, close, mine, nickname, author] = texts(column);
        expect([open, title, close, mine].map(text => text.props.children)).toEqual(['『', longTitle, '』', ' (내 감상)']);
        expect(nickname).toHaveTextContent('아주긴닉네임을가진독자님');
        expect(author).toHaveTextContent('헤르만 헤세');
        expect(styleOf(screen.getByTestId('book-cover-default'))).toMatchObject({ width: 66, height: 99 });
        expect(styleOf(screen.getByTestId('user-book-header'))).toMatchObject({ flexDirection: 'row' });
    });
});

describe('#113 S-70 S-76 『제목』 줄(BracketTitle)', () => {
    const longTitle = '데미안: 에밀 싱클레어의 젊은 날 이야기 완역 개정판';
    const indentFor = (fontSize: number) => openingBracketIndent(fontSize, Dimensions.get('window').fontScale, true);
    const pieces = (root: Node) => ({
        row: root,
        open: within(root).getByTestId('bracket-open'),
        title: within(root).getByTestId('bracket-title'),
        close: within(root).getByTestId('bracket-close'),
        mine: within(root).queryByTestId('bracket-mine'),
    });

    test('S-70 박스는 한 줄 안에 『, 제목, 』, (내 감상)을 두고 『만 당기며, 제목만 1줄로 줄여요', async () => {
        jest.mocked(feedList).mockResolvedValue([{ ...reportNew, bookTitle: longTitle, mine: true }]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        const box = await screen.findByHintText(openBox);
        const { row, open, title, close, mine } = pieces(within(box).getByLabelText(`『${longTitle}』 내 감상`));
        expect(styleOf(row)).toMatchObject({ flexDirection: 'row' });
        // 『만 Noto Sans KR의 빈 공간만큼 왼쪽으로 당기고, 나머지는 당기지 않는다.
        expect(styleOf(open).marginLeft).toBe(-indentFor(16));
        for (const text of [title, close, mine!]) expect(styleOf(text).marginLeft).toBeUndefined();
        // 제목만 줄어들고 1줄을 넘으면 …으로 줄인다. 』와 (내 감상)은 줄지 않아 항상 보인다.
        expect(styleOf(title)).toMatchObject({ flexShrink: 1 });
        expect(title.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' });
        for (const text of [open, close, mine!]) {
            expect(styleOf(text)).toMatchObject({ flexShrink: 0 });
            expect(text.props.numberOfLines).toBeUndefined();
        }
        expect(mine).toHaveTextContent('(내 감상)');
    });

    test('S-76 위쪽 제목은 2줄까지 보이고, 스크린리더는 "『제목』 내 감상"을 제목으로 한 번에 읽어요', async () => {
        jest.mocked(feedUserBook).mockResolvedValue([{ ...reportNew, bookTitle: longTitle, mine: true }]);
        await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
        const header = await screen.findByRole('header', { name: `『${longTitle}』 내 감상` });
        expect(header.props.accessible).toBe(true);
        const { open, title } = pieces(header);
        expect(title.props).toMatchObject({ numberOfLines: 2, ellipsizeMode: 'tail' });
        expect(styleOf(open).marginLeft).toBe(-indentFor(18));
    });

    test('내가 쓴 박스가 아니면 (내 감상)을 두지 않고 스크린리더도 『제목』만 읽어요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge/user-books/user-book-1' });
        const header = await screen.findByRole('header', { name: '『데미안』' });
        expect(pieces(header).mine).toBeNull();
    });

    test('Noto Sans KR을 불러오지 못했으면 『를 당기지 않아요', async () => {
        jest.mocked(isLoaded).mockReturnValue(false);
        await renderRouter(routes, { initialUrl: '/lounge' });
        const [box] = await screen.findAllByHintText(openBox);
        expect(styleOf(within(box).getByTestId('bracket-open')).marginLeft).toBe(0);
        // 박스 제목(16sp Medium) 글꼴로 확인한다.
        expect(isLoaded).toHaveBeenCalledWith('NotoSansKR_500Medium');
    });
});
