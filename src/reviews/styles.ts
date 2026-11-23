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
    pressed: { backgroundColor: colors.surface.sandSoft },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    // AGENTS.md 7: 카드의 수정·삭제 버튼은 글자 길이와 상관없이 가로·세로 모두 44dp 이상 눌린다.
    action: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, padding: spacing.sm, justifyContent: 'center', alignItems: 'center' },
    dimmed: { opacity: 0.6 },
});
