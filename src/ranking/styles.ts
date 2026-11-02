import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
    body: { ...typography.body, color: colors.brand.espresso },
    secondary: { ...typography.bodySmall, color: colors.text.muted },
    heading: { ...typography.title, color: colors.brand.espresso },
    section: { gap: spacing.sm },
    row: { gap: spacing.sm, padding: spacing.md },
    identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    nickname: { ...typography.body, color: colors.brand.espresso, flex: 1 },
    mine: { backgroundColor: colors.surface.sandSoft },
    myName: { ...typography.titleSmall },
    time: { ...typography.body, color: colors.brand.espresso, textAlign: 'right', fontVariant: ['tabular-nums'] },
    divider: { borderTopWidth: 1, borderTopColor: colors.line.border, paddingTop: spacing.lg, gap: spacing.sm },
});
