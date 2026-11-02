import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';
import { SecondaryButton } from './Button';

type StateKind = 'loading' | 'empty' | 'error' | 'offline';

export const stateMessages: Record<StateKind, string> = {
    loading: '잠시만 기다려 주세요. 불러오고 있어요.',
    empty: '아직 기록이 없어요. 독서 기록을 남겨 주세요.',
    error: '불러오지 못했어요. 다시 시도해 주세요.',
    offline: '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.',
};

export function StateView({ kind, message, onRetry }: { kind: StateKind; message?: string; onRetry?: () => void }) {
    const description = message ?? stateMessages[kind];

    return (
        <View style={styles.container}>
            {kind === 'loading' && <ActivityIndicator accessible={false} color={colors.text.muted} />}
            <Text
                accessibilityRole={kind === 'error' ? 'alert' : 'text'}
                accessibilityLabel={description}
                accessibilityLiveRegion="polite"
                style={[styles.message, kind === 'error' && styles.error]}
            >
                {description}
            </Text>
            {onRetry && <SecondaryButton label="다시 시도해 주세요" onPress={onRetry} />}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { gap: spacing.lg, paddingVertical: spacing.xl },
    message: { ...typography.bodySmall, color: colors.text.muted, textAlign: 'center' },
    error: { color: colors.state.error },
});
