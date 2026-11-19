import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

/**
 * S-10·S-31: 앞표지가 있으면 사진을, 없거나 불러오지 못하면(오프라인 포함) 기본 표지를 2:3 비율로 보여 준다.
 * 표지는 장식이므로 보조 기술에서는 건너뛰고, 책 정보는 주변 라벨로 전달한다.
 */
export function BookCover({ uri, genre, width }: { uri: string | null; genre: string; width: number }) {
    const [failed, setFailed] = useState(false);
    const size = { width, height: Math.round(width * 1.5) };
    if (uri && !failed) {
        return <Image testID="book-cover-image" source={{ uri }} accessible={false} resizeMode="cover"
            onError={() => setFailed(true)} style={[styles.cover, size]} />;
    }
    return <View testID="book-cover-default" accessible={false} style={[styles.cover, styles.fallback, size]}>
        <Text accessible={false} importantForAccessibility="no" numberOfLines={2} style={styles.genre}>{genre}</Text>
    </View>;
}

const styles = StyleSheet.create({
    cover: { borderRadius: radii.small, backgroundColor: colors.brand.sand },
    fallback: { justifyContent: 'center', alignItems: 'center', padding: spacing.xs, borderLeftWidth: spacing.xs, borderLeftColor: colors.text.muted },
    genre: { ...typography.caption, color: colors.brand.espresso, textAlign: 'center' },
});
