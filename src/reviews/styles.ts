import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

export const reviewStyles = StyleSheet.create({
    container: { flex: 1 },
    section: { gap: spacing.sm },
    heading: { ...typography.title, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso },
    label: { ...typography.label, color: colors.brand.espresso },
    meta: { ...typography.bodySmall, color: colors.text.muted },
    error: { ...typography.bodySmall, color: colors.state.error },
    input: { ...typography.body, color: colors.brand.espresso, backgroundColor: colors.surface.card,
        borderColor: colors.line.border, borderWidth: 1, borderRadius: radii.small,
        minHeight: sizes.minTouch, padding: spacing.md, textAlignVertical: 'top' },
    multiline: { minHeight: sizes.minTouch * 3 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    choice: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, padding: spacing.md,
        borderRadius: radii.small, backgroundColor: colors.surface.chip, justifyContent: 'center' },
    selected: { borderWidth: 1, borderColor: colors.brand.espresso },
    pressed: { backgroundColor: colors.surface.sandSoft },
});
