import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { patchMe, weeklyRanking } from '../../api/endpoints';

jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn() }));

const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const user = { id: 'reader', email: 'reader@example.test', nickname: '책산책', rankingOptIn: true };
const ranking = { weekStart: '2026-11-02', participating: true,
    top: [{ rank: 1, userId: user.id, nickname: user.nickname, seconds: 3600, me: true }], around: [] };

beforeEach(() => {
    jest.resetAllMocks();
    globalThis.fetch = fetchMock;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true } as NetInfoState);
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('unit-test-only-token');
});
afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalBaseUrl;
});

test.each([undefined, '2026-11-02', '2026-11-02&other=value'])(
    'FR-15 S-73 주 시작일=%s의 경로를 인코딩하고 top·around 응답을 보존해요', async weekStart => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ranking });
        await expect(weeklyRanking(weekStart)).resolves.toEqual(ranking);
        expect(fetchMock).toHaveBeenCalledWith(`https://api.example.test/api/ranking/weekly${weekStart === undefined ? '' : `?weekStart=${encodeURIComponent(weekStart)}`}`,
            expect.objectContaining({ method: 'GET', headers: { Accept: 'application/json', Authorization: 'Bearer unit-test-only-token' } }));
    },
);

test.each([{ rankingOptIn: true }, { rankingOptIn: false }, { nickname: '새 닉네임' }])(
    'FR-15 S-74 S-75 프로필 변경 %s은 PATCH로 보내고 사용자 응답을 보존해요', async body => {
        const response = { ...user, ...body };
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => response });
        await expect(patchMe(body)).resolves.toEqual(response);
        expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/me', expect.objectContaining({
            method: 'PATCH', body: JSON.stringify(body), headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer unit-test-only-token' },
        }));
    },
);

test.each([() => weeklyRanking(), () => patchMe({ rankingOptIn: true }), () => patchMe({ rankingOptIn: false })])(
    'NFR-06 S-73~75 오프라인이면 랭킹 HTTP 요청을 보내지 않아요', async request => {
        jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as NetInfoState);
        await expect(request()).rejects.toMatchObject({ kind: 'offline' });
        expect(fetchMock).not.toHaveBeenCalled();
    },
);
