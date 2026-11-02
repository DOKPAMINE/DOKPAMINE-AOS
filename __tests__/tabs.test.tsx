import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import TabLayout from '../app/(tabs)/_layout';
import CalendarScreen from '../app/(tabs)/calendar';
import HomeScreen from '../app/(tabs)/index';
import LoungeScreen from '../app/(tabs)/lounge';
import MyScreen from '../app/(tabs)/my';
import ShelfScreen from '../app/(tabs)/shelf';

// Jest에는 네이티브 폰트 자산 레지스트리가 없으므로 폰트 로더만 대체합니다.
jest.mock('expo-font', () => ({
    ...jest.requireActual('expo-font'),
    isLoaded: () => true,
    loadAsync: jest.fn(),
}));

const routes = {
    '(tabs)/_layout': TabLayout,
    '(tabs)/index': HomeScreen,
    '(tabs)/shelf': ShelfScreen,
    '(tabs)/calendar': CalendarScreen,
    '(tabs)/lounge': LoungeScreen,
    '(tabs)/my': MyScreen,
};

test('PRD 4장 · S-30·S-60·S-10·S-70·S-80 탭이 순서대로 보이고 홈이 선택돼요', async () => {
    await renderRouter(routes, { initialUrl: '/' });

    // Android의 React Navigation 탭은 선택 상태가 있는 button 역할입니다.
    const tabs = screen.getAllByRole('button');
    expect(tabs.map(tab => tab.props.accessibilityLabel)).toEqual(['책장', '캘린더', '홈', '라운지', '마이']);
    expect(screen.getByRole('button', { name: '홈' })).toBeSelected();
    expect(screen.getByRole('header', { name: '홈' })).toBeOnTheScreen();
    for (const name of ['책장', '캘린더', '라운지', '마이']) {
        expect(screen.getByRole('button', { name })).not.toBeSelected();
    }
});

test('FR-04 · S-30 책장 탭을 누르면 책장 자리표시 화면을 보여 줘요', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    await fireEvent.press(screen.getByRole('button', { name: '책장' }));

    expect(screen.getByRole('button', { name: '책장' })).toBeSelected();
    expect(screen.getByRole('header', { name: '책장' })).toBeOnTheScreen();
});
