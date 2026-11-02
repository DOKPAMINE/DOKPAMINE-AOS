import * as SecureStore from 'expo-secure-store';
import { AppState, Text, View } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import RootLayout from '../app/_layout';
import AuthEntry from '../app/(auth)/index';
import AuthLayout from '../app/(auth)/_layout';
import OnboardingScreen from '../app/(auth)/onboarding';
import LoginScreen from '../app/(auth)/login';
import SignupScreen from '../app/(auth)/signup';
import TabLayout from '../app/(tabs)/_layout';
import { useAuth } from '../src/auth/AuthProvider';
import { PrimaryButton } from '../src/components';
import { queryClient } from '../src/api/queryClient';
import { ApiError } from '../src/api/errors';
import { login, signup } from '../src/api/endpoints';
import { notifyUnauthorized } from '../src/api/authEvents';
import { authSyncLifecycle } from '../src/auth/syncLifecycle';
import type { TokenResponse } from '../src/api/types';

jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: jest.fn(() => jest.fn()) } }));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn(), useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(), getItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('../src/api/endpoints', () => ({ login: jest.fn(), signup: jest.fn() }));

jest.mock('../src/auth/syncLifecycle', () => ({ authSyncLifecycle: { syncAfterLogin: jest.fn(), stopRecordSync: jest.fn() } }));

const stored = new Map<string, string>();
const validResponse: TokenResponse = {
    accessToken: 'unit-test-token', expiresAt: '2099-01-01T00:00:00Z',
    user: { id: 'reader-id', email: 'reader@example.test', nickname: '독자', rankingOptIn: false },
};

function Home() {
    const { signOut } = useAuth();
    return <View><Text accessibilityRole="header">인증된 홈</Text><PrimaryButton label="로그아웃" onPress={() => { void signOut(); }} /></View>;
}
const routes = {
    _layout: RootLayout,
    '(auth)/_layout': AuthLayout,
    '(auth)/index': AuthEntry,
    '(auth)/onboarding': OnboardingScreen,
    '(auth)/login': LoginScreen,
    '(auth)/signup': SignupScreen,
    '(tabs)/_layout': TabLayout,
    '(tabs)/index': Home,
    '(tabs)/calendar': () => <Text>독서 달력</Text>,
    '(tabs)/lounge': () => <Text>독서 라운지</Text>,
    '(tabs)/my': () => <Text>내 독서</Text>,
    '(tabs)/shelf': () => <Text>인증된 책장</Text>,
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockReset();
    jest.mocked(SecureStore.setItemAsync).mockReset();
    jest.mocked(SecureStore.deleteItemAsync).mockReset();
    jest.mocked(login).mockReset();
    jest.mocked(signup).mockReset();
    stored.clear();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => stored.get(key) ?? null);
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { stored.set(key, value); });
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { stored.delete(key); });
    jest.mocked(login).mockResolvedValue(validResponse);
    jest.mocked(signup).mockResolvedValue(validResponse);
});
afterEach(() => { queryClient.clear(); jest.restoreAllMocks(); });

function seen() { stored.set('dokpamine.onboardingSeen', 'true'); }
function session(expiresAt = validResponse.expiresAt) {
    seen();
    stored.set('dokpamine.accessToken', validResponse.accessToken);
    stored.set('dokpamine.authSession', JSON.stringify({ accessToken: validResponse.accessToken, expiresAt }));
}
async function fillLogin() {
    await fireEvent.changeText(screen.getByLabelText('이메일'), 'reader@example.test');
    await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'password');
}

test('FR-18 · S-01 첫 실행에는 안내 3장과 건너뛰기가 나오고 완료 후 재실행에는 로그인만 나와요', async () => {
    const first = await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByRole('header', { name: '독파민 사용법 안내' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다음 안내' }));
    expect(screen.getByText('3장 중 2번째 안내')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다음 안내' }));
    await fireEvent.press(screen.getByRole('button', { name: '독파민 시작하기' }));
    expect(await screen.findByRole('header', { name: '독파민 로그인' })).toBeOnTheScreen();
    expect(stored.get('dokpamine.onboardingSeen')).toBe('true');
    await first.unmount();
    await renderRouter(routes, { initialUrl: '/onboarding' });
    expect(await screen.findByRole('header', { name: '독파민 로그인' })).toBeOnTheScreen();
    expect(screen.queryByText('독파민 사용법 안내')).toBeNull();
});

test('FR-18 · S-01 건너뛰기도 완료 상태를 저장해요', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('독파민 사용법 안내');
    await fireEvent.press(screen.getByRole('button', { name: '건너뛰기' }));
    expect(await screen.findByText('독파민 로그인')).toBeOnTheScreen();
    expect(stored.get('dokpamine.onboardingSeen')).toBe('true');
});

test('FR-18 · S-01 안내 저장 실패는 안내를 유지하고 재시도할 수 있어요', async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('storage failed'));
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('독파민 사용법 안내');
    await fireEvent.press(screen.getByRole('button', { name: '건너뛰기' }));
    expect(await screen.findByText('안내 완료 상태를 저장하지 못했어요. 다시 시도해 주세요.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '건너뛰기' }));
    expect(await screen.findByText('독파민 로그인')).toBeOnTheScreen();
});

test.each(['/', '/shelf', '/signup'])('FR-10 · S-02 유효한 토큰은 주소 %s에서도 탭으로 들어가요', async initialUrl => {
    session();
    await renderRouter(routes, { initialUrl });
    expect(await screen.findByText(initialUrl === '/shelf' ? '인증된 책장' : '인증된 홈')).toBeOnTheScreen();
    expect(screen.queryByText('독파민 로그인')).toBeNull();
});

test.each(['/', '/shelf'])('FR-10 · S-02 토큰이 없으면 탭 주소 %s에 접근하지 못해요', async initialUrl => {
    seen();
    await renderRouter(routes, { initialUrl });
    expect(await screen.findByText('독파민 로그인')).toBeOnTheScreen();
    expect(screen.queryByText('인증된 홈')).toBeNull();
    expect(screen.queryByText('인증된 책장')).toBeNull();
});

test.each(['2000-01-01T00:00:00Z', '잘못된 시각'])('FR-10 · S-02 토큰 만료 또는 파손 %s는 재로그인을 안내해요', async expiresAt => {
    session(expiresAt);
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('로그인 기간이 만료되었어요. 다시 로그인해 주세요.')).toBeOnTheScreen();
    expect(screen.queryByText('인증된 홈')).toBeNull();
});

test('FR-10 · S-02 잘못된 로그인은 서버 문구를 보여 주고 세션 만료 문구를 표시하지 않아요', async () => {
    seen();
    jest.mocked(login).mockRejectedValue(new ApiError('credentials', 'INVALID_CREDENTIALS', '로그인 정보가 맞지 않아요.', 401));
    await renderRouter(routes, { initialUrl: '/login' });
    await screen.findByText('독파민 로그인');
    await fillLogin();
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('로그인 정보가 맞지 않아요.')).toBeOnTheScreen();
    expect(screen.queryByText('로그인 기간이 만료되었어요. 다시 로그인해 주세요.')).toBeNull();
});

test('FR-10 · S-02 폼 오류는 서버 호출 없이 표시하고 올바른 로그인은 토큰 저장 뒤 홈을 열어요', async () => {
    seen();
    await renderRouter(routes, { initialUrl: '/login' });
    await screen.findByText('독파민 로그인');
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('올바른 이메일을 입력해 주세요.')).toBeOnTheScreen();
    expect(login).not.toHaveBeenCalled();
    await fillLogin();
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('인증된 홈')).toBeOnTheScreen();
    expect(login).toHaveBeenCalledWith({ email: 'reader@example.test', password: 'password' }, expect.anything());
    expect(stored.get('dokpamine.accessToken')).toBe(validResponse.accessToken);
    expect(authSyncLifecycle.syncAfterLogin).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stored.get('dokpamine.authSession')!)).toMatchObject({ expiresAt: validResponse.expiresAt });
    await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
    expect(await screen.findByText('독파민 로그인')).toBeOnTheScreen();
    expect(stored.has('dokpamine.accessToken')).toBe(false);
    expect(authSyncLifecycle.stopRecordSync).toHaveBeenCalledTimes(1);
    expect(stored.has('dokpamine.authSession')).toBe(false);
    expect(stored.get('dokpamine.onboardingSeen')).toBe('true');
});

test('FR-10 · S-03 닉네임을 검증하고 회원가입 성공 후 바로 홈을 열어요', async () => {
    seen();
    await renderRouter(routes, { initialUrl: '/signup' });
    await screen.findByText('독파민 회원가입');
    await fillLogin();
    await fireEvent.press(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(await screen.findByText('닉네임을 입력해 주세요.')).toBeOnTheScreen();
    expect(signup).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('닉네임'), '독자');
    await fireEvent.press(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(await screen.findByText('인증된 홈')).toBeOnTheScreen();
    expect(signup).toHaveBeenCalledWith({ email: 'reader@example.test', password: 'password', nickname: '독자' }, expect.anything());
});

test('FR-10 · S-03 중복 이메일은 서버의 오류 문구를 그대로 보여 줘요', async () => {
    seen();
    jest.mocked(signup).mockRejectedValue(new ApiError('http', 'EMAIL_TAKEN', '이미 가입한 이메일이에요.', 409));
    await renderRouter(routes, { initialUrl: '/signup' });
    await screen.findByText('독파민 회원가입');
    await fillLogin();
    await fireEvent.changeText(screen.getByLabelText('닉네임'), '독자');
    await fireEvent.press(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(await screen.findByText('이미 가입한 이메일이에요.')).toBeOnTheScreen();
});

test('FR-10 · S-02 보호 API의 401은 토큰을 보존한 채 로그인으로 보내고 재실행도 막아요', async () => {
    session();
    const first = await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('인증된 홈');
    await act(() => { notifyUnauthorized(validResponse.accessToken); });
    expect(await screen.findByText('로그인 기간이 만료되었어요. 다시 로그인해 주세요.')).toBeOnTheScreen();
    await waitFor(() => expect(stored.has('dokpamine.authSession')).toBe(false));
    expect(stored.get('dokpamine.accessToken')).toBe(validResponse.accessToken);
    await first.unmount();
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('독파민 로그인')).toBeOnTheScreen();
});

test('FR-10 · S-02 이전 세션에서 늦게 도착한 401은 현재 세션을 만료시키지 않아요', async () => {
    session();
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('인증된 홈');
    await act(() => { notifyUnauthorized('older-test-token'); });
    expect(screen.getByText('인증된 홈')).toBeOnTheScreen();
});

test('FR-10 · S-02 앱 복귀 시 만료된 세션은 탭을 닫고 재로그인을 안내해요', async () => {
    session(new Date(Date.now() + 60_000).toISOString());
    const spy = jest.mocked(AppState.addEventListener);
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('인증된 홈');
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
    await act(() => { for (const [, listener] of spy.mock.calls) listener('active'); });
    expect(await screen.findByText('독파민 로그인')).toBeOnTheScreen();
    now.mockRestore();

});

test('FR-10 · S-02 저장소 조회 실패는 탭을 열지 않고 재시도를 제공해요', async () => {
    session();
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('storage failed'));
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('로그인 정보를 불러오지 못했어요. 다시 시도해 주세요.')).toBeOnTheScreen();
    expect(screen.queryByText('인증된 홈')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByText('인증된 홈')).toBeOnTheScreen();
});

test('FR-10 · S-02 로그인 요청 중 중복 전송을 막고 동기화 실패도 인증 성공을 취소하지 않아요', async () => {
    seen();
    let resolveLogin: (value: TokenResponse) => void = () => {};
    jest.mocked(login).mockReturnValue(new Promise(resolve => { resolveLogin = resolve; }));
    jest.mocked(authSyncLifecycle.syncAfterLogin).mockRejectedValueOnce(new Error('sync offline'));
    await renderRouter(routes, { initialUrl: '/login' });
    await screen.findByText('독파민 로그인');
    await fillLogin();
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByRole('button', { name: '로그인', disabled: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(login).toHaveBeenCalledTimes(1);
    await act(() => { resolveLogin(validResponse); });
    expect(await screen.findByText('인증된 홈')).toBeOnTheScreen();
});

test('FR-10 · S-02 토큰 저장 실패는 로그인 화면을 유지해요', async () => {
    seen();
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('storage failed'));
    await renderRouter(routes, { initialUrl: '/login' });
    await screen.findByText('독파민 로그인');
    await fillLogin();
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('로그인 정보를 저장하지 못했어요. 다시 시도해 주세요.')).toBeOnTheScreen();
    expect(screen.queryByText('인증된 홈')).toBeNull();
    expect(authSyncLifecycle.syncAfterLogin).not.toHaveBeenCalled();
});

test('FR-10 · S-02 만료 상태 저장에 실패해도 재시도로 이전 토큰의 탭을 다시 열지 않아요', async () => {
    session();
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('storage failed'));
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('인증된 홈');
    await act(() => { notifyUnauthorized(validResponse.accessToken); });
    expect(await screen.findByText('로그인 상태를 저장하지 못했어요. 다시 시도해 주세요.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByText('독파민 로그인')).toBeOnTheScreen();
    expect(screen.queryByText('인증된 홈')).toBeNull();
});
