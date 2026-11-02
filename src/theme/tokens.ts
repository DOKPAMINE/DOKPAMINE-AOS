import type { TextStyle } from 'react-native';

// Figma v1.0 변수. 화면과 컴포넌트에서는 이 토큰만 사용합니다.
export const colors = {
    paper: '#F7F6F0',
    surface: '#FFFFFF',
    ink: '#20291F',
    muted: '#6A7166',
    moss: '#526932',
    lime: '#D5F477',
    sage: '#E9EFDD',
    stone: '#DEE2D5',
    chip: '#EAECE0',
    cover: '#2C463A',
    leaf: '#BCD692',
    error: '#B3261E',
} as const;

export const fontFamilies = {
    regular: 'NotoSansKR_400Regular',
    medium: 'NotoSansKR_500Medium',
    bold: 'NotoSansKR_700Bold',
} as const;

const textStyle = (
    fontSize: number,
    weight: keyof typeof fontFamilies,
    lineHeight = fontSize * 1.25,
): TextStyle => ({ fontFamily: fontFamilies[weight], fontSize, lineHeight });

export const typography = {
    heading: textStyle(21, 'bold'),
    titleLarge: textStyle(20, 'regular'),
    title: textStyle(18, 'medium'),
    titleSmall: textStyle(16, 'medium', 21),
    body: textStyle(16, 'regular', 22),
    label: textStyle(14, 'medium'),
    bodySmall: textStyle(13, 'regular'),
    caption: textStyle(12, 'medium'),
    tab: textStyle(11, 'medium'),
    footnote: textStyle(11, 'regular'),
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { small: 4, button: 14, card: 18, pill: 24 } as const;
export const sizes = { minTouch: 44, button: 52, icon: 24, tabBar: 64, progress: 32 } as const;
