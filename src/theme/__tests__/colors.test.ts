import { colors, navigationTheme } from '..';

// WCAG 상대 휘도: sRGB를 선형화한 뒤 채널 가중치를 적용합니다.
function luminance(hex: string): number {
    const channels = [1, 3, 5].map((offset) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
    const values = [luminance(foreground), luminance(background)];
    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

test('WCAG 2.x · 대비 계산은 알려진 기준값과 같아요', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#777777', '#FFFFFF')).toBeLessThan(4.5);
});

test('Figma v1.0 · 색상 토큰은 브라운 밝은안의 11개 역할과 값만 포함해요', () => {
    expect(colors).toEqual({
        brand: { espresso: '#3B2A28', camel: '#C8A86B', sand: '#E6D8BF' },
        surface: { paper: '#FDFBF7', card: '#FFFFFF', sandSoft: '#F4EDE1', chip: '#F6F0E6' },
        line: { border: '#ECE3D4' },
        text: { muted: '#6A4D39' },
        state: { error: '#9D3529', errorBg: '#F8E2DD' },
    });
    expect(Object.values(colors).flatMap(Object.values)).toHaveLength(11);
});

test.each([
    ['본문/화면', colors.brand.espresso, colors.surface.paper],
    ['본문/카드', colors.brand.espresso, colors.surface.card],
    ['주 버튼·선택 탭', colors.brand.camel, colors.brand.espresso],
    ['비선택 탭', colors.surface.paper, colors.brand.espresso],
    ['보조 버튼', colors.brand.espresso, colors.surface.chip],
    ['보조 글자/화면', colors.text.muted, colors.surface.paper],
    ['보조 글자/카드', colors.text.muted, colors.surface.card],
    ['오류/화면', colors.state.error, colors.surface.paper],
    ['오류/오류 배경', colors.state.error, colors.state.errorBg],
    ['진행 막대 빈 부분', colors.brand.espresso, colors.brand.sand],
    ['진행 막대 채운 부분', colors.surface.paper, colors.text.muted],
])('Figma v1.0 · %s의 명도 대비는 4.5:1 이상이에요', (_usage, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
});

test('Figma v1.0 · 내비게이션 색상도 역할 토큰을 사용해요', () => {
    expect(navigationTheme.colors).toEqual({
        primary: colors.brand.espresso,
        background: colors.surface.paper,
        card: colors.surface.card,
        text: colors.brand.espresso,
        border: colors.line.border,
        notification: colors.state.error,
    });
});
