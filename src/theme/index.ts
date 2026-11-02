import { DefaultTheme, type Theme } from '@react-navigation/native';

import { colors, fontFamilies } from './tokens';

export * from './tokens';

export const navigationTheme: Theme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        primary: colors.ink,
        background: colors.paper,
        card: colors.surface,
        text: colors.ink,
        border: colors.stone,
        notification: colors.error,
    },
    fonts: {
        regular: { fontFamily: fontFamilies.regular, fontWeight: '400' },
        medium: { fontFamily: fontFamilies.medium, fontWeight: '500' },
        bold: { fontFamily: fontFamilies.bold, fontWeight: '700' },
        heavy: { fontFamily: fontFamilies.bold, fontWeight: '700' },
    },
};
