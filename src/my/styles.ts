import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
    heading: { ...typography.title, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso },
    meta: { ...typography.bodySmall, color: colors.text.muted },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    choice: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, justifyContent: 'center', padding: spacing.md,
        borderRadius: radii.button, backgroundColor: colors.surface.chip },
    selected: { borderWidth: 1, borderColor: colors.brand.espresso },
    switch: { minHeight: sizes.minTouch, minWidth: sizes.minTouch },
});
