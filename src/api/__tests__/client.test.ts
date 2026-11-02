import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';

import { apiRequest } from '../client';
import { catalogGenres, me, searchBookReviews } from '../endpoints';
import { ApiError } from '../errors';
import { tokenStorage } from '../tokenStorage';

jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { fetch: jest.fn() },
}));
jest.mock('expo-secure-store', () => ({
    setItemAsync: jest.fn(), getItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const online = { isConnected: true, isInternetReachable: true } as NetInfoState;
const stored = new Map<string, string>();

beforeEach(() => {
    jest.resetAllMocks();
    globalThis.fetch = fetchMock;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test/';
    jest.mocked(NetInfo.fetch).mockResolvedValue(online);
    stored.clear();
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { stored.set(key, value); });
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => stored.get(key) ?? null);
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { stored.delete(key); });
});

afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalBaseUrl;
});

function response(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

test('FR-10 · S-02 토큰을 SecureStore에 저장·조회하고 명시적으로 삭제해요', async () => {
    expect(await tokenStorage.get()).toBeNull();
    await tokenStorage.save('unit-test-only-token');
    expect(await tokenStorage.get()).toBe('unit-test-only-token');
    await tokenStorage.remove();
    expect(await tokenStorage.get()).toBeNull();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('dokpamine.accessToken', 'unit-test-only-token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('dokpamine.accessToken');
});

test('NFR-05 · S-02 401은 한국어 메시지와 인증 오류로 구분하고 토큰을 보존해요', async () => {
    await tokenStorage.save('unit-test-only-token');
    fetchMock.mockResolvedValue(response(401, { code: 'TOKEN_EXPIRED', message: '다시 로그인해 주세요.' }));
    const error = await me().catch(error => error);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'unauthorized', status: 401, code: 'TOKEN_EXPIRED', message: '다시 로그인해 주세요.' });
    expect(await tokenStorage.get()).toBe('unit-test-only-token');
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/me', expect.objectContaining({
        headers: { Accept: 'application/json', Authorization: 'Bearer unit-test-only-token' },
    }));
});

test.each([
    { isConnected: false, isInternetReachable: false },
    { isConnected: true, isInternetReachable: false },
    { isConnected: null, isInternetReachable: null },
])('NFR-06 · S-71 오프라인 또는 연결 미확인 상태 %j이면 요청 없이 즉시 안내해요', async state => {
    jest.mocked(NetInfo.fetch).mockResolvedValue(state as NetInfoState);
    await expect(searchBookReviews('데미안')).rejects.toMatchObject({ kind: 'offline', code: 'OFFLINE', message: '인터넷 연결을 확인해 주세요.' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
});

test('NFR-06 · S-22 연결 확인이 실패하면 요청 없이 연결 안내를 반환해요', async () => {
    jest.mocked(NetInfo.fetch).mockRejectedValue(new Error('native error'));
    await expect(catalogGenres()).rejects.toMatchObject({ kind: 'offline' });
    expect(fetchMock).not.toHaveBeenCalled();
});

test('NFR-06 · S-71 연결 상태 조회가 멈춰도 500ms에 안내해요', async () => {
    jest.useFakeTimers();
    jest.mocked(NetInfo.fetch).mockReturnValue(new Promise(() => {}));
    const assertion = expect(searchBookReviews('데미안')).rejects.toMatchObject({ kind: 'offline' });
    await jest.advanceTimersByTimeAsync(500);
    await assertion;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});

test('FR-16 · S-71 계약의 오류 코드와 한국어 메시지를 그대로 전달해요', async () => {
    await tokenStorage.save('unit-test-only-token');
    fetchMock.mockResolvedValue(response(400, { code: 'BAD_REQUEST', message: '검색어를 입력해 주세요.' }));
    await expect(searchBookReviews('')).rejects.toMatchObject({ kind: 'http', status: 400, code: 'BAD_REQUEST', message: '검색어를 입력해 주세요.' });
});

test.each([401, 502])('FR-10 · S-02 비 JSON 오류여도 HTTP 상태 %i를 보존해요', async status => {
    await tokenStorage.save('unit-test-only-token');
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => { throw new SyntaxError(); } } as unknown as Response);
    await expect(me()).rejects.toMatchObject({ kind: status === 401 ? 'unauthorized' : 'http', status, code: `HTTP_${status}` });
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});

test('FR-10 · S-02 저장된 토큰이 없으면 인증 오류를 반환하고 요청하지 않아요', async () => {
    await expect(me()).rejects.toMatchObject({ kind: 'unauthorized', code: 'AUTH_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
});

test('FR-10 · S-02 SecureStore 조회 실패는 저장소 오류로 구분해요', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('storage failed'));
    await expect(me()).rejects.toMatchObject({ kind: 'storage' });
    expect(fetchMock).not.toHaveBeenCalled();
});

test.each([undefined, '', 'not-a-url'])('FR-01 · S-22 서버 주소 설정 %s가 없거나 잘못되면 요청하지 않아요', async baseUrl => {
    if (baseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = baseUrl;
    await expect(catalogGenres()).rejects.toMatchObject({ kind: 'configuration' });
    expect(fetchMock).not.toHaveBeenCalled();
});

test('FR-01 · S-22 전송 실패는 네트워크 오류로 구분해요', async () => {
    await tokenStorage.save('unit-test-only-token');
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(catalogGenres()).rejects.toMatchObject({ kind: 'network', code: 'NETWORK_ERROR' });
});

test('FR-01 · S-22 성공 응답 JSON이 깨지면 응답 오류로 구분해요', async () => {
    await tokenStorage.save('unit-test-only-token');
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError(); } } as unknown as Response);
    await expect(catalogGenres()).rejects.toMatchObject({ kind: 'invalid-response' });
});

test.each(['fetch', 'body', 'storage'])('NFR-06 · S-22 %s 대기가 멈춰도 제한 시간에 종료하고 타이머를 정리해요', async stage => {
    jest.useFakeTimers();
    await tokenStorage.save('unit-test-only-token');
    if (stage === 'fetch') fetchMock.mockReturnValue(new Promise(() => {}));
    if (stage === 'body') fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response);
    let releaseToken: ((token: string) => void) | undefined;
    if (stage === 'storage') jest.mocked(SecureStore.getItemAsync).mockReturnValue(new Promise(resolve => { releaseToken = resolve; }));
    const assertion = expect(apiRequest('/api/me', { timeoutMs: 25 })).rejects.toMatchObject({ kind: 'timeout', code: 'TIMEOUT' });
    await jest.advanceTimersByTimeAsync(25);
    await assertion;
    if (stage === 'storage') {
        releaseToken?.('unit-test-only-token');
        await jest.advanceTimersByTimeAsync(0);
        expect(fetchMock).not.toHaveBeenCalled();
    } else {
        expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    }
    expect(jest.getTimerCount()).toBe(0);
});
