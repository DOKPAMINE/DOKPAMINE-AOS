import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radii, typography } from '../theme';

export interface DayCoverBook {
    readonly uri: string | null;
    /** 기본 표지에 보여 줄 제목. 책을 찾지 못하면 "찾을 수 없는 책" */
    readonly title: string;
}

const titleLineHeight = typography.footnote.lineHeight ?? typography.footnote.fontSize ?? 1;
// 가장 좁은 칸(최소 터치 44)의 표지 영역 높이에 들어가는 줄 수. 실제 높이를 재기 전에 쓴다.
const minimumTitleLines = 3;

/**
 * S-60 캘린더 전용 표지. 칸이 작으므로 공통 BookCover와 달리 장르 글자 없이 영역을 채우고,
 * 표지가 없거나 불러오지 못하면(오프라인 포함) 기본 표지 색 위에 제목을 들어가는 줄 수만큼 보여 준다.
 */
function DayCover({ uri, title, divided }: DayCoverBook & { divided: boolean }) {
    const [failed, setFailed] = useState(false);
    const [lines, setLines] = useState(minimumTitleLines);
    if (uri && !failed) {
        return <Image testID="calendar-cover-image" source={{ uri }} accessible={false} importantForAccessibility="no"
            resizeMode="cover" onError={() => setFailed(true)} style={[styles.part, divided && styles.divided]} />;
    }
    return <View testID="calendar-cover-default" accessible={false} importantForAccessibility="no-hide-descendants"
        onLayout={({ nativeEvent }) => setLines(Math.max(1, Math.floor(nativeEvent.layout.height / titleLineHeight)))}
        style={[styles.part, styles.fallback, divided && styles.divided]}>
        {/* 글자 확대를 막아 계산한 줄 수가 칸 높이를 넘지 않게 한다. 제목은 칸 라벨로 전달된다. */}
        <Text testID="calendar-cover-title" accessible={false} importantForAccessibility="no" numberOfLines={lines}
            ellipsizeMode="tail" maxFontSizeMultiplier={1} style={styles.title}>{title}</Text>
    </View>;
}

/**
 * S-60: 날짜 숫자 아래 2:3 표지 영역. 기록이 없으면 빈 영역으로 같은 줄 칸과 높이를 맞춘다.
 * 칸의 accessibilityLabel에 모든 책 제목이 들어가므로 표지와 "+남은 권수"는 보조 기술에서 건너뛴다.
 */
export function DayCovers({ covers, remaining }: { covers: readonly DayCoverBook[]; remaining: number }) {
    return (
        <>
            <View testID="calendar-cover-area" accessible={false} importantForAccessibility="no-hide-descendants"
                style={[styles.area, covers.length > 0 && styles.filled]}>
                {covers.map((cover, index) => (
                    <DayCover key={`${index}-${cover.uri ?? 'none'}`} uri={cover.uri} title={cover.title} divided={index > 0} />
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
    fallback: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    // 좌우 반씩 나눈 칸 사이를 배경색 선으로 구분한다.
    divided: { borderLeftWidth: 1, borderLeftColor: colors.surface.paper },
    title: { ...typography.footnote, color: colors.brand.espresso, textAlign: 'center', alignSelf: 'stretch' },
    remaining: { ...typography.caption, color: colors.text.muted, textAlign: 'center' },
});
