import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors } from '../../theme';
import { ProgressBar } from '../ProgressBar';

test.each([
    [0, '0%'],
    [84, '35%'],
    [240, '100%'],
])('D6 · S-10 %i쪽에서 채운 영역만 밝은 문구를 보여 줘요', async (currentPage, width) => {
    await render(<ProgressBar currentPage={currentPage} totalPages={240} />);
    const progressBar = screen.getByRole('progressbar');
    expect(screen.getAllByText(`${currentPage} / 240쪽`, { includeHiddenElements: true })).toHaveLength(1);
    await fireEvent(progressBar, 'layout', { nativeEvent: { layout: { width: 300 } } });

    const [trackLabel, filledLabel] = screen.getAllByText(`${currentPage} / 240쪽`, { includeHiddenElements: true });
    expect(progressBar).toHaveStyle({ backgroundColor: colors.brand.sand, overflow: 'hidden' });
    expect(trackLabel).toHaveStyle({ color: colors.brand.espresso });
    expect(filledLabel).toHaveStyle({ color: colors.surface.paper, width: 300 });
    expect(filledLabel.parent).toHaveStyle({ backgroundColor: colors.text.muted, overflow: 'hidden', width });

    await fireEvent(progressBar, 'layout', { nativeEvent: { layout: { width: 400 } } });
    expect(filledLabel).toHaveStyle({ width: 400 });
});
