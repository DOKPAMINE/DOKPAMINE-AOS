import type { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme';

/**
 * action을 주면 제목과 같은 줄 오른쪽에 표시한다. onRefresh를 주면 아래로 당겨 새로고침할 수 있다.
 * 둘 다 주지 않으면 기존 화면과 똑같다.
 * keyboardShouldPersistTaps는 스크롤 영역에 그대로 넘긴다(기본 'never'). #124 키보드가 떠 있을 때 자동완성 목록이
 * 첫 터치에 눌리도록 S-70·S-71은 'handled'를 준다.
 * scroll={false}이면 화면 전체를 스크롤하지 않고 남은 높이를 children에 나눠 준다. 화면 안의 한 영역만
 * 스크롤할 때 쓴다(AOS#126 S-73 랭킹판). 이때 onRefresh·keyboardShouldPersistTaps는 쓰지 않는다.
 */
export function Screen({ title, action, refreshing = false, onRefresh, keyboardShouldPersistTaps, scroll = true, children }: PropsWithChildren<{
    title: string; action?: ReactNode; refreshing?: boolean; onRefresh?: () => void;
    keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
    scroll?: boolean;
}>) {
    const heading = (
        <Text accessibilityRole="header" accessibilityLabel={title} style={[styles.title, action ? styles.titleWithAction : null]}>
            {title}
        </Text>
    );
    const top = action ? <View style={styles.header}>{heading}{action}</View> : heading;
    return (
        // 스크롤 없는 화면은 아래 내용이 Android 하단 버튼 바에 가리지 않도록 아래쪽 안전 영역도 비운다.
        <SafeAreaView style={styles.safeArea} edges={scroll ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}>
            {scroll ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={keyboardShouldPersistTaps} refreshControl={onRefresh
                ? <RefreshControl accessibilityLabel={`${title} 새로고침`} refreshing={refreshing} onRefresh={onRefresh}
                    colors={[colors.brand.espresso]} tintColor={colors.brand.espresso} progressBackgroundColor={colors.surface.card} />
                : undefined}>
                {top}
                {children}
            </ScrollView> : <View style={[styles.content, styles.fixed]}>
                {top}
                {children}
            </View>}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface.paper },
    content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg },
    fixed: { flex: 1 },
    title: { ...typography.heading, color: colors.brand.espresso, marginBottom: spacing.sm },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
    titleWithAction: { flex: 1, marginBottom: 0 },
});
