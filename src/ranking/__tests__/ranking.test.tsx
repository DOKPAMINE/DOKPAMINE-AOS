import { Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import Ranking from '../../../app/ranking';
import Consent from '../../../app/ranking/consent';
import Withdraw from '../../../app/ranking/withdraw';
import Lounge from '../../../app/(tabs)/lounge';
import { feedList, patchMe, weeklyRanking } from '../../api/endpoints';
import { ApiError } from '../../api/errors';
import type { MeResponse, RankingEntry, WeeklyRankingResponse } from '../../api/types';
import { rankingKeys } from '../queries';

jest.mock('../../api/endpoints', () => ({ weeklyRanking: jest.fn(), patchMe: jest.fn(), feedList: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));

const user: MeResponse = { id: 'reader', email: 'reader@example.test', nickname: '책산책', rankingOptIn: false };
const entry = (rank: number, me = false): RankingEntry => ({ rank, userId: `reader-${rank}`, nickname: me ? user.nickname : `독서가 ${rank}`, seconds: 18000 - rank * 60, me });
const data: WeeklyRankingResponse = { weekStart: '2026-11-02', participating: true,
    top: Array.from({ length: 30 }, (_, i) => entry(i + 1)),
    around: Array.from({ length: 30 }, (_, i) => entry(i + 31, i === 14)) };
const offlineMessage = '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.';
let client: QueryClient;
const routes = {
    _layout: () => <QueryClientProvider client={client}><Slot /></QueryClientProvider>,
    'ranking/index': Ranking, 'ranking/consent': Consent, 'ranking/withdraw': Withdraw, '(tabs)/lounge': Lounge,
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

test('FR-15 S-70 S-73 라운지에서 전체 30명과 내 주변 30명을 열고 본인을 나로 구분해요', async () => {
    await renderRouter(routes, { initialUrl: '/lounge' });
    await fireEvent.press(screen.getByRole('button', { name: '독서왕 랭킹' }));
    expect(await screen.findByRole('header', { name: '전체 1~30위' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '내 순위 주변 30명' })).toBeOnTheScreen();
    expect(screen.getByText('1위')).toBeOnTheScreen();
    expect(screen.getByText('30위')).toBeOnTheScreen();
    expect(screen.getByText('31위')).toBeOnTheScreen();
    expect(screen.getByText('60위')).toBeOnTheScreen();
    expect(screen.getByText('책산책 · 나')).toBeOnTheScreen();
    expect(screen.getByText('4시간 59분')).toBeOnTheScreen();
    expect(screen.getByText('2026-11-02 시작 주 · 한국 시간')).toBeOnTheScreen();
});

test('FR-15 S-73 S-74 비참여자도 순위를 보고 공개 정보에 동의한 뒤에만 참여해요', async () => {
    jest.mocked(weeklyRanking).mockResolvedValueOnce({ ...data, participating: false, around: [] });
    await renderRouter(routes, { initialUrl: '/ranking' });
    await fireEvent.press(await screen.findByRole('button', { name: '랭킹 참여 안내' }));
    expect(screen.getByRole('header', { name: '랭킹 참여 동의' })).toBeOnTheScreen();
    expect(screen.getByText(/참여하시면 닉네임·순위·독서 시간이/)).toBeOnTheScreen();
    expect(patchMe).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '동의하고 참여하기' }));
    expect(await screen.findByText('랭킹에 참여 중이에요.')).toBeOnTheScreen();
    expect(patchMe).toHaveBeenCalledWith({ rankingOptIn: true });
    expect(jest.mocked(weeklyRanking).mock.calls.length).toBeGreaterThan(1);
});

test('FR-15 S-73 S-75 중단 확인 후 순위에서 빠지고 비참여 안내로 갱신돼요', async () => {
    await renderRouter(routes, { initialUrl: '/ranking' });
    await fireEvent.press(await screen.findByRole('button', { name: '참여 중단' }));
    expect(screen.getByRole('header', { name: '랭킹 참여를 중단할까요?' })).toBeOnTheScreen();
    expect(patchMe).not.toHaveBeenCalled();
    jest.mocked(weeklyRanking).mockResolvedValue({ ...data, participating: false, around: [] });
    await fireEvent.press(screen.getByRole('button', { name: '참여 중단하기' }));
    expect(await screen.findByRole('button', { name: '랭킹 참여 안내' })).toBeOnTheScreen();
    expect(patchMe).toHaveBeenCalledWith({ rankingOptIn: false });
    expect(screen.queryByText('책산책 · 나')).toBeNull();
    expect(screen.queryByText('내 순위 주변 30명')).toBeNull();
});

test.each(['consent', 'withdraw'])('FR-15 S-74 S-75 %s에서 돌아가면 참여를 변경하지 않아요', async route => {
    await renderRouter(routes, { initialUrl: `/ranking/${route}` });
    await fireEvent.press(screen.getByRole('button', { name: '랭킹으로 돌아가기' }));
    expect(await screen.findByRole('header', { name: '전체 1~30위' })).toBeOnTheScreen();
    expect(patchMe).not.toHaveBeenCalled();
});

test('FR-15 S-73 순위가 비었을 때 빈 안내와 참여 상태를 보여 줘요', async () => {
    jest.mocked(weeklyRanking).mockResolvedValue({ ...data, top: [], around: [] });
    await renderRouter(routes, { initialUrl: '/ranking' });
    expect(await screen.findByText('이번 주 순위에 오른 독자가 아직 없어요.')).toBeOnTheScreen();
    expect(screen.getByText('이번 주 집계된 타이머 독서 시간이 생기면 내 순위를 볼 수 있어요.')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: '내 순위 주변 30명' })).toBeNull();
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
    expect(await screen.findByText('책산책 · 나')).toBeOnTheScreen();
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
    await renderRouter(routes, { initialUrl: '/ranking/consent' });
    const button = screen.getByRole('button', { name: '동의하고 참여하기' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(patchMe).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: '반영 중이에요' })).toBeDisabled();
    await act(async () => reject(new ApiError('http', 'FAIL', '참여를 변경하지 못했어요.', 500)));
    expect(await screen.findByRole('alert')).toHaveTextContent('참여를 변경하지 못했어요.');
    await fireEvent.press(screen.getByRole('button', { name: '동의하고 참여하기' }));
    expect(await screen.findByText('랭킹에 참여 중이에요.')).toBeOnTheScreen();
    expect(patchMe).toHaveBeenCalledTimes(2);
});

test('FR-15 S-73 조회 오류 후 재시도하면 순위를 다시 표시해요', async () => {
    jest.mocked(weeklyRanking).mockRejectedValueOnce(new ApiError('http', 'FAIL', '순위를 불러오지 못했어요.', 500));
    await renderRouter(routes, { initialUrl: '/ranking' });
    expect(await screen.findByRole('alert')).toHaveTextContent('순위를 불러오지 못했어요.');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByText('책산책 · 나')).toBeOnTheScreen();
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
