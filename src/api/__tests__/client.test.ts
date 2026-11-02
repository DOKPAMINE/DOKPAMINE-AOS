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

test('FR-10 · S-02 잘못된 로그인 401은 세션 만료와 구분하고 서버 문구를 보존해요', async () => {
    fetchMock.mockResolvedValue(response(401, { code: 'INVALID_CREDENTIALS', message: '로그인 정보가 맞지 않아요.' }));
    await expect(apiRequest('/api/auth/login', { method: 'POST', authenticated: false, body: { email: 'reader@example.test', password: 'wrong-pass' } })).rejects.toMatchObject({ kind: 'credentials', status: 401, message: '로그인 정보가 맞지 않아요.' });
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});

test('FR-10 · S-02 성공한 204는 JSON을 읽지 않고 빈 응답으로 처리해요', async () => {
    const json = jest.fn().mockRejectedValue(new SyntaxError());
    fetchMock.mockResolvedValue({ ok: true, status: 204, json } as unknown as Response);
    await expect(apiRequest<void>('/api/test', { authenticated: false })).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
});

test('FR-10 · S-02 이미 취소된 요청은 연결 확인과 전송 없이 종료해요', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(apiRequest('/api/me', { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(NetInfo.fetch).not.toHaveBeenCalled();
});

test.each(['fetch', 'storage', 'connectivity'])('FR-10 · S-02 %s 대기 중 취소도 즉시 종료하고 뒤늦은 요청을 막아요', async stage => {
    jest.useFakeTimers();
    await tokenStorage.save('unit-test-only-token');
    let releaseToken: ((value: string) => void) | undefined;
    if (stage === 'storage') jest.mocked(SecureStore.getItemAsync).mockReturnValue(new Promise(resolve => { releaseToken = resolve; }));
    if (stage === 'connectivity') jest.mocked(NetInfo.fetch).mockReturnValue(new Promise(() => {}));
    fetchMock.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const assertion = expect(apiRequest('/api/me', { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    await jest.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    releaseToken?.('unit-test-only-token');
    await jest.advanceTimersByTimeAsync(500);
    if (stage !== 'fetch') expect(fetchMock).not.toHaveBeenCalled();
    else expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
});

test.each(['empty', 'html', 'message-only'])('FR-10 · S-02 code 없는 로그인 401 %s는 만료가 아닌 로그인 정보를 안내해요', async format => {
    const serverResponse = format === 'html'
        ? { ok: false, status: 401, json: async () => { throw new SyntaxError(); } } as unknown as Response
        : response(401, format === 'message-only' ? { message: '로그인 정보를 확인해 주세요.' } : undefined);
    fetchMock.mockResolvedValue(serverResponse);
    await expect(apiRequest('/api/auth/login', { method: 'POST', authenticated: false })).rejects.toMatchObject({ kind: 'credentials', status: 401, message: format === 'message-only' ? '로그인 정보를 확인해 주세요.' : '이메일 또는 비밀번호를 확인해 주세요.' });
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});

test.each(['', '   ', 'Internal Server Error'])('FR-10 · S-02 빈 메시지와 영문 메시지 %s는 한국어 기본 안내로 바꿔요', async message => {
    fetchMock.mockResolvedValue(response(401, { code: 'INVALID_CREDENTIALS', message }));
    await expect(apiRequest('/api/auth/login', { authenticated: false })).rejects.toMatchObject({ message: '이메일 또는 비밀번호를 확인해 주세요.' });
});

test('FR-10 NFR-05 · S-02 이전 계정 요청은 SecureStore의 새 토큰을 사용하지 않아요', async () => {
    await tokenStorage.save('account-b-token');
    fetchMock.mockResolvedValue(response(200, {}));
    await apiRequest('/api/sync/snapshot', { accessToken: 'account-a-token' });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer account-a-token' }),
    }));
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
});
