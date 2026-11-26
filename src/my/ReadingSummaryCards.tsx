import { Fragment } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View, useWindowDimensions } from 'react-native';
import { Card, StateView } from '../components';
import { monthlyTotalDuration } from '../domain/calendarRules';
import type { GenreBookCount, ReadingStreak, ReadingTotals } from '../domain/readingSummary';
import { colors, sizes } from '../theme';
import { styles } from './styles';

/**
 * S-80 연속 독서일. 닉네임 카드 안에 두고 "3일 연속 독서 중, 최고 기록 3일"처럼 한 요소로 읽는다.
 * 불꽃 아이콘은 꾸밈이라 보조 기술에서 숨기고, 큰 글자에서는 글자와 함께 커진다.
 */
export function StreakSummary({ streak }: { streak: ReadingStreak }) {
    const { fontScale } = useWindowDimensions();
    const reading = streak.current > 0;
    const title = reading ? `${streak.current}일 연속 독서 중` : '연속 독서 0일';
    const best = `최고 기록 ${streak.best}일`;
    const hint = reading ? null : '오늘 읽으면 1일째예요.';
    return <View testID="streak" accessible accessibilityRole="text" accessibilityLabel={[title, best, hint].filter(Boolean).join(', ')}
        style={styles.streak}>
        <View style={styles.streakLine}>
            <MaterialCommunityIcons testID="streak-icon" name="fire" size={Math.round(sizes.icon * fontScale)} color={colors.brand.camel}
                accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            <Text style={styles.streakValue}>{title}</Text>
        </View>
        <Text style={styles.meta}>{best}</Text>
        {hint && <Text style={styles.meta}>{hint}</Text>}
    </View>;
}

/** S-80 누적 숫자 하나. "총 독서시간 1시간 30분"처럼 한 요소로 읽는다. 큰 글자에서는 칸 폭을 유지한 채 줄바꿈한다. */
function SummaryItem({ label, value }: { label: string; value: string }) {
    return <View accessible accessibilityRole="text" accessibilityLabel={`${label} ${value}`} style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{value}</Text>
        <Text style={styles.summaryLabel}>{label}</Text>
    </View>;
}

/** S-80 누적 기록 "지금까지": 총 독서시간·읽은 책·완독을 같은 폭 3칸에 세로 구분선으로 나눠 보여 준다. */
export function TotalsCard({ totals }: { totals: ReadingTotals }) {
    const items = [
        { label: '총 독서시간', value: monthlyTotalDuration(totals.totalSeconds) },
        { label: '읽은 책', value: `${totals.booksReadCount}권` },
        { label: '완독', value: `${totals.completedBooks}권` },
    ];
    return <Card>
        <Text accessibilityRole="header" style={styles.heading}>지금까지</Text>
        <View style={styles.summary}>
            {items.map((item, index) => <Fragment key={item.label}>
                {index > 0 && <View testID="summary-divider" style={styles.summaryDivider} />}
                <SummaryItem label={item.label} value={item.value} />
            </Fragment>)}
        </View>
        {totals.byGenre.length === 0 && <StateView kind="empty" message="아직 독서 기록이 없어요." />}
    </Card>;
}

/** S-80 장르별 한 줄: 장르 이름 / 막대 / 권수. "소설, 8권"처럼 한 요소로 읽고 막대는 보조 기술에서 숨긴다. */
function GenreRow({ genre }: { genre: GenreBookCount }) {
    const count = `${genre.books}권`;
    return <View testID="my-genre-row" accessible accessibilityRole="text" accessibilityLabel={`${genre.label}, ${count}`} style={styles.genreRow}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.genreLabel}>{genre.label}</Text>
        <View testID="my-genre-bar-track" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={styles.barTrack}>
            <View testID="my-genre-bar-fill" style={[styles.barFill, { width: `${genre.ratio * 100}%` }]} />
        </View>
        <Text style={styles.genreValue}>{count}</Text>
    </View>;
}

/** S-80 장르별 권수 막대 카드. 읽은 책이 없으면 표시하지 않는다(빈 안내는 누적 기록 카드에 있다). */
export function GenreCard({ byGenre }: { byGenre: readonly GenreBookCount[] }) {
    return <Card>
        <Text accessibilityRole="header" style={styles.subheading}>장르별</Text>
        <View style={styles.genres}>
            {byGenre.map(genre => <GenreRow key={genre.label} genre={genre} />)}
        </View>
    </Card>;
}
