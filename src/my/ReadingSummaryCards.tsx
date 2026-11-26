import { Fragment } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View, useWindowDimensions } from 'react-native';
import { Card, StateView } from '../components';
import { monthlyTotalDuration } from '../domain/calendarRules';
import type { GenreBookCount, ReadingStreak, ReadingTotals } from '../domain/readingSummary';
import { colors, sizes } from '../theme';
import { MySection } from './MySection';
import { styles } from './styles';

/**
 * S-80 연속 독서일. 닉네임 카드 안에 두고 "3일 연속 독서 중, 최고 기록 3일"처럼 한 요소로 읽는다.
 * 연속 0일이면 "연속 독서 0일"과 최고 기록만 보여 준다.
 * 불꽃 아이콘은 꾸밈이라 보조 기술에서 숨기고, 큰 글자에서는 글자와 함께 커진다.
 */
export function StreakSummary({ streak }: { streak: ReadingStreak }) {
    const { fontScale } = useWindowDimensions();
    const title = streak.current > 0 ? `${streak.current}일 연속 독서 중` : '연속 독서 0일';
    const best = `최고 기록 ${streak.best}일`;
    return <View testID="streak" accessible accessibilityRole="text" accessibilityLabel={`${title}, ${best}`}
        style={styles.streak}>
        <View style={styles.streakLine}>
            <MaterialCommunityIcons testID="streak-icon" name="fire" size={Math.round(sizes.icon * fontScale)} color={colors.brand.camel}
                accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            <Text style={styles.streakValue}>{title}</Text>
        </View>
        <Text testID="streak-best" style={styles.streakBest}>{best}</Text>
    </View>;
}

/** S-80 누적 숫자 하나. "총 독서시간 1시간 30분"처럼 한 요소로 읽는다. 큰 글자에서는 칸 폭을 유지한 채 줄바꿈한다. */
function SummaryItem({ label, value }: { label: string; value: string }) {
    return <View accessible accessibilityRole="text" accessibilityLabel={`${label} ${value}`} style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{value}</Text>
        <Text style={styles.summaryLabel}>{label}</Text>
    </View>;
}

/** S-80 "지금까지" 칸의 내용: 총 독서시간·읽은 책·완독을 같은 폭 3칸에 세로 구분선으로 나눠 보여 준다. */
function TotalsSummary({ totals }: { totals: ReadingTotals }) {
    const items = [
        { label: '총 독서시간', value: monthlyTotalDuration(totals.totalSeconds) },
        { label: '읽은 책', value: `${totals.booksReadCount}권` },
        { label: '완독', value: `${totals.completedBooks}권` },
    ];
    return <View style={styles.summary}>
        {items.map((item, index) => <Fragment key={item.label}>
            {index > 0 && <View testID="summary-divider" style={styles.summaryDivider} />}
            <SummaryItem label={item.label} value={item.value} />
        </Fragment>)}
    </View>;
}

/**
 * S-80 장르별 한 줄: 장르 이름 / 막대 / 권수. "소설, 8권"처럼 한 요소로 읽고 막대는 보조 기술에서 숨긴다.
 * 이름 칸과 권수 칸은 모든 줄에서 같은 폭이라 막대의 시작과 끝이 같은 세로선에 맞는다.
 * 권수 칸은 글자 크기 배율만큼 넓혀 큰 글자에서도 잘리지 않는다(글자 폭을 재지 않는다).
 */
function GenreRow({ genre, countWidth }: { genre: GenreBookCount; countWidth: number }) {
    const count = `${genre.books}권`;
    return <View testID="my-genre-row" accessible accessibilityRole="text" accessibilityLabel={`${genre.label}, ${count}`} style={styles.genreRow}>
        <Text testID="my-genre-label" numberOfLines={1} ellipsizeMode="tail" style={styles.genreLabel}>{genre.label}</Text>
        <View testID="my-genre-bar-track" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={styles.barTrack}>
            <View testID="my-genre-bar-fill" style={[styles.barFill, { width: `${genre.ratio * 100}%` }]} />
        </View>
        <Text testID="my-genre-count" numberOfLines={1} style={[styles.genreValue, { width: countWidth }]}>{count}</Text>
    </View>;
}

/**
 * S-80 "나의 독서" 카드: 안쪽 칸(MySection) "지금까지"와 "장르별"을 위아래로 둔다.
 * 읽은 책이 없으면 "지금까지" 칸과 빈 안내만 보여 주고 장르별 칸은 두지 않는다.
 * 새 칸(예: 좋아요한 감상)은 이 카드 안에 <MySection title=… action={…}>…</MySection>을 하나 더 넣으면 된다.
 */
export function MyReadingCard({ totals }: { totals: ReadingTotals }) {
    const { fontScale } = useWindowDimensions();
    // 권수 칸: 기본 글자(typography.label 14)에서 "999권"까지 들어가는 sizes.minTouch(44)를 글자 배율만큼 키운다.
    const countWidth = Math.ceil(sizes.minTouch * fontScale);
    return <Card>
        <View testID="my-reading" style={styles.readingCard}>
            <Text accessibilityRole="header" style={styles.heading}>나의 독서</Text>
            <MySection testID="my-section-totals" title="지금까지">
                <TotalsSummary totals={totals} />
            </MySection>
            {totals.byGenre.length === 0
                ? <StateView kind="empty" message="아직 독서 기록이 없어요." />
                : <MySection testID="my-section-genres" title="장르별">
                    <View style={styles.genres}>
                        {totals.byGenre.map(genre => <GenreRow key={genre.label} genre={genre} countWidth={countWidth} />)}
                    </View>
                </MySection>}
        </View>
    </Card>;
}
