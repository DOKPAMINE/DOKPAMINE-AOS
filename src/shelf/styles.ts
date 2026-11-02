import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

export const shelfStyles = StyleSheet.create({
    section: { gap: spacing.md },
    title: { ...typography.title, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso },
    muted: { ...typography.bodySmall, color: colors.text.muted },
    error: { ...typography.bodySmall, color: colors.state.error },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    field: { minHeight: sizes.minTouch, padding: spacing.md, borderWidth: 1, borderColor: colors.line.border, borderRadius: radii.small, backgroundColor: colors.surface.card, ...typography.body, color: colors.brand.espresso },
    label: { ...typography.label, color: colors.brand.espresso },
    choice: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, padding: spacing.md, justifyContent: 'center', borderRadius: radii.small, backgroundColor: colors.surface.chip },
    selected: { borderWidth: 1, borderColor: colors.brand.espresso, backgroundColor: colors.brand.sand },
    pressed: { opacity: 0.6 },
});
