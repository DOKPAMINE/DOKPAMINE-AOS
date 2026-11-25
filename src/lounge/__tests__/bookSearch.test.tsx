import { router, Stack } from 'expo-router';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import Lounge from '../../../app/(tabs)/lounge';
import Search from '../../../app/lounge/search';
import { feedList, searchBookReviews } from '../../api/endpoints';
import { ApiError } from '../../api/errors';
import type { BookReviewSearchResponse, FeedItem } from '../../api/types';
import { useSignedInUserId } from '../../auth/AuthProvider';
import { recentBooksStorageKey, type RecentBook } from '../../domain/recentBooks';
import { colors } from '../../theme';
import { forgetRecentBooks } from '../recentBooks';

jest.mock('../../api/endpoints', () => ({
    feedItem: jest.fn(), feedList: jest.fn(), feedUserBook: jest.fn(), likeReview: jest.fn(), searchBookReviews: jest.fn(), unlikeReview: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
// 검색창 돋보기(@expo/vector-icons)가 글꼴을 불러오지 않게 한다.
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn() }));
jest.mock('../../auth/AuthProvider', () => ({ useSignedInUserId: jest.fn() }));
// 기기 저장소는 루트 __mocks__/expo-sqlite/kv-store.ts(메모리 Map)를 쓴다.
jest.mock('expo-sqlite/kv-store');

// 루트 __mocks__의 메모리 기기 저장소(expo-sqlite/kv-store).
const kv = jest.requireMock<{ __reset: () => void; __store: Map<string, string>; default: { getItemAsync: jest.Mock } }>('expo-sqlite/kv-store');

const review: FeedItem = {
    id: 'review-1', userBookId: 'user-book-1', nickname: '독자', bookTitle: '데미안', bookAuthor: '헤르만 헤세', genre: '소설',
    oneLine: '나를 돌아보는 책', body: null, likeCount: 0, likedByMe: false, mine: false,
};
const coverUrl = 'https://image.example.com/demian.jpg';
// 서버는 책 묶음 6개를 준다. 첫 책은 두 사람(박스 2개)이 감상을 남겼고 표지가 있다.
const groups: BookReviewSearchResponse = Array.from({ length: 6 }, (_, i) => ({
    bookKey: `text:book-${i + 1}`, bookTitle: `데미안 ${i + 1}`, bookAuthor: '헤르만 헤세',
    reviews: i === 0
        ? [{ ...review, id: 'review-a', coverUrl }, { ...review, id: 'review-b' }, { ...review, id: 'review-c', userBookId: 'user-book-2' }]
        : [{ ...review, id: `review-${i + 1}`, userBookId: `user-book-${i + 10}` }],
}));
const suggestionName = (i: number, readers = 1) => `데미안 ${i}, 헤르만 헤세, ${readers}명의 감상`;
const recent = (i: number, query = '데미안'): RecentBook => ({
    query, bookKey: `text:book-${i}`, bookTitle: `데미안 ${i}`, bookAuthor: '헤르만 헤세', cover: { uri: null, genre: '소설' },
});
const seedRecent = (userId: string, books: RecentBook[]) => kv.__store.set(recentBooksStorageKey(userId), JSON.stringify(books));
const storedRecent = (userId: string) => {
    const raw = kv.__store.get(recentBooksStorageKey(userId));
    return raw === undefined ? undefined : (JSON.parse(raw) as RecentBook[]).map(book => book.bookKey);
};
const s71 = (bookKey: string, title: string, query = '데미안') =>
    `/lounge/search?query=${encodeURIComponent(query)}&bookKey=${encodeURIComponent(bookKey)}&title=${encodeURIComponent(title)}`;
const styleOf = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) ?? {};

let client: QueryClient;
let announce: jest.SpyInstance;
const routes = {
    _layout: () => <QueryClientProvider client={client}><Stack /></QueryClientProvider>,
    '(tabs)/lounge': Lounge,
    'lounge/search': Search,
};
// 스택에서는 라운지 화면이 남아 있으므로 마지막 검색창이 맨 위 화면의 것이다.
const searchInput = () => screen.getAllByLabelText('책 이름').at(-1)!;
const typeInto = async (text: string) => {
    await fireEvent(searchInput(), 'focus');
    await fireEvent.changeText(searchInput(), text);
};

beforeEach(() => {
    jest.resetAllMocks();
    kv.__reset();
    forgetRecentBooks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    onlineManager.setOnline(true);
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as NetInfoState);
    jest.mocked(feedList).mockResolvedValue([]);
    jest.mocked(searchBookReviews).mockResolvedValue(groups);
    jest.mocked(useSignedInUserId).mockReturnValue('user-a');
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => { client.clear(); onlineManager.setOnline(true); announce.mockRestore(); });

describe('#124 FR-16 S-70 S-71 책 이름 자동완성', () => {
    test('글자를 멈추고 0.3초 뒤 한 번만 검색해 검색창 바로 아래에 최대 5권(표지·제목·저자·N명의 감상)을 보여 줘요', async () => {
        let calledAt = 0;
        jest.mocked(searchBookReviews).mockImplementation(async () => { calledAt = Date.now(); return groups; });
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        const typedAt = Date.now();
        await typeInto('데');
        await typeInto('데미');
        await typeInto(' 데미안 ');
        expect(searchBookReviews).not.toHaveBeenCalled();
        const list = await screen.findByTestId('book-suggestions');
        expect(searchBookReviews).toHaveBeenCalledTimes(1);
        expect(searchBookReviews).toHaveBeenCalledWith('데미안', expect.any(AbortSignal));
        expect(calledAt - typedAt).toBeGreaterThanOrEqual(250);
        expect(list).toHaveProp('accessibilityRole', 'list');
        expect(list).toHaveProp('accessibilityLabel', '책 이름 자동완성');
        const items = within(list).getAllByRole('button');
        expect(items.map(item => item.props.accessibilityLabel))
            .toEqual([suggestionName(1, 2), suggestionName(2), suggestionName(3), suggestionName(4), suggestionName(5)]);
        expect(items[0]).toHaveProp('accessibilityHint', '이 책의 감상만 봐요');
        expect(within(items[0]).getByTestId('book-cover-image')).toHaveProp('source', { uri: coverUrl });
        expect(within(items[1]).getByTestId('book-cover-default')).toHaveTextContent('소설');
        expect(within(items[0]).getByText('2명의 감상')).toBeOnTheScreen();
        expect(announce).toHaveBeenCalledWith('책 5권을 찾았어요');
        // 목록은 검색창과 같은 칸에서 검색창 바로 다음에 있다.
        const box = list.parent!;
        expect(within(box).getByLabelText('책 이름')).toBeOnTheScreen();
    });

    test('계속 치면 진행 중인 이전 요청을 취소하고 마지막 검색어의 결과만 보여 줘요', async () => {
        let firstSignal: AbortSignal | undefined;
        jest.mocked(searchBookReviews).mockImplementation((query, signal) => {
            if (query === '데미') { firstSignal = signal; return new Promise(() => {}); }
            return Promise.resolve([groups[1]]);
        });
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('데미');
        await waitFor(() => expect(searchBookReviews).toHaveBeenCalledWith('데미', expect.any(AbortSignal)));
        await typeInto('데미안');
        expect(await screen.findByRole('button', { name: suggestionName(2) })).toBeOnTheScreen();
        expect(firstSignal?.aborted).toBe(true);
        expect(within(screen.getByTestId('book-suggestions')).getAllByRole('button')).toHaveLength(1);
    });

    test('이전 검색어의 요청이 늦게 끝나도 마지막 검색어의 목록을 바꾸지 않아요', async () => {
        let finishFirst!: (value: BookReviewSearchResponse) => void;
        jest.mocked(searchBookReviews).mockImplementation(query => query === '데미'
            ? new Promise(done => { finishFirst = done; })
            : Promise.resolve([groups[1]]));
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('데미');
        await waitFor(() => expect(searchBookReviews).toHaveBeenCalledWith('데미', expect.any(AbortSignal)));
        await typeInto('데미안');
        expect(await screen.findByRole('button', { name: suggestionName(2) })).toBeOnTheScreen();
        await act(async () => { finishFirst(groups); });
        expect(within(screen.getByTestId('book-suggestions')).getAllByRole('button').map(item => item.props.accessibilityLabel))
            .toEqual([suggestionName(2)]);
        expect(client.getQueryData(['lounge', 'book-suggestions', '데미안'])).toMatchObject({ term: '데미안', groups: [groups[1]] });
    });

    test('검색창을 모두 지우거나 검색창 밖을 눌러 포커스가 빠지면 목록을 닫아요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('데미안');
        await screen.findByTestId('book-suggestions');
        await fireEvent.changeText(searchInput(), '   ');
        expect(screen.queryByTestId('book-suggestions')).toBeNull();
        await fireEvent.changeText(searchInput(), '데미안');
        await screen.findByTestId('book-suggestions');
        await fireEvent(searchInput(), 'blur');
        expect(screen.queryByTestId('book-suggestions')).toBeNull();
    });

    test('S-70에서 책을 고르면 S-71에서 그 책 묶음만 보여 주고 S-71 검색창을 그 책의 제목으로 채워요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('데미');
        await fireEvent.press(await screen.findByRole('button', { name: suggestionName(3) }));
        expect(await screen.findByRole('header', { name: '데미안 3' })).toBeOnTheScreen();
        expect(screen.getAllByTestId('book-group')).toHaveLength(1);
        expect(screen.queryByRole('header', { name: '데미안 1' })).toBeNull();
        expect(searchInput()).toHaveProp('value', '데미안 3');
        expect(screen).toHavePathname('/lounge/search');
    });
});

describe('#124 FR-16 자동완성 결과 안내', () => {
    test.each([
        ['결과가 0권', () => jest.mocked(searchBookReviews).mockResolvedValue([]), '아직 감상이 있는 책이 없어요'],
        ['오류', () => jest.mocked(searchBookReviews).mockRejectedValue(new ApiError('http', 'FAIL', '서버 오류예요.', 500)), '책을 불러오지 못했어요'],
        ['오프라인', () => jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as NetInfoState), '인터넷에 연결되면 찾을 수 있어요'],
    ])('S-70 %s이면 목록 자리에 안내를 보여 주고 스크린리더도 읽어 줘요', async (_case, arrange, message) => {
        arrange();
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('데미안');
        expect(await screen.findByTestId('book-suggestion-message')).toHaveTextContent(message);
        expect(screen.queryByTestId('book-suggestions')).toBeNull();
        expect(announce).toHaveBeenCalledWith(message);
        if (message === '인터넷에 연결되면 찾을 수 있어요') expect(searchBookReviews).not.toHaveBeenCalled();
    });

    test('S-71 위쪽 검색창도 결과가 없으면 안내해요', async () => {
        await renderRouter(routes, { initialUrl: s71('text:book-1', '데미안 1') });
        await screen.findByRole('header', { name: '데미안 1' });
        jest.mocked(searchBookReviews).mockResolvedValue([]);
        await typeInto('없는 책');
        expect(await screen.findByTestId('book-suggestion-message')).toHaveTextContent('아직 감상이 있는 책이 없어요');
    });
});

describe('#124 FR-16 검색 버튼 없이 목록에서만 고르기', () => {
    test.each([['S-70', '/lounge'], ['S-71', s71('text:book-1', '데미안 1')]])(
        '%s에는 검색 버튼이 없고, 키보드 검색 키는 검색하지 않고 "목록에서 책을 골라 주세요"를 보여 줘요', async (_screen, initialUrl) => {
            await renderRouter(routes, { initialUrl });
            await screen.findAllByLabelText('책 이름');
            expect(screen.queryByRole('button', { name: '책 감상 검색' })).toBeNull();
            await typeInto('데미안');
            // 검색 키를 눌러도 키보드를 닫지 않는다.
            expect(searchInput()).toHaveProp('submitBehavior', 'submit');
            await fireEvent(searchInput(), 'submitEditing');
            expect(screen.getByTestId('book-search-hint')).toHaveTextContent('목록에서 책을 골라 주세요');
            expect(announce).toHaveBeenCalledWith('목록에서 책을 골라 주세요');
            expect(screen).toHavePathname(initialUrl.split('?')[0]);
            await fireEvent.changeText(searchInput(), '데미안 2');
            expect(screen.queryByTestId('book-search-hint')).toBeNull();
        },
    );
});

describe('#124 검색창 돋보기', () => {
    const iconSize = (scale: number) => Math.round(24 * 0.85 * scale);
    // React Native의 Jest 환경은 기본 fontScale이 1이 아닐 수 있으므로 지금 값을 기준으로 본다.
    const baseScale = () => Dimensions.get('window').fontScale;

    test.each([['S-70', '/lounge'], ['S-71', s71('text:book-1', '데미안 1')]])(
        '%s 검색창 왼쪽 안쪽에 안내 문구 색의 돋보기를 두고, 스크린리더는 건너뛰며 글자는 아이콘 오른쪽에서 시작해요', async (_screen, initialUrl) => {
            await renderRouter(routes, { initialUrl });
            await screen.findAllByLabelText('책 이름');
            // 스크린리더가 읽지 않으므로 보조 기술에 보이는 요소만 찾으면 나오지 않는다.
            expect(screen.queryAllByTestId('book-search-icon')).toHaveLength(0);
            const icon = screen.getAllByTestId('book-search-icon', { includeHiddenElements: true }).at(-1)!;
            expect(icon.props).toMatchObject({ pointerEvents: 'none', accessible: false, importantForAccessibility: 'no-hide-descendants' });
            expect(styleOf(icon)).toMatchObject({ position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center' });
            const glyph = within(icon).getByText(/./, { includeHiddenElements: true });
            // 색은 입력칸 안내 문구(placeholder)와 같다.
            expect(styleOf(glyph)).toMatchObject({ fontSize: iconSize(baseScale()), color: colors.text.muted });
            expect(searchInput()).toHaveProp('placeholderTextColor', colors.text.muted);
            expect(styleOf(searchInput())).toMatchObject({ paddingLeft: 12 + iconSize(baseScale()) + 8 });
        },
    );

    test('큰 글씨 설정이면 아이콘과 입력칸 왼쪽 여백이 같이 커져요', async () => {
        const window = Dimensions.get('window');
        const large = window.fontScale * 1.5;
        try {
            await renderRouter(routes, { initialUrl: '/lounge' });
            await screen.findByLabelText('책 이름');
            await act(async () => { Dimensions.set({ window: { ...window, fontScale: large } }); });
            const glyph = () => within(screen.getByTestId('book-search-icon', { includeHiddenElements: true })).getByText(/./, { includeHiddenElements: true });
            await waitFor(() => expect(styleOf(glyph())).toMatchObject({ fontSize: iconSize(large) }));
            expect(iconSize(large)).toBeGreaterThan(iconSize(window.fontScale));
            expect(styleOf(searchInput())).toMatchObject({ paddingLeft: 12 + iconSize(large) + 8 });
        } finally {
            await act(async () => { Dimensions.set({ window }); });
        }
    });
});

describe('#124 최근 고른 책', () => {
    const selectFromLounge = async (query: string, name: string) => {
        await typeInto(query);
        await fireEvent.press(await screen.findByRole('button', { name }));
        await screen.findByTestId('book-group');
        await act(async () => router.back());
        await screen.findByText('최근 공개 감상');
    };

    test('자동완성에서 고른 책을 계정별 키로 기기에 최근 순 최대 5권 저장하고, 같은 책을 다시 고르면 맨 위로 올려요', async () => {
        seedRecent('user-a', [recent(4), recent(5), recent(6), recent(2)]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await selectFromLounge('데미', suggestionName(1, 2));
        expect(storedRecent('user-a')).toEqual(['text:book-1', 'text:book-4', 'text:book-5', 'text:book-6', 'text:book-2']);
        await selectFromLounge('데미', suggestionName(3));
        // 6권째를 고르면 가장 오래된 책이 빠진다.
        expect(storedRecent('user-a')).toEqual(['text:book-3', 'text:book-1', 'text:book-4', 'text:book-5', 'text:book-6']);
        await selectFromLounge('데미', suggestionName(5));
        expect(storedRecent('user-a')).toEqual(['text:book-5', 'text:book-3', 'text:book-1', 'text:book-4', 'text:book-6']);
        // 다른 계정의 키에는 쓰지 않는다.
        expect(storedRecent('user-b')).toBeUndefined();
    });

    test.each([['S-70', '/lounge'], ['S-71', s71('text:book-1', '데미안 1')]])(
        '%s 검색창이 비어 있을 때 누르면 최근 고른 책(표지·제목·저자)을 보여 주고, 누르면 자동완성과 같이 그 책만 S-71에서 보여 줘요', async (_screen, initialUrl) => {
            seedRecent('user-a', [recent(3, '데미안 삼'), recent(2)]);
            await renderRouter(routes, { initialUrl });
            await screen.findAllByLabelText('책 이름');
            await typeInto('');
            const list = await screen.findByTestId('recent-books');
            expect(list).toHaveProp('accessibilityRole', 'list');
            expect(list).toHaveProp('accessibilityLabel', '최근 고른 책');
            expect(within(list).getByRole('header', { name: '최근 고른 책' })).toBeOnTheScreen();
            const books = within(list).getAllByTestId('recent-book');
            expect(books.map(book => book.props.accessibilityLabel)).toEqual(['데미안 3, 헤르만 헤세', '데미안 2, 헤르만 헤세']);
            expect(within(books[0]).getByTestId('book-cover-default')).toHaveTextContent('소설');
            // 검색어를 치면 최근 고른 책 대신 자동완성이다.
            expect(searchBookReviews).not.toHaveBeenCalledWith('', expect.anything());
            await fireEvent.press(books[0]);
            expect(await screen.findByRole('header', { name: '데미안 3' })).toBeOnTheScreen();
            expect(searchBookReviews).toHaveBeenCalledWith('데미안 삼', expect.any(AbortSignal));
            expect(searchInput()).toHaveProp('value', '데미안 3');
            await waitFor(() => expect(storedRecent('user-a')).toEqual(['text:book-3', 'text:book-2']));
        },
    );

    test('책마다 지우기와 전체 지우기로 기기에서 지우고 스크린리더에 알려요', async () => {
        seedRecent('user-a', [recent(1), recent(2)]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('');
        await screen.findByTestId('recent-books');
        const remove = screen.getByRole('button', { name: '데미안 1 지우기' });
        expect(styleOf(remove)).toMatchObject({ minWidth: 44, minHeight: 44 });
        await fireEvent.press(remove);
        await waitFor(() => expect(storedRecent('user-a')).toEqual(['text:book-2']));
        expect(screen.getAllByTestId('recent-book').map(book => book.props.accessibilityLabel)).toEqual(['데미안 2, 헤르만 헤세']);
        expect(announce).toHaveBeenCalledWith('데미안 1, 최근 고른 책에서 지웠어요');
        await fireEvent.press(screen.getByRole('button', { name: '최근 고른 책 전체 지우기' }));
        await waitFor(() => expect(storedRecent('user-a')).toBeUndefined());
        expect(screen.queryByTestId('recent-books')).toBeNull();
        expect(announce).toHaveBeenCalledWith('최근 고른 책을 모두 지웠어요');
    });

    test('다른 계정으로 로그인하면 그 계정의 목록만 보여요', async () => {
        seedRecent('user-a', [recent(1)]);
        seedRecent('user-b', [recent(2)]);
        jest.mocked(useSignedInUserId).mockReturnValue('user-b');
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('');
        const list = await screen.findByTestId('recent-books');
        expect(within(list).getAllByTestId('recent-book').map(book => book.props.accessibilityLabel)).toEqual(['데미안 2, 헤르만 헤세']);
        expect(screen.queryByRole('button', { name: '데미안 1, 헤르만 헤세' })).toBeNull();
    });

    test('로그인하지 않았으면 최근 고른 책을 보여 주지도 저장하지도 않아요', async () => {
        seedRecent('user-a', [recent(1)]);
        jest.mocked(useSignedInUserId).mockReturnValue(undefined);
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('');
        expect(screen.queryByTestId('recent-books')).toBeNull();
        await selectFromLounge('데미', suggestionName(2));
        expect(storedRecent('user-a')).toEqual(['text:book-1']);
    });

    test('고른 책에 이제 공개 감상이 없으면 S-71에서 "아직 공개된 감상이 없어요"를 보여 줘요', async () => {
        seedRecent('user-a', [recent(1)]);
        jest.mocked(searchBookReviews).mockResolvedValue(groups.slice(1));
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('');
        await fireEvent.press(await screen.findByRole('button', { name: '데미안 1, 헤르만 헤세' }));
        expect(await screen.findByText('아직 공개된 감상이 없어요')).toBeOnTheScreen();
    });
});

describe('#124 검색어 지우기(X) 버튼', () => {
    test.each([['S-70', '/lounge'], ['S-71', s71('text:book-1', '데미안 1')]])(
        '%s 글자가 있을 때만 보이고, 누르면 글자를 모두 지우고 자동완성을 닫으며 포커스를 둔 채 최근 고른 책을 열어요', async (_screen, initialUrl) => {
            seedRecent('user-a', [recent(2)]);
            await renderRouter(routes, { initialUrl });
            await screen.findAllByLabelText('책 이름');
            await typeInto('');
            expect(screen.queryByTestId('book-search-clear')).toBeNull();
            await fireEvent.changeText(searchInput(), '데미');
            await screen.findByTestId('book-suggestions');
            const clear = screen.getByRole('button', { name: '검색어 지우기' });
            expect(clear).toHaveProp('testID', 'book-search-clear');
            expect(styleOf(clear).width).toBeGreaterThanOrEqual(44);
            expect(styleOf(clear)).toMatchObject({ minHeight: 44 });
            await fireEvent.press(clear);
            expect(searchInput()).toHaveProp('value', '');
            expect(screen.queryByTestId('book-suggestions')).toBeNull();
            expect(screen.queryByTestId('book-search-clear')).toBeNull();
            // 포커스가 남아 있으므로 빈 검색창의 최근 고른 책이 열린다.
            const list = await screen.findByTestId('recent-books');
            expect(within(list).getByRole('button', { name: '데미안 2, 헤르만 헤세' })).toBeOnTheScreen();
        },
    );
});

describe('#124 검색창 밖을 누르거나 화면을 옮기면 검색창 닫기', () => {
    test('S-70 독서왕 랭킹·감상 박스를 누르기 시작하면 자동완성과 안내를 닫아요', async () => {
        jest.mocked(feedList).mockResolvedValue([review]);
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('데미안');
        await screen.findByTestId('book-suggestions');
        await fireEvent(searchInput(), 'submitEditing');
        expect(screen.getByTestId('book-search-hint')).toBeOnTheScreen();
        await fireEvent(screen.getByRole('button', { name: '독서왕 랭킹' }), 'touchStart');
        expect(screen.queryByTestId('book-suggestions')).toBeNull();
        expect(screen.queryByTestId('book-search-hint')).toBeNull();
        // 다시 검색창을 누르면 열리고, 감상 박스를 누르기 시작하면 또 닫힌다.
        await typeInto('데미안');
        await screen.findByTestId('book-suggestions');
        await fireEvent(await screen.findByText('나를 돌아보는 책'), 'touchStart');
        expect(screen.queryByTestId('book-suggestions')).toBeNull();
    });

    test('S-71 정렬 버튼·라운지로 돌아가기를 누르기 시작하면 자동완성을 닫아요', async () => {
        await renderRouter(routes, { initialUrl: s71('text:book-1', '데미안 1') });
        await screen.findByRole('header', { name: '데미안 1' });
        await typeInto('데미');
        await screen.findByTestId('book-suggestions');
        await fireEvent(screen.getByRole('radio', { name: '좋아요 많은 순' }), 'touchStart');
        expect(screen.queryByTestId('book-suggestions')).toBeNull();
        await typeInto('데미안');
        await screen.findByTestId('book-suggestions');
        await fireEvent(screen.getByRole('button', { name: '라운지로 돌아가기' }), 'touchStart');
        expect(screen.queryByTestId('book-suggestions')).toBeNull();
    });

    test('검색창은 닫기 영역 밖에 있고, 닫기 영역은 Screen 내용 간격을 그대로 써서 배치가 바뀌지 않아요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        const area = screen.getByTestId('search-dismiss-area');
        expect(within(area).queryByLabelText('책 이름')).toBeNull();
        expect(styleOf(area)).toEqual({ gap: 16 });
    });

    test('S-70에서 목록을 연 채 다른 화면으로 갔다가 돌아오면 목록이 닫혀 있어요', async () => {
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('데미');
        await screen.findByTestId('book-suggestions');
        await act(async () => router.push(s71('text:book-1', '데미안 1')));
        await screen.findByRole('header', { name: '데미안 1' });
        await act(async () => router.back());
        await screen.findByText('최근 공개 감상');
        // 라운지 탭은 화면과 입력한 글자가 남아 있지만 목록은 닫혀 있다.
        expect(searchInput()).toHaveProp('value', '데미');
        expect(screen.queryByTestId('book-suggestions')).toBeNull();
    });
});

describe('#124 최근 고른 책 읽기 실패', () => {
    const selectFromLounge = async (query: string, name: string) => {
        await typeInto(query);
        await fireEvent.press(await screen.findByRole('button', { name }));
        await screen.findByTestId('book-group');
        await act(async () => router.back());
        await screen.findByText('최근 공개 감상');
    };

    test('읽지 못하면 빈 목록을 기억하지 않고, 실패가 이어지는 동안 책을 골라도 기기의 목록을 덮어쓰지 않아요', async () => {
        seedRecent('user-a', [recent(1), recent(2)]);
        kv.default.getItemAsync.mockRejectedValue(new Error('읽기 실패'));
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('');
        await waitFor(() => expect(kv.default.getItemAsync).toHaveBeenCalled());
        expect(screen.queryByTestId('recent-books')).toBeNull();
        await selectFromLounge('데미', suggestionName(3));
        expect(storedRecent('user-a')).toEqual(['text:book-1', 'text:book-2']);
        // 저장소를 다시 읽을 수 있게 되면 검색창을 다시 누를 때 기존 목록이 보이고, 그 뒤 고른 책은 맨 위에 더해진다.
        kv.default.getItemAsync.mockImplementation(async (key: string) => kv.__store.get(key) ?? null);
        await fireEvent.changeText(searchInput(), '');
        await fireEvent(searchInput(), 'blur');
        await typeInto('');
        const list = await screen.findByTestId('recent-books');
        expect(within(list).getAllByTestId('recent-book').map(book => book.props.accessibilityLabel))
            .toEqual(['데미안 1, 헤르만 헤세', '데미안 2, 헤르만 헤세']);
        await selectFromLounge('데미', suggestionName(3));
        await waitFor(() => expect(storedRecent('user-a')).toEqual(['text:book-3', 'text:book-1', 'text:book-2']));
    });

    test('한 번 읽지 못한 직후 책을 고르면 다시 읽어 기존 목록 위에 더해요', async () => {
        seedRecent('user-a', [recent(1), recent(2)]);
        kv.default.getItemAsync.mockRejectedValueOnce(new Error('읽기 실패'));
        await renderRouter(routes, { initialUrl: '/lounge' });
        await screen.findByLabelText('책 이름');
        await typeInto('');
        await waitFor(() => expect(kv.default.getItemAsync).toHaveBeenCalledTimes(1));
        expect(screen.queryByTestId('recent-books')).toBeNull();
        await selectFromLounge('데미', suggestionName(3));
        await waitFor(() => expect(storedRecent('user-a')).toEqual(['text:book-3', 'text:book-1', 'text:book-2']));
    });
});
