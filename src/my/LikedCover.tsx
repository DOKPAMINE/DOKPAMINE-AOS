import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme';

/**
 * #132 FR-09 S-80 좋아요한 감상 표지. 좋아요한 책 묶음에는 장르가 없어 BookCover의 기본 표지가 글자 없이 빈 칸으로 보인다.
 * 그래서 표지 사진이 없거나 불러오지 못하면(오프라인 포함) BookCover와 같은 크기·반경·바탕의 칸 가운데에 책 아이콘을 둔다.
 * 표지는 장식이므로 사진·칸·아이콘 모두 보조 기술에서 건너뛰고, 책 정보는 주변 라벨로 전달한다.
 */
export function LikedCover({ uri, width }: { uri?: string | null; width: number }) {
    const [failed, setFailed] = useState(false);
    const size = { width, height: Math.round(width * 1.5) };
    if (uri && !failed) {
        return <Image testID="liked-cover-image" source={{ uri }} accessible={false} resizeMode="cover"
            onError={() => setFailed(true)} style={[styles.cover, size]} />;
    }
    return <View testID="liked-cover-default" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.cover, styles.fallback, size]}>
        <MaterialCommunityIcons testID="liked-cover-icon" name="book-outline" size={Math.round(width * 0.6)} color={colors.text.muted}
            accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
    </View>;
}

const styles = StyleSheet.create({
    // BookCover와 같은 반경·바탕이다.
    cover: { borderRadius: radii.small, backgroundColor: colors.brand.sand },
    fallback: { justifyContent: 'center', alignItems: 'center' },
});
