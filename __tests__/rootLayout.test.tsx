import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '../app/_layout';
import TabLayout from '../app/(tabs)/_layout';
import HomeScreen from '../app/(tabs)/index';
import { queryClient } from '../src/api/queryClient';

jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { addEventListener: jest.fn(() => jest.fn()) },
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
    jest.mocked(useFonts).mockReturnValue([false, new Error('폰트를 불러오지 못했습니다.')]);
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
    expect(screen.getByRole('header', { name: '홈' })).toBeOnTheScreen();
});

test('PRD 4장 · S-10 폰트를 불러오지 못해도 스플래시를 닫고 홈을 보여 줘요', async () => {
    await renderRouter({ _layout: RootLayout, '(tabs)/_layout': TabLayout, '(tabs)/index': HomeScreen }, { initialUrl: '/' });

    expect(SplashScreen.hideAsync).toHaveBeenCalled();
    expect(screen.getByRole('header', { name: '홈' })).toBeOnTheScreen();
});
