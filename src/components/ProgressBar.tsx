import { StyleSheet, Text, View } from 'react-native';

import { readingProgress } from '../domain/readingProgress';
import { colors, radii, sizes, spacing, typography } from '../theme';

export function ProgressBar({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
    const { label, ratio } = readingProgress(currentPage, totalPages);

    return (
        <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="독서 진행"
            accessibilityValue={{ text: label }}
            style={styles.track}
        >
            <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
            <Text style={styles.label}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    track: { minHeight: sizes.progress, borderRadius: radii.small, overflow: 'hidden', backgroundColor: colors.brand.sand, justifyContent: 'center' },
    fill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.text.muted },
    label: { ...typography.caption, color: colors.brand.espresso, textAlign: 'center', padding: spacing.sm },
});
