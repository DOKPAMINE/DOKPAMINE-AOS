import type { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme';

/**
 * action을 주면 제목과 같은 줄 오른쪽에 표시한다. onRefresh를 주면 아래로 당겨 새로고침할 수 있다.
 * 둘 다 주지 않으면 기존 화면과 똑같다.
 * keyboardShouldPersistTaps는 스크롤 영역에 그대로 넘긴다(기본 'never'). #124 키보드가 떠 있을 때 자동완성 목록이
 * 첫 터치에 눌리도록 S-70·S-71은 'handled'를 준다.
 */
export function Screen({ title, action, refreshing = false, onRefresh, keyboardShouldPersistTaps, children }: PropsWithChildren<{
    title: string; action?: ReactNode; refreshing?: boolean; onRefresh?: () => void;
    keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
}>) {
    const heading = (
        <Text accessibilityRole="header" accessibilityLabel={title} style={[styles.title, action ? styles.titleWithAction : null]}>
            {title}
        </Text>
    );
    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={keyboardShouldPersistTaps} refreshControl={onRefresh
                ? <RefreshControl accessibilityLabel={`${title} 새로고침`} refreshing={refreshing} onRefresh={onRefresh}
                    colors={[colors.brand.espresso]} tintColor={colors.brand.espresso} progressBackgroundColor={colors.surface.card} />
                : undefined}>
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
