import { router, Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { StyleSheet, Text } from 'react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import Ranking from '../../../app/ranking';
import Consent from '../../../app/ranking/consent';
import Withdraw from '../../../app/ranking/withdraw';
import Lounge from '../../../app/(tabs)/lounge';
import { feedList, patchMe, weeklyRanking } from '../../api/endpoints';
import { ApiError } from '../../api/errors';
import type { MeResponse, RankingEntry, WeeklyRankingResponse } from '../../api/types';
import { colors } from '../../theme';
import { rankingKeys } from '../queries';

jest.mock('../../api/endpoints', () => ({ weeklyRanking: jest.fn(), patchMe: jest.fn(), feedList: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
// #124 검색창 돋보기(@expo/vector-icons)가 글꼴을 불러오지 않게 한다.
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn() }));

const user: MeResponse = { id: 'reader', username: 'reader_01', nickname: '책산책', rankingOptIn: false };
const entry = (rank: number, me = false): RankingEntry => ({ rank, userId: `reader-${rank}`, nickname: me ? user.nickname : `독서가 ${rank}`, seconds: 18000 - rank * 60, me });
const data: WeeklyRankingResponse = { weekStart: '2026-11-02', participating: true,
    top: Array.from({ length: 30 }, (_, i) => entry(i + 1)),
    around: Array.from({ length: 30 }, (_, i) => entry(i + 31, i === 14)) };
const offlineMessage = '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.';
let client: QueryClient;
const routes = {
    _layout: () => <QueryClientProvider client={client}><Slot /></QueryClientProvider>,
    'ranking/index': Ranking, 'ranking/consent': Consent, 'ranking/withdraw': Withdraw, '(tabs)/lounge': Lounge,
    // AOS#126: 참여·중단 확인 화면은 설정(S-81)으로 돌아간다.
    'settings/index': () => <Text accessibilityRole="header">설정 화면</Text>,
};

beforeEach(() => {
    jest.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    onlineManager.setOnline(true);
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as NetInfoState);
    jest.mocked(weeklyRanking).mockResolvedValue(data);
    jest.mocked(feedList).mockResolvedValue([]);
    jest.mocked(patchMe).mockImplementation(async body => ({ ...user, ...body }));
});
afterEach(() => { client.clear(); onlineManager.setOnline(true); });

// 줄은 바깥 테두리(outline) 안에 카드(card)와 순위 칸(rank)이 있다.
const outline = (label: string) => StyleSheet.flatten(screen.getByLabelText(label).props.style);
const card = (label: string) => StyleSheet.flatten(within(screen.getByLabelText(label)).getByTestId('ranking-card').props.style);
const halo = (label: string) => StyleSheet.flatten(within(screen.getByLabelText(label)).getByTestId('ranking-halo').props.style);
// 내 줄: 바깥 얇은 진한 선 + 안쪽 두꺼운 하얀 테두리. 두께는 다른 줄과 같다.
const expectMine = (label: string) => {
    expect(outline(label)).toMatchObject({ borderColor: colors.text.muted });
    expect(halo(label)).toMatchObject({ borderColor: colors.surface.card });
    expect(halo(label).borderWidth).toBeGreaterThan(outline(label).borderWidth as number);
};
const rankCell = (label: string) => StyleSheet.flatten(within(screen.getByLabelText(label)).getByTestId('ranking-rank').props.style);
const settingsHeader = () => screen.findByRole('header', { name: '설정 화면' });
async function openFromSettings(route: 'consent' | 'withdraw') {
    await renderRouter(routes, { initialUrl: '/settings' });
    await act(async () => router.push(`/ranking/${route}`));
}

test('FR-15 S-70 S-73 AOS#126 라운지에서 열면 Top 30 탭과 위에 고정된 내 순위를 보여 줘요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge' });
    await fireEvent.press(screen.getByRole('button', { name: '독서왕 랭킹' }));
    expect(await screen.findByRole('tab', { name: 'Top 30', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: '내 주변', selected: false })).toBeOnTheScreen();
    // 두 책갈피는 하나의 탭 목록(tablist) 안에 있다.
    expect(screen.getByTestId('ranking-tabs')).toHaveProp('accessibilityRole', 'tablist');
    expect(await screen.findByLabelText('내 순위, 45위, 책산책, 4시간 15분, 나')).toBeOnTheScreen();
    // 제목 줄은 화면에 보이지만 스크린리더에서는 건너뛴다(각 줄이 순위·닉네임·시간을 함께 읽는다).
    expect(screen.getByText('순위', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('닉네임', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('독서 시간', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('1위, 독서가 1, 4시간 59분')).toBeOnTheScreen();
    expect(screen.getByLabelText('30위, 독서가 30, 4시간 30분')).toBeOnTheScreen();
    expect(screen.queryByLabelText('31위, 독서가 31, 4시간 29분')).toBeNull();
    expect(screen.getByText('2026-11-02 시작 주 · 한국 시간')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '라운지로' })).toBeOnTheScreen();
    // 참여·중단은 설정(S-81)으로 옮겼다.
    expect(screen.queryByRole('button', { name: '참여 중단' })).toBeNull();
    expect(screen.queryByRole('button', { name: '랭킹 참여 안내' })).toBeNull();
    expect(screen.queryByText('랭킹에 참여 중이에요.')).toBeNull();
});

test('FR-15 S-73 AOS#126 순위는 숫자만 보이고 스크린리더는 "위"를 붙여 읽어요', async () => {
    await renderRouter(routes, { initialUrl: '/ranking' });
    const first = await screen.findByLabelText('1위, 독서가 1, 4시간 59분');
    expect(within(first).getByText('1')).toBeOnTheScreen();
    expect(within(first).queryByText('1위')).toBeNull();
    expect(within(screen.getByLabelText('내 순위, 45위, 책산책, 4시간 15분, 나')).getByText('45')).toBeOnTheScreen();
});

test('FR-15 S-73 AOS#126 Top 30 탭의 1~3위는 노랑·하늘색·주황 카드이고 4위부터는 일반 카드예요', async () => {
    await renderRouter(routes, { initialUrl: '/ranking' });
    await screen.findByLabelText('1위, 독서가 1, 4시간 59분');
    expect(card('1위, 독서가 1, 4시간 59분')).toMatchObject({ backgroundColor: colors.rank.gold, borderBottomColor: colors.rank.goldStrong });
    expect(card('2위, 독서가 2, 4시간 58분')).toMatchObject({ backgroundColor: colors.rank.sky });
    expect(card('3위, 독서가 3, 4시간 57분')).toMatchObject({ backgroundColor: colors.rank.orange });
    expect(rankCell('1위, 독서가 1, 4시간 59분')).toMatchObject({ backgroundColor: colors.rank.goldStrong });
    const fourth = card('4위, 독서가 4, 4시간 56분');
    expect(fourth).toMatchObject({ backgroundColor: colors.surface.card });
    expect(rankCell('4위, 독서가 4, 4시간 56분')).toMatchObject({ backgroundColor: colors.brand.sand });
    // 모든 카드는 높이와 테두리가 같고, 아래쪽 테두리가 더 두껍다.
    const first = card('1위, 독서가 1, 4시간 59분');
    expect([first.minHeight, first.borderWidth, first.borderBottomWidth]).toEqual([fourth.minHeight, fourth.borderWidth, fourth.borderBottomWidth]);
    expect(fourth.borderBottomWidth).toBeGreaterThan(fourth.borderWidth as number);
    expect(outline('1위, 독서가 1, 4시간 59분').borderWidth).toBe(outline('내 순위, 45위, 책산책, 4시간 15분, 나').borderWidth);
    expect(halo('1위, 독서가 1, 4시간 59분').borderWidth).toBe(halo('내 순위, 45위, 책산책, 4시간 15분, 나').borderWidth);
});

test('FR-15 S-73 AOS#126 31위 이하이면 내 주변 탭에 서버가 준 30명을 보여 주고 내 줄은 밝은 바깥 테두리예요', async () => {
    await renderRouter(routes, { initialUrl: '/ranking' });
    await screen.findByLabelText('내 순위, 45위, 책산책, 4시간 15분, 나');
    expectMine('내 순위, 45위, 책산책, 4시간 15분, 나');
    expect(screen.queryByText(/· 나/)).toBeNull();
    await fireEvent.press(await screen.findByRole('tab', { name: '내 주변' }));
    expect(screen.getByRole('tab', { name: '내 주변', selected: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('31위, 독서가 31, 4시간 29분')).toBeOnTheScreen();
    expect(screen.getByLabelText('60위, 독서가 60, 4시간 0분')).toBeOnTheScreen();
    expect(screen.queryByLabelText('1위, 독서가 1, 4시간 59분')).toBeNull();
    expectMine('45위, 책산책, 4시간 15분, 나');
    expect(outline('44위, 독서가 44, 4시간 16분').borderColor).toBe('transparent');
    expect(halo('44위, 독서가 44, 4시간 16분').borderColor).toBe('transparent');
});

test('FR-15 S-73 AOS#126 내가 2위이면 하늘색을 유지한 채 바깥 테두리를 더하고 내 주변 탭은 색 없는 Top 30이에요', async () => {
    jest.mocked(weeklyRanking).mockResolvedValue({ ...data, top: Array.from({ length: 30 }, (_, i) => entry(i + 1, i === 1)), around: [] });
    await renderRouter(routes, { initialUrl: '/ranking' });
    expect(await screen.findByLabelText('내 순위, 2위, 책산책, 4시간 58분, 나')).toBeOnTheScreen();
    expect(card('2위, 책산책, 4시간 58분, 나')).toMatchObject({ backgroundColor: colors.rank.sky });
    expectMine('2위, 책산책, 4시간 58분, 나');
    await fireEvent.press(screen.getByRole('tab', { name: '내 주변' }));
    expect(card('1위, 독서가 1, 4시간 59분')).toMatchObject({ backgroundColor: colors.surface.card });
    expect(card('2위, 책산책, 4시간 58분, 나')).toMatchObject({ backgroundColor: colors.surface.card });
    expectMine('2위, 책산책, 4시간 58분, 나');
    expect(screen.getByLabelText('30위, 독서가 30, 4시간 30분')).toBeOnTheScreen();
});

test('FR-15 S-73 AOS#126 참여하지 않았으면 내 순위 자리 안내를 눌러 설정으로 가고 내 주변 탭은 참여 안내예요', async () => {
    jest.mocked(weeklyRanking).mockResolvedValue({ ...data, participating: false, around: [] });
    await renderRouter(routes, { initialUrl: '/ranking' });
    await fireEvent.press(await screen.findByRole('tab', { name: '내 주변' }));
    expect(screen.getByText('마이 > 설정에서 랭킹에 참여하면 내 주변 순위를 볼 수 있어요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '아직 랭킹에 참여하지 않았어요. 눌러서 설정에서 참여할 수 있어요.' }));
    expect(await settingsHeader()).toBeOnTheScreen();
    expect(screen).toHavePathname('/settings');
});

test('FR-15 S-73 순위가 비었을 때 빈 안내와 기록 없음 안내를 보여 줘요', async () => {
    jest.mocked(weeklyRanking).mockResolvedValue({ ...data, top: [], around: [] });
    await renderRouter(routes, { initialUrl: '/ranking' });
    expect(await screen.findByText('이번 주 순위에 오른 독자가 아직 없어요.')).toBeOnTheScreen();
    expect(screen.getByText('이번 주 집계된 타이머 독서 시간이 생기면 내 순위를 볼 수 있어요.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /설정에서 참여/ })).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: '내 주변' }));
    expect(screen.getByText('이번 주 집계된 타이머 독서 시간이 생기면 내 주변 순위를 볼 수 있어요.')).toBeOnTheScreen();
});

test('FR-15 S-74 AOS#126 설정에서 연 동의 화면은 동의 후 설정으로 돌아가고 순위 캐시를 비워요', async () => {
    client.setQueryData(rankingKeys.weekly, { ...data, participating: false, around: [] });
    await openFromSettings('consent');
    expect(screen.getByText(/참여하시면 닉네임·순위·독서 시간이/)).toBeOnTheScreen();
    expect(patchMe).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '동의하고 참여하기' }));
    expect(await settingsHeader()).toBeOnTheScreen();
    expect(patchMe).toHaveBeenCalledWith({ rankingOptIn: true });
    expect(client.getQueryData(rankingKeys.weekly)).toBeUndefined();
});

test('FR-15 S-75 AOS#126 설정에서 연 중단 확인은 중단 후 설정으로 돌아가요', async () => {
    await openFromSettings('withdraw');
    expect(screen.getByRole('header', { name: '랭킹 참여를 중단할까요?' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '참여 중단하기' }));
    expect(await settingsHeader()).toBeOnTheScreen();
    expect(patchMe).toHaveBeenCalledWith({ rankingOptIn: false });
});

test.each(['consent', 'withdraw'] as const)('FR-15 S-74 S-75 %s에서 설정으로 돌아가면 참여를 변경하지 않아요', async route => {
    await openFromSettings(route);
    await fireEvent.press(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    expect(await settingsHeader()).toBeOnTheScreen();
    expect(patchMe).not.toHaveBeenCalled();
});

test.each([false, 'timeout'])('NFR-06 S-73 연결 상태=%s이면 1초 안에 요청 없이 오프라인 안내해요', async state => {
    onlineManager.setOnline(false);
    if (state === 'timeout') jest.mocked(NetInfo.fetch).mockImplementation(() => new Promise(() => {}));
    else jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as NetInfoState);
    await renderRouter(routes, { initialUrl: '/ranking' });
    expect(await screen.findByText(offlineMessage, {}, { timeout: 900 })).toBeOnTheScreen();
    expect(weeklyRanking).not.toHaveBeenCalled();
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true } as NetInfoState);
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByLabelText('내 순위, 45위, 책산책, 4시간 15분, 나')).toBeOnTheScreen();
});

test.each([{ route: 'consent', label: '동의하고 참여하기' }, { route: 'withdraw', label: '참여 중단하기' }])(
    'NFR-06 S-74 S-75 $route 오프라인 참여 변경은 요청하지 않아요', async ({ route, label }) => {
        await renderRouter(routes, { initialUrl: `/ranking/${route}` });
        jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as NetInfoState);
        onlineManager.setOnline(false);
        await fireEvent.press(screen.getByRole('button', { name: label }));
        expect(await screen.findByText(offlineMessage)).toBeOnTheScreen();
        expect(patchMe).not.toHaveBeenCalled();
    },
);

test('FR-15 S-74 요청 중 연속 탭을 막고 실패를 알린 뒤 다시 참여할 수 있어요', async () => {
    let reject!: (error: Error) => void;
    jest.mocked(patchMe).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await openFromSettings('consent');
    const button = screen.getByRole('button', { name: '동의하고 참여하기' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(patchMe).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: '반영 중이에요' })).toBeDisabled();
    await act(async () => reject(new ApiError('http', 'FAIL', '참여를 변경하지 못했어요.', 500)));
    expect(await screen.findByRole('alert')).toHaveTextContent('참여를 변경하지 못했어요.');
    await fireEvent.press(screen.getByRole('button', { name: '동의하고 참여하기' }));
    expect(await settingsHeader()).toBeOnTheScreen();
    expect(patchMe).toHaveBeenCalledTimes(2);
});

test('FR-15 S-73 조회 오류 후 재시도하면 순위를 다시 표시해요', async () => {
    jest.mocked(weeklyRanking).mockRejectedValueOnce(new ApiError('http', 'FAIL', '순위를 불러오지 못했어요.', 500));
    await renderRouter(routes, { initialUrl: '/ranking' });
    expect(await screen.findByRole('alert')).toHaveTextContent('순위를 불러오지 못했어요.');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByLabelText('내 순위, 45위, 책산책, 4시간 15분, 나')).toBeOnTheScreen();
});

test('FR-15 S-74 계정 전환 후 도착한 응답은 새 계정 순위 캐시를 초기화하지 않아요', async () => {
    let resolve!: (value: MeResponse) => void;
    jest.mocked(patchMe).mockImplementation(() => new Promise(done => { resolve = done; }));
    await renderRouter(routes, { initialUrl: '/ranking/consent' });
    await fireEvent.press(screen.getByRole('button', { name: '동의하고 참여하기' }));
    await waitFor(() => expect(patchMe).toHaveBeenCalledTimes(1));
    await act(async () => {
        client.clear();
        client.setQueryData(rankingKeys.weekly, { ...data, participating: false, around: [] });
        resolve({ ...user, rankingOptIn: true });
    });
    expect(client.getQueryData(rankingKeys.weekly)).toMatchObject({ participating: false });
    expect(weeklyRanking).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: '랭킹 참여 동의' })).toBeOnTheScreen();
});
