import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

export const recordStyles = StyleSheet.create({
    section: { gap: spacing.sm },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    body: { ...typography.body, color: colors.brand.espresso },
    muted: { ...typography.bodySmall, color: colors.text.muted },
    label: { ...typography.label, color: colors.brand.espresso },
    error: { ...typography.bodySmall, color: colors.state.error },
    field: { ...typography.body, minHeight: sizes.minTouch, padding: spacing.md, borderWidth: 1, borderColor: colors.line.border,
        borderRadius: radii.small, backgroundColor: colors.surface.card, color: colors.brand.espresso },
    action: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, padding: spacing.sm, justifyContent: 'center' },
    pressed: { opacity: 0.6 },
});
