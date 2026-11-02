import { DefaultTheme, type Theme } from '@react-navigation/native';

import { colors, fontFamilies } from './tokens';

export * from './tokens';

export const navigationTheme: Theme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        primary: colors.brand.espresso,
        background: colors.surface.paper,
        card: colors.surface.card,
        text: colors.brand.espresso,
        border: colors.line.border,
        notification: colors.state.error,
    },
    fonts: {
        regular: { fontFamily: fontFamilies.regular, fontWeight: '400' },
        medium: { fontFamily: fontFamilies.medium, fontWeight: '500' },
        bold: { fontFamily: fontFamilies.bold, fontWeight: '700' },
        heavy: { fontFamily: fontFamilies.bold, fontWeight: '700' },
    },
};
