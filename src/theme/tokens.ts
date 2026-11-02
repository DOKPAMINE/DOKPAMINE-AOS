import type { TextStyle } from 'react-native';

// Figma v1.0 `독파민 / 색상 v1.0 (브라운 밝은안)` 변수
export const colors = {
    brand: {
        espresso: '#3B2A28', // 주 글자·주 버튼·탭 바
        camel: '#C8A86B', // 강조·주 버튼 글자·선택 탭
        sand: '#E6D8BF', // 책등·보조·진행 막대 빈 부분
    },
    surface: {
        paper: '#FDFBF7', // 화면 배경·어두운 배경 위 글자
        card: '#FFFFFF', // 카드 배경
        sandSoft: '#F4EDE1', // 통계 칸 배경
        chip: '#F6F0E6', // 칩·보조 버튼 배경
    },
    line: {
        border: '#ECE3D4', // 테두리·구분선
    },
    text: {
        muted: '#6A4D39', // 보조 글자·상태 라벨·진행 막대 채움
    },
    state: {
        error: '#9D3529', // 오류 글자
        errorBg: '#F8E2DD', // 오류 배경
    },
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
