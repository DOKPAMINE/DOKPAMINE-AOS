import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { readingProgress } from '../domain/readingProgress';
import { colors, radii, sizes, spacing, typography } from '../theme';

export function ProgressBar({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
    const { label, ratio } = readingProgress(currentPage, totalPages);
    const [trackWidth, setTrackWidth] = useState(0);

    return (
        <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="독서 진행"
            accessibilityValue={{ text: label }}
            onLayout={({ nativeEvent }) => setTrackWidth(nativeEvent.layout.width)}
            style={styles.track}
        >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text accessible={false} style={styles.label}>{label}</Text>
            </View>
            <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                style={[styles.fill, { width: `${ratio * 100}%` }]}
            >
                {/* 같은 전체 너비로 정렬한 글자를 채운 부분에서만 밝게 보여 줍니다. 너비를 재기 전에는 0 너비 줄바꿈을 막기 위해 그리지 않습니다. */}
                {trackWidth > 0 && (
                    <Text accessible={false} style={[styles.label, styles.filledLabel, { width: trackWidth }]}>{label}</Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    track: { minHeight: sizes.progress, borderRadius: radii.small, overflow: 'hidden', backgroundColor: colors.brand.sand, justifyContent: 'center' },
    fill: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden', justifyContent: 'center', backgroundColor: colors.text.muted },
    label: { ...typography.caption, color: colors.brand.espresso, textAlign: 'center', padding: spacing.sm },
    filledLabel: { color: colors.surface.paper },
});
