import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '../app/_layout';
import TabLayout from '../app/(tabs)/_layout';
import HomeScreen from '../app/(tabs)/index';
import { queryClient } from '../src/api/queryClient';
import { initializeDatabase } from '../src/db/client';

jest.mock('../src/sync', () => ({ syncAfterLogin: jest.fn(), stopRecordSync: jest.fn() }));

jest.mock('../src/db/client', () => ({ initializeDatabase: jest.fn(() => Promise.resolve({})) }));

jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { addEventListener: jest.fn(() => jest.fn()) },
}));

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (key: string) => key === 'dokpamine.accessToken' ? 'test-token' : key === 'dokpamine.authSession' ? JSON.stringify({ accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z' }) : 'true'),
}));

afterEach(() => queryClient.clear());

// 폰트 로드가 실패한 상황을 만듭니다.
jest.mock('expo-font', () => ({
    ...jest.requireActual('expo-font'),
    isLoaded: () => false,
    loadAsync: jest.fn(),
    useFonts: jest.fn(() => [false, new Error('폰트를 불러오지 못했습니다.')]),
}));

jest.mock('expo-splash-screen', () => ({
    preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
    hideAsync: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(initializeDatabase).mockResolvedValue({} as Awaited<ReturnType<typeof initializeDatabase>>);
    jest.mocked(useFonts).mockReturnValue([false, new Error('폰트를 불러오지 못했습니다.')]);
});

test('NFR-04 S-10 DB 마이그레이션이 끝날 때까지 화면과 스플래시를 유지해요', async () => {
    let finish!: (value: Awaited<ReturnType<typeof initializeDatabase>>) => void;
    jest.mocked(initializeDatabase).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await renderRouter({ _layout: RootLayout, '(tabs)/_layout': TabLayout, '(tabs)/index': HomeScreen }, { initialUrl: '/' });
    expect(screen.queryByRole('header', { name: '홈' })).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    await act(async () => { finish({} as Awaited<ReturnType<typeof initializeDatabase>>); });
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
    expect(screen.getByRole('header', { name: '홈' })).toBeOnTheScreen();
});

test('PRD 4장 · S-10 폰트를 불러오는 동안 스플래시를 유지해요', async () => {
    jest.mocked(useFonts).mockReturnValue([false, null]);

    const result = await render(<RootLayout />);

    expect(result.toJSON()).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
});

test('S-10 폰트를 불러오면 홈에서 재진입에도 같은 루트 QueryClient를 사용해요', async () => {
    jest.mocked(useFonts).mockReturnValue([true, null]);
    const clients: QueryClient[] = [];
    function HomeWithQueryClient() {
        clients.push(useQueryClient());
        return <HomeScreen />;
    }

    const routes = { _layout: RootLayout, '(tabs)/_layout': TabLayout, '(tabs)/index': HomeWithQueryClient };
    const firstRender = await renderRouter(routes, { initialUrl: '/' });

    await firstRender.unmount();
    const firstRenderCount = clients.length;
    await renderRouter(routes, { initialUrl: '/' });

    expect(firstRenderCount).toBeGreaterThan(0);
    expect(clients.length).toBeGreaterThan(firstRenderCount);
    expect(clients[0]).toBeInstanceOf(QueryClient);
    expect(clients[0]).toBe(queryClient);
    expect(clients.every(client => client === clients[0])).toBe(true);
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
    expect(await screen.findByRole('header', { name: '홈' })).toBeOnTheScreen();
});

test('PRD 4장 · S-10 폰트를 불러오지 못해도 스플래시를 닫고 홈을 보여 줘요', async () => {
    await renderRouter({ _layout: RootLayout, '(tabs)/_layout': TabLayout, '(tabs)/index': HomeScreen }, { initialUrl: '/' });

    expect(SplashScreen.hideAsync).toHaveBeenCalled();
    expect(await screen.findByRole('header', { name: '홈' })).toBeOnTheScreen();
});
