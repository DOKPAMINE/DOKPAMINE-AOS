import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
    section: { gap: spacing.lg },
    heading: { ...typography.title, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso },
    muted: { ...typography.bodySmall, color: colors.text.muted },
    input: {
        ...typography.body, color: colors.brand.espresso, backgroundColor: colors.surface.card,
        borderWidth: 1, borderColor: colors.line.border, borderRadius: radii.button,
        minHeight: sizes.button, padding: spacing.md,
    },
    review: {
        minHeight: sizes.minTouch, gap: spacing.sm, paddingVertical: spacing.lg,
        borderBottomWidth: 1, borderBottomColor: colors.line.border,
    },
    like: {
        minHeight: sizes.button, minWidth: sizes.minTouch, padding: spacing.md,
        backgroundColor: colors.surface.chip, borderRadius: radii.button,
        justifyContent: 'center', alignItems: 'center',
    },
    likeSelected: { borderWidth: 1, borderColor: colors.brand.espresso },
    likeText: { ...typography.label, color: colors.brand.espresso },
    likeSelectedText: { ...typography.titleSmall },
});
