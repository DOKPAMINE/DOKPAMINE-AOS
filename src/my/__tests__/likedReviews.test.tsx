import { preloadReactNative } from '../../__tests__/preloadReactNative';

import { router, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { RefreshControl, StyleSheet, Text, type RefreshControlProps } from 'react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import LikedReviews from '../../../app/liked-reviews';
import UserBook from '../../../app/lounge/user-books/[userBookId]';
import { feedUserBook, likedBooks, likeReview, unlikeReview } from '../../api/endpoints';
import { ApiError } from '../../api/errors';
import type { FeedItem, LikedBookGroup, LikedBookPage, LikedPerson } from '../../api/types';
import { removedReviewMessage } from '../../lounge/QueryState';
import { likedBadRequestMessage } from '../LikedError';
import { likedBookKeys } from '../likedQueries';
import { LikedReviewsSection } from '../LikedReviewsSection';

// 첫 render가 react-native 컴포넌트 로딩을 떠안아 시간 제한을 넘지 않도록 파일 로딩 단계에서 불러온다(#103).
preloadReactNative();

jest.mock('../../api/endpoints', () => ({
    likedBooks: jest.fn(), feedUserBook: jest.fn(), feedItem: jest.fn(), feedList: jest.fn(), likeReview: jest.fn(), unlikeReview: jest.fn(), searchBookReviews: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn() }));

const at = '2026-11-25T10:00:00Z';
const person = (nickname: string, likedCount: number, userBookId: string, mine = false): LikedPerson =>
    ({ authorId: `author-${userBookId}`, nickname, userBookId, likedCount, lastLikedAt: at, mine });
const group = (bookKey: string, bookTitle: string, people: LikedPerson[]): LikedBookGroup =>
    ({ bookKey, isbn: null, bookTitle, bookAuthor: `${bookTitle} 작가`, coverUrl: null, lastLikedAt: at, people });
const sky = person('하늘님', 2, 'ub-sky');
const star = person('별님', 1, 'ub-star');
const prince = group('isbn:prince', '어린 왕자', [sky, star]);
const books = (from: number, count: number) => Array.from({ length: count }, (_, index) =>
    group(`book-${from + index}`, `책 ${from + index}`, [person(`독자${from + index}`, 1, `ub-${from + index}`)]));
const review: FeedItem = { id: 'review-sky', userBookId: 'ub-sky', nickname: '하늘님', bookTitle: '어린 왕자', bookAuthor: '생텍쥐페리',
    genre: '소설/시', oneLine: '여우의 말이 오래 남아요', body: null, likeCount: 4, likedByMe: true, mine: false };
const offlineMessage = '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.';
const hidden = { includeHiddenElements: true };
const pull = () => (RefreshControl as unknown as { latestRef: { props: RefreshControlProps } }).latestRef.props;
// 목록 끝까지 스크롤한다. FlatList가 스크롤 위치로 끝을 알리고(onEndReached) 새로 받은 묶음까지 그린다.
const endReached = async () => {
    const list = screen.getByTestId('liked-list');
    await fireEvent(list, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } });
    await fireEvent(list, 'contentSizeChange', 400, 4000);
    await fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 0, y: 3200 }, contentSize: { width: 400, height: 4000 },
        layoutMeasurement: { width: 400, height: 800 } } });
};
const titles = () => screen.getAllByRole('header').map(node => node.props.children).filter(text => text !== '좋아요한 감상');
const styleOf = (node: ReturnType<typeof screen.getByTestId>) => StyleSheet.flatten(
    typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

let client: QueryClient;
const routes = {
    _layout: () => <QueryClientProvider client={client}><Stack screenOptions={{ headerShown: false }} /></QueryClientProvider>,
    '(tabs)/my': () => <Text>마이 화면</Text>,
    'liked-reviews/index': LikedReviews,
    'lounge/user-books/[userBookId]': UserBook,
};
const page = (items: LikedBookGroup[], nextCursor: string | null = null): LikedBookPage => ({ items, nextCursor });

beforeEach(() => {
    jest.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    onlineManager.setOnline(true);
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as NetInfoState);
    jest.mocked(likedBooks).mockResolvedValue(page([prince]));
    jest.mocked(feedUserBook).mockResolvedValue([review]);
    jest.mocked(likeReview).mockResolvedValue({ likeCount: 5, likedByMe: true });
    jest.mocked(unlikeReview).mockResolvedValue({ likeCount: 3, likedByMe: false });
});
afterEach(() => { client.clear(); });

test('FR-09 S-80 전체 보기에서 어린 왕자 묶음 안에 하늘님 ♥2, 별님 ♥1 순서로 보이고 줄을 누르면 그 사람의 그 책 감상이 보여요', async () => {
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    const rows = await screen.findAllByTestId('liked-person');
    expect(likedBooks).toHaveBeenCalledWith({ size: 20, cursor: undefined }, expect.anything());
    expect(screen.getByRole('header', { name: '어린 왕자' })).toBeOnTheScreen();
    expect(screen.getByText('어린 왕자 작가')).toBeOnTheScreen();
    expect(rows.map(row => row.props.accessibilityLabel)).toEqual(['어린 왕자, 하늘님, 좋아요 2개, 감상 보기', '어린 왕자, 별님, 좋아요 1개, 감상 보기']);
    expect(within(rows[0]).getByText('하늘님')).toBeOnTheScreen();
    expect(within(rows[0]).getByText('2')).toBeOnTheScreen();
    expect(within(rows[1]).getByText('1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '어린 왕자, 하늘님, 좋아요 2개, 감상 보기' }));
    expect(await screen.findByText('여우의 말이 오래 남아요')).toBeOnTheScreen();
    expect(feedUserBook).toHaveBeenCalledWith('ub-sky', expect.anything());
    expect(screen).toHavePathname('/lounge/user-books/ub-sky');
});

test('FR-09 S-76 좋아요한 감상 목록에서 열면 아래 버튼이 "돌아가기"이고 누르면 스크롤하던 목록으로 다시 받지 않고 돌아가요', async () => {
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    await fireEvent.press(await screen.findByRole('button', { name: '어린 왕자, 하늘님, 좋아요 2개, 감상 보기' }));
    const back = await screen.findByRole('button', { name: '돌아가기' });
    expect(within(back).getByText('돌아가기')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '라운지로 돌아가기' })).toBeNull();
    await fireEvent.press(back);
    expect(await screen.findByRole('header', { name: '어린 왕자' })).toBeOnTheScreen();
    expect(screen).toHavePathname('/liked-reviews');
    // 평소에는 돌아와도 다시 받지 않는다(스크롤 위치 유지).
    expect(likedBooks).toHaveBeenCalledTimes(1);
});

test('FR-08 S-76 라운지에서 열면 아래 버튼은 지금처럼 "라운지로 돌아가기"예요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge/user-books/ub-sky' });
    const back = await screen.findByRole('button', { name: '라운지로 돌아가기' });
    expect(within(back).getByText('라운지로 돌아가기')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '돌아가기' })).toBeNull();
});

test('FR-09 S-80 S-76에서 좋아요를 취소하면 좋아요한 감상 미리보기·목록을 무효로 하고 돌아왔을 때 목록이 맞아요', async () => {
    client.setQueryData(likedBookKeys.preview, page([prince]));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    await fireEvent.press(await screen.findByRole('button', { name: '어린 왕자, 하늘님, 좋아요 2개, 감상 보기' }));
    jest.mocked(likedBooks).mockResolvedValue(page([group('isbn:prince', '어린 왕자', [star])]));
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 좋아요 취소' }));
    await waitFor(() => expect(unlikeReview).toHaveBeenCalledWith('review-sky'));
    // 라운지 감상 모음은 기존처럼 바로 바뀐다.
    expect(await screen.findByRole('button', { name: '한줄평 좋아요' })).toBeOnTheScreen();
    await waitFor(() => expect(client.getQueryState(likedBookKeys.preview)?.isInvalidated).toBe(true));
    await fireEvent.press(screen.getByRole('button', { name: '돌아가기' }));
    await waitFor(() => expect(screen.getAllByTestId('liked-person')).toHaveLength(1));
    expect(screen.getByRole('button', { name: '어린 왕자, 별님, 좋아요 1개, 감상 보기' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /하늘님/ })).toBeNull();
    expect(likedBooks).toHaveBeenCalledTimes(2);
});

test('FR-09 S-80 S-76에서 좋아요를 눌러도 좋아요한 감상 조회를 무효로 해요', async () => {
    jest.mocked(feedUserBook).mockResolvedValue([{ ...review, likedByMe: false }]);
    client.setQueryData(likedBookKeys.preview, page([]));
    client.setQueryData(likedBookKeys.list, { pages: [page([])], pageParams: [undefined] });
    await renderRouter(routes, { initialUrl: '/lounge/user-books/ub-sky' });
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 좋아요' }));
    await waitFor(() => expect(likeReview).toHaveBeenCalledWith('review-sky'));
    await waitFor(() => expect(client.getQueryState(likedBookKeys.preview)?.isInvalidated).toBe(true));
    expect(client.getQueryState(likedBookKeys.list)?.isInvalidated).toBe(true);
});

test('FR-09 S-80 한 책에 5명이면 3명만 보이고 "2명 더 보기"를 누르면 모두 보여요', async () => {
    const people = ['가', '나', '다', '라', '마'].map((name, index) => person(`${name}님`, 1, `ub-${index}`));
    jest.mocked(likedBooks).mockResolvedValue(page([group('isbn:prince', '어린 왕자', people)]));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findAllByTestId('liked-person')).toHaveLength(3);
    const more = screen.getByRole('button', { name: '어린 왕자, 2명 더 보기' });
    expect(within(more).getByText('2명 더 보기')).toBeOnTheScreen();
    expect(styleOf(more).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(more);
    expect(screen.getAllByTestId('liked-person').map(row => within(row).getByText(/님$/).props.children)).toEqual(['가님', '나님', '다님', '라님', '마님']);
    expect(screen.queryByText(/명 더 보기/)).toBeNull();
});

test('FR-09 S-80 3명 이하면 "더 보기"가 없어요', async () => {
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findAllByTestId('liked-person')).toHaveLength(2);
    expect(screen.queryByText(/명 더 보기/)).toBeNull();
});

test('FR-09 S-80 묶음이 25개면 처음 20개가 보이고 아래로 스크롤하면 나머지 5개를 한 번만 이어 받고 끝이면 더 부르지 않아요', async () => {
    jest.mocked(likedBooks).mockImplementation(async ({ cursor }) => cursor === 'next-1' ? page(books(21, 5)) : page(books(1, 20), 'next-1'));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findAllByTestId('liked-group')).toHaveLength(20);
    // 스크롤 끝 알림이 겹쳐 와도 다음 페이지는 한 번만 부른다.
    await act(async () => {
        screen.getByTestId('liked-list').props.onEndReached?.({ distanceFromEnd: 0 });
        screen.getByTestId('liked-list').props.onEndReached?.({ distanceFromEnd: 0 });
    });
    await waitFor(() => expect(likedBooks).toHaveBeenCalledTimes(2));
    await endReached();
    await waitFor(() => expect(screen.getAllByTestId('liked-group')).toHaveLength(25));
    expect(likedBooks).toHaveBeenCalledTimes(2);
    expect(likedBooks).toHaveBeenLastCalledWith({ size: 20, cursor: 'next-1' }, expect.anything());
    expect(titles().slice(-5)).toEqual(['책 21', '책 22', '책 23', '책 24', '책 25']);
    await endReached();
    expect(likedBooks).toHaveBeenCalledTimes(2);
});

test('FR-09 S-80 다음 페이지를 불러오지 못하면 보이던 목록은 두고 다시 시도할 수 있어요', async () => {
    jest.mocked(likedBooks).mockResolvedValueOnce(page(books(1, 20), 'next-1'))
        .mockRejectedValueOnce(new ApiError('timeout', 'TIMEOUT', '서버 응답이 늦어요. 다시 시도해 주세요.'))
        .mockResolvedValueOnce(page(books(21, 5)));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findAllByTestId('liked-group')).toHaveLength(20);
    await endReached();
    expect(await screen.findByText('서버 응답이 늦어요. 다시 시도해 주세요.')).toBeOnTheScreen();
    expect(screen.getAllByTestId('liked-group')).toHaveLength(20);
    // 실패한 뒤에는 스크롤만으로 자동 재시도하지 않는다.
    await endReached();
    expect(likedBooks).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    await waitFor(() => expect(screen.getAllByTestId('liked-group')).toHaveLength(25));
    expect(likedBooks).toHaveBeenLastCalledWith({ size: 20, cursor: 'next-1' }, expect.anything());
    expect(screen.queryByText('서버 응답이 늦어요. 다시 시도해 주세요.')).toBeNull();
});

test('FR-09 S-80 다음 페이지가 400(잘못된 cursor)이면 안내하고 처음부터 다시 불러와요', async () => {
    jest.mocked(likedBooks).mockResolvedValueOnce(page(books(1, 20), 'broken'))
        .mockRejectedValueOnce(new ApiError('http', 'BAD_REQUEST', '다음 페이지 정보가 올바르지 않아요.', 400))
        .mockResolvedValueOnce(page([prince]));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findAllByTestId('liked-group')).toHaveLength(20);
    await endReached();
    expect(await screen.findByText('목록을 불러오지 못했어요. 처음부터 다시 불러와 주세요.')).toBeOnTheScreen();
    expect(screen.queryByText(/다음 페이지 정보가 올바르지 않아요/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '처음부터 다시 불러오기' }));
    await waitFor(() => expect(screen.getAllByTestId('liked-group')).toHaveLength(1));
    expect(likedBooks).toHaveBeenLastCalledWith({ size: 20, cursor: undefined }, expect.anything());
    expect(screen.getByRole('header', { name: '어린 왕자' })).toBeOnTheScreen();
});

test('FR-09 S-80 아래로 당기면 첫 페이지부터 다시 받아요', async () => {
    jest.mocked(likedBooks).mockImplementation(async ({ cursor }) => cursor === 'next-1' ? page(books(21, 5)) : page(books(1, 20), 'next-1'));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    await screen.findAllByTestId('liked-group');
    await endReached();
    await waitFor(() => expect(screen.getAllByTestId('liked-group')).toHaveLength(25));
    jest.mocked(likedBooks).mockClear();
    jest.mocked(likedBooks).mockResolvedValue(page([prince]));
    await act(async () => { pull().onRefresh?.(); });
    await waitFor(() => expect(screen.getAllByTestId('liked-group')).toHaveLength(1));
    expect(likedBooks).toHaveBeenCalledTimes(1);
    expect(likedBooks).toHaveBeenCalledWith({ size: 20, cursor: undefined }, expect.anything());
    expect(pull().refreshing).toBe(false);
});

test('FR-09 S-80 내 감상에 누른 좋아요는 "내 감상" 표시가 붙어요', async () => {
    jest.mocked(likedBooks).mockResolvedValue(page([group('isbn:prince', '어린 왕자', [person('책산책', 1, 'ub-mine', true), star])]));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    const [mine, other] = await screen.findAllByTestId('liked-person');
    expect(within(mine).getByText('내 감상')).toBeOnTheScreen();
    expect(mine.props.accessibilityLabel).toBe('어린 왕자, 책산책, 내 감상, 좋아요 1개, 감상 보기');
    expect(within(other).queryByText('내 감상')).toBeNull();
});

test('FR-09 S-80 좋아요한 감상이 없으면 "아직 좋아요한 감상이 없어요."를 보여 줘요', async () => {
    jest.mocked(likedBooks).mockResolvedValue(page([]));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findByText('아직 좋아요한 감상이 없어요.')).toBeOnTheScreen();
    expect(screen.queryAllByTestId('liked-group')).toHaveLength(0);
});

test('FR-09 S-80 NFR-06 오프라인이면 요청하지 않고 1초 안에 오프라인 안내를 보여 줘요', async () => {
    // 연결 상태 조회가 멈춰도 500ms 뒤 오프라인으로 본다.
    jest.mocked(NetInfo.fetch).mockImplementation(() => new Promise(() => {}));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findByText(offlineMessage, {}, { timeout: 900 })).toBeOnTheScreen();
    expect(likedBooks).not.toHaveBeenCalled();
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as NetInfoState);
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByRole('header', { name: '어린 왕자' })).toBeOnTheScreen();
});

test('FR-09 S-80 첫 페이지 오류는 서버 안내와 다시 시도를 보여 주고 다시 시도하면 목록을 받아요', async () => {
    jest.mocked(likedBooks).mockRejectedValueOnce(new ApiError('http', 'INTERNAL_ERROR', '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.', 500));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findByRole('alert')).toHaveTextContent('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByRole('header', { name: '어린 왕자' })).toBeOnTheScreen();
});

test('FR-09 S-80 첫 페이지가 400이면 처음부터 다시 불러오는 안내를 보여 줘요', async () => {
    jest.mocked(likedBooks).mockRejectedValueOnce(new ApiError('http', 'BAD_REQUEST', '한 번에 1개부터 50개까지 불러올 수 있어요.', 400));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findByText(likedBadRequestMessage)).toBeOnTheScreen();
    expect(screen.queryByText(/한 번에 1개부터 50개까지/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '처음부터 다시 불러오기' }));
    expect(await screen.findByRole('header', { name: '어린 왕자' })).toBeOnTheScreen();
});

test('FR-09 S-80 401이면 다시 로그인 안내를 보여 줘요(로그아웃은 공통 인증 처리가 맡아요)', async () => {
    jest.mocked(likedBooks).mockRejectedValueOnce(new ApiError('unauthorized', 'HTTP_401', '다시 로그인해 주세요.', 401));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    expect(await screen.findByRole('alert')).toHaveTextContent('다시 로그인해 주세요.');
});

test('FR-09 S-80 사람 줄은 버튼 역할·라벨과 44dp 이상 터치 영역이고 ♥ 아이콘은 보조 기술에서 숨겨요', async () => {
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    const [row] = await screen.findAllByTestId('liked-person');
    expect(row).toHaveProp('accessibilityRole', 'button');
    expect(styleOf(row).minHeight).toBeGreaterThanOrEqual(44);
    const hearts = screen.getAllByTestId('liked-heart', hidden);
    expect(hearts).toHaveLength(2);
    for (const heart of hearts) {
        expect(heart).toHaveProp('accessibilityElementsHidden', true);
        expect(heart).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    }
    expect(screen.getByRole('button', { name: '마이로 돌아가기' })).toBeOnTheScreen();
});

// 마이 탭 대신 "좋아요한 감상" 칸만 둔 경로. 스택 아래에 남아 있으면 미리보기 조회도 화면에 떠 있는 상태다.
const withPreview = { ...routes, '(tabs)/my': LikedReviewsSection };
const callsWithSize = (size: number) => jest.mocked(likedBooks).mock.calls.filter(([args]) => args.size === size).length;

test('FR-09 S-80 좋아요를 바꿔도 마이 미리보기는 바로 다시 받지 않고 마이에 돌아올 때 받아요', async () => {
    jest.mocked(feedUserBook).mockResolvedValue([{ ...review, likedByMe: false }]);
    await renderRouter(withPreview, { initialUrl: '/my' });
    expect(await screen.findByText('어린 왕자 · 하늘님 외 1명')).toBeOnTheScreen();
    expect(callsWithSize(3)).toBe(1);
    await act(async () => { router.push('/lounge/user-books/ub-sky'); });
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 좋아요' }));
    await waitFor(() => expect(likeReview).toHaveBeenCalledWith('review-sky'));
    await waitFor(() => expect(client.getQueryState(likedBookKeys.preview)?.isInvalidated).toBe(true));
    expect(callsWithSize(3)).toBe(1);
    jest.mocked(likedBooks).mockResolvedValue(page([group('isbn:prince', '어린 왕자', [star])]));
    await fireEvent.press(screen.getByRole('button', { name: '라운지로 돌아가기' }));
    expect(await screen.findByText('어린 왕자 · 별님')).toBeOnTheScreen();
    expect(callsWithSize(3)).toBe(2);
});

test('FR-09 S-80 좋아요를 바꾸면 전체 목록은 S-76에 있는 동안 바로 다시 받아요', async () => {
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    await fireEvent.press(await screen.findByRole('button', { name: '어린 왕자, 하늘님, 좋아요 2개, 감상 보기' }));
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 좋아요 취소' }));
    await waitFor(() => expect(callsWithSize(20)).toBe(2));
    expect(screen).toHavePathname('/lounge/user-books/ub-sky');
});

test('FR-09 S-80 좋아요 요청이 실패하면 좋아요한 감상 조회를 무효로 하지 않아요', async () => {
    jest.mocked(unlikeReview).mockRejectedValue(new ApiError('http', 'INTERNAL_ERROR', '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.', 500));
    client.setQueryData(likedBookKeys.preview, page([prince]));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    await fireEvent.press(await screen.findByRole('button', { name: '어린 왕자, 하늘님, 좋아요 2개, 감상 보기' }));
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 좋아요 취소' }));
    await waitFor(() => expect(unlikeReview).toHaveBeenCalledWith('review-sky'));
    // 실패하면 라운지 감상 모음은 원래 좋아요 상태로 돌아간다.
    expect(await screen.findByRole('button', { name: '한줄평 좋아요 취소' })).toBeOnTheScreen();
    expect(client.getQueryState(likedBookKeys.preview)?.isInvalidated).toBe(false);
    expect(client.getQueryState(likedBookKeys.list)?.isInvalidated).toBe(false);
    expect(likedBooks).toHaveBeenCalledTimes(1);
});

test('FR-09 S-76 좋아요 목록에서 연 감상이 404면 돌아왔을 때 그 줄이 사라져요', async () => {
    jest.mocked(feedUserBook).mockRejectedValue(new ApiError('http', 'NOT_FOUND', '요청한 주소를 찾을 수 없어요.', 404));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    jest.mocked(likedBooks).mockResolvedValue(page([group('isbn:prince', '어린 왕자', [star])]));
    await fireEvent.press(await screen.findByRole('button', { name: '어린 왕자, 하늘님, 좋아요 2개, 감상 보기' }));
    expect(await screen.findByText(removedReviewMessage)).toBeOnTheScreen();
    await waitFor(() => expect(callsWithSize(20)).toBe(2));
    await fireEvent.press(screen.getByRole('button', { name: '돌아가기' }));
    await waitFor(() => expect(screen.getAllByTestId('liked-person')).toHaveLength(1));
    expect(screen.getByRole('button', { name: '어린 왕자, 별님, 좋아요 1개, 감상 보기' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /하늘님/ })).toBeNull();
});

test.each([
    ['from=lounge', '/lounge/user-books/ub-sky?from=lounge'],
    ['from=LIKED', '/lounge/user-books/ub-sky?from=LIKED'],
    ['from 두 번', '/lounge/user-books/ub-sky?from=liked&from=liked'],
])('FR-08 S-76 잘못된 from 값(%s)이면 아래 버튼은 기본 문구 "라운지로 돌아가기"예요', async (_name, url) => {
    await renderRouter(routes, { initialUrl: url });
    expect(await screen.findByRole('button', { name: '라운지로 돌아가기' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '돌아가기' })).toBeNull();
});

test('FR-09 S-76 좋아요 목록에서 열었는데 이전 화면이 없으면 "돌아가기"는 좋아요한 감상 목록으로 가요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge/user-books/ub-sky?from=liked' });
    await fireEvent.press(await screen.findByRole('button', { name: '돌아가기' }));
    expect(await screen.findByRole('header', { name: '어린 왕자' })).toBeOnTheScreen();
    expect(screen).toHavePathname('/liked-reviews');
});

test('FR-09 S-80 표지가 없으면 미리보기와 전체 목록에 책 아이콘 칸을 보여 주고 보조 기술에서 숨겨요', async () => {
    await renderRouter(withPreview, { initialUrl: '/my' });
    await screen.findByText('어린 왕자 · 하늘님 외 1명');
    await act(async () => { router.push('/liked-reviews'); });
    await screen.findAllByTestId('liked-person');
    const boxes = screen.getAllByTestId('liked-cover-default', hidden);
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
        expect(box).toHaveProp('accessibilityElementsHidden', true);
        expect(box).toHaveProp('importantForAccessibility', 'no-hide-descendants');
        // MaterialCommunityIcons "book-outline" 글리프(985956)를 그린다.
        expect(within(box).getByTestId('liked-cover-icon', hidden)).toHaveTextContent(String.fromCodePoint(985956));
    }
    // 미리보기(33dp)와 전체 목록(44dp) 모두 BookCover와 같은 2:3 비율이다.
    const sizes = boxes.map(box => StyleSheet.flatten(box.props.style)).map(style => `${style.width}x${style.height}`).sort();
    expect(sizes).toEqual(['33x50', '44x66']);
    expect(screen.queryAllByTestId('book-cover-default', hidden)).toHaveLength(0);
});

test('FR-09 S-80 표지 사진이 있으면 보여 주고 불러오지 못하면 책 아이콘 칸으로 바꿔요', async () => {
    jest.mocked(likedBooks).mockResolvedValue(page([{ ...prince, coverUrl: 'https://covers.example.test/prince.jpg' }]));
    await renderRouter(routes, { initialUrl: '/liked-reviews' });
    const image = await screen.findByTestId('liked-cover-image', hidden);
    expect(image.props.source).toEqual({ uri: 'https://covers.example.test/prince.jpg' });
    expect(screen.queryByTestId('liked-cover-icon', hidden)).toBeNull();
    await fireEvent(image, 'error');
    expect(screen.getByTestId('liked-cover-icon', hidden)).toBeOnTheScreen();
    expect(screen.queryByTestId('liked-cover-image', hidden)).toBeNull();
});
