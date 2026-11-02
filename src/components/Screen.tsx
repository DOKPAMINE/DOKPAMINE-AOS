import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme';

export function Screen({ title, children }: PropsWithChildren<{ title: string }>) {
    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text accessibilityRole="header" accessibilityLabel={title} style={styles.title}>
                    {title}
                </Text>
                {children}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg },
    title: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm },
});
