import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
    section: { gap: spacing.lg },
    heading: { ...typography.title, color: colors.brand.espresso },
    titleSmall: { ...typography.titleSmall, color: colors.brand.espresso },
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
    // #113 표지 왼쪽·글 오른쪽. 글 칸은 남은 너비만 차지하고 그 안에서 줄바꿈한다.
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    rowText: { flex: 1, minWidth: 0, gap: spacing.sm },
    card: { alignItems: 'flex-start' },
    cardLink: { alignSelf: 'stretch', minHeight: sizes.minTouch, gap: spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
        minHeight: sizes.minTouch, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.surface.chip, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line.border,
    },
    chipSelected: { borderColor: colors.brand.espresso },
    like: {
        minHeight: sizes.button, minWidth: sizes.minTouch, padding: spacing.md,
        backgroundColor: colors.surface.chip, borderRadius: radii.button,
        justifyContent: 'center', alignItems: 'center',
    },
    likeSelected: { borderWidth: 1, borderColor: colors.brand.espresso },
    likeText: { ...typography.label, color: colors.brand.espresso },
    likeSelectedText: { ...typography.titleSmall },
});
