import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme';

/** action을 주면 제목과 같은 줄 오른쪽에 표시한다. 주지 않으면 기존 화면과 똑같다. */
export function Screen({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
    const heading = (
        <Text accessibilityRole="header" accessibilityLabel={title} style={[styles.title, action ? styles.titleWithAction : null]}>
            {title}
        </Text>
    );
    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={styles.content}>
                {action ? <View style={styles.header}>{heading}{action}</View> : heading}
                {children}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface.paper },
    content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg },
    title: { ...typography.heading, color: colors.brand.espresso, marginBottom: spacing.sm },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
    titleWithAction: { flex: 1, marginBottom: 0 },
});
