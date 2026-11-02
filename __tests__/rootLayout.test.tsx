import * as SplashScreen from 'expo-splash-screen';
import { renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '../app/_layout';
import TabLayout from '../app/(tabs)/_layout';
import HomeScreen from '../app/(tabs)/index';

// 폰트 로드가 실패한 상황을 만듭니다.
jest.mock('expo-font', () => ({
    ...jest.requireActual('expo-font'),
    isLoaded: () => false,
    loadAsync: jest.fn(),
    useFonts: () => [false, new Error('폰트를 불러오지 못했습니다.')],
}));

jest.mock('expo-splash-screen', () => ({
    preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
    hideAsync: jest.fn(() => Promise.resolve()),
}));

test('PRD 4장 · S-10 폰트를 불러오지 못해도 스플래시를 닫고 홈을 보여 줘요', async () => {
    await renderRouter({ _layout: RootLayout, '(tabs)/_layout': TabLayout, '(tabs)/index': HomeScreen }, { initialUrl: '/' });

    expect(SplashScreen.hideAsync).toHaveBeenCalled();
    expect(screen.getByRole('header', { name: '홈' })).toBeOnTheScreen();
});
