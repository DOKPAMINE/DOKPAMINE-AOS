import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radii, typography } from '../theme';

/**
 * S-60 캘린더 전용 표지. 칸이 작으므로 공통 BookCover와 달리 장르 글자 없이 영역을 채우고,
 * 표지가 없거나 불러오지 못하면(오프라인 포함) 기본 표지 색으로 채운다.
 */
function DayCover({ uri, divided }: { uri: string | null; divided: boolean }) {
    const [failed, setFailed] = useState(false);
    if (uri && !failed) {
        return <Image testID="calendar-cover-image" source={{ uri }} accessible={false} importantForAccessibility="no"
            resizeMode="cover" onError={() => setFailed(true)} style={[styles.part, divided && styles.divided]} />;
    }
    return <View testID="calendar-cover-default" accessible={false} importantForAccessibility="no"
        style={[styles.part, divided && styles.divided]} />;
}

/**
 * S-60: 날짜 숫자 아래 2:3 표지 영역. 기록이 없으면 빈 영역으로 같은 줄 칸과 높이를 맞춘다.
 * 칸의 accessibilityLabel에 모든 책 제목이 들어가므로 표지와 "+남은 권수"는 보조 기술에서 건너뛴다.
 */
export function DayCovers({ covers, remaining }: { covers: readonly (string | null)[]; remaining: number }) {
    return (
        <>
            <View testID="calendar-cover-area" accessible={false} importantForAccessibility="no-hide-descendants"
                style={[styles.area, covers.length > 0 && styles.filled]}>
                {covers.map((uri, index) => (
                    <DayCover key={`${index}-${uri ?? 'none'}`} uri={uri} divided={index > 0} />
                ))}
            </View>
            {remaining > 0 && (
                <Text accessible={false} importantForAccessibility="no" style={styles.remaining}>{`+${remaining}`}</Text>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    area: { width: '100%', aspectRatio: 2 / 3, flexDirection: 'row' },
    filled: { borderRadius: radii.small, overflow: 'hidden' },
    part: { flex: 1, height: '100%', backgroundColor: colors.brand.sand },
    // 좌우 반씩 나눈 칸 사이를 배경색 선으로 구분한다.
    divided: { borderLeftWidth: 1, borderLeftColor: colors.surface.paper },
    remaining: { ...typography.caption, color: colors.text.muted, textAlign: 'center' },
});
