import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

export function Card({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) {
    return (
        <View accessibilityRole="summary" accessibilityLabel={accessibilityLabel} style={styles.card}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: spacing.lg,
        gap: spacing.md,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line.border,
        backgroundColor: colors.surface.card,
    },
});
