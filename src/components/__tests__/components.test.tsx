import { fireEvent, render, screen } from '@testing-library/react-native';

import { PrimaryButton, SecondaryButton } from '../Button';
import { ProgressBar } from '../ProgressBar';
import { StateView } from '../StateView';

test('D6 · S-10 진행 막대는 문구를 접근성에 한 번만 전달하고 퍼센트를 표시하지 않아요', async () => {
    await render(<ProgressBar currentPage={84} totalPages={240} />);

    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars).toHaveLength(1);
    expect(progressBars[0]).toHaveAccessibilityValue({ text: '84 / 240쪽' });
    expect(screen.queryByText('84 / 240쪽')).toBeNull();
    expect(screen.getAllByText('84 / 240쪽', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.queryByText(/%/, { includeHiddenElements: true })).toBeNull();
});

test.each([
    ['loading', '잠시만 기다려 주세요. 불러오고 있어요.'],
    ['empty', '아직 기록이 없어요. 독서 기록을 남겨 주세요.'],
    ['error', '불러오지 못했어요. 다시 시도해 주세요.'],
    ['offline', '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.'],
] as const)('NFR-06 · S-10 %s 상태에서 한국어 안내를 보여 줘요', async (kind, message) => {
    await render(<StateView kind={kind} />);
    expect(screen.getByText(message)).toBeOnTheScreen();
});

test('NFR-06 · S-10 오류 안내에서 다시 시도할 수 있어요', async () => {
    const onRetry = jest.fn();
    await render(<StateView kind="error" onRetry={onRetry} />);
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
});

test('NFR-07 · S-10 공통 버튼은 최소 44 크기이며 비활성 상태에서는 실행되지 않아요', async () => {
    const onPress = jest.fn();
    await render(<><PrimaryButton label="확인해 주세요" onPress={onPress} /><SecondaryButton label="기다려 주세요" onPress={onPress} disabled /></>);
    const primary = screen.getByRole('button', { name: '확인해 주세요' });
    const secondary = screen.getByRole('button', { name: '기다려 주세요' });
    expect(primary).toHaveStyle({ minHeight: 52, minWidth: 44 });
    expect(secondary).toHaveStyle({ minHeight: 52, minWidth: 44 });
    expect(secondary).toBeDisabled();
    await fireEvent.press(secondary);
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(primary);
    expect(onPress).toHaveBeenCalledTimes(1);
});
