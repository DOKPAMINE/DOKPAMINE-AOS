import { StyleSheet, Text, View } from 'react-native';

import { StateView } from '../components';
import { calendarDuration, monthlyTotalDuration, type GenreStat, type MonthlyStats } from '../domain/calendarRules';
import { colors, radii, sizes, spacing, typography } from '../theme';

/** S-62 요약 숫자 하나. 숫자와 라벨을 "총 독서시간 3시간 20분"처럼 한 요소로 읽는다. */
function SummaryItem({ label, value }: { label: string; value: string }) {
    return (
        <View accessible accessibilityRole="text" accessibilityLabel={`${label} ${value}`} style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{value}</Text>
            <Text style={styles.summaryLabel}>{label}</Text>
        </View>
    );
}

/** S-62 장르별 한 줄: 장르 이름 / 막대 / 시간. "소설, 2시간 10분"처럼 한 요소로 읽고 막대는 보조 기술에서 숨긴다. */
function GenreRow({ genre }: { genre: GenreStat }) {
    const duration = calendarDuration(genre.seconds);
    return (
        <View testID="genre-row" accessible accessibilityRole="text" accessibilityLabel={`${genre.label}, ${duration}`} style={styles.genreRow}>
            <Text style={styles.genreLabel}>{genre.label}</Text>
            <View testID="genre-bar-track" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={styles.barTrack}>
                <View testID="genre-bar-fill" style={[styles.barFill, { width: `${genre.ratio * 100}%` }]} />
            </View>
            <Text style={styles.genreValue}>{duration}</Text>
        </View>
    );
}

/** S-62 월간 통계 / FR-06: 요약 숫자 4개와 장르별 가로 막대 */
export function MonthlyStatistics({ title, stats }: { title: string; stats: MonthlyStats }) {
    return (
        <View testID="monthly-statistics" style={styles.statistics}>
            <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
            <View style={styles.summary}>
                <SummaryItem label="총 독서시간" value={monthlyTotalDuration(stats.totalSeconds)} />
                <SummaryItem label="완독" value={`${stats.completedBooks}권`} />
                <SummaryItem label="읽은 일수" value={`${stats.readingDayCount}일`} />
                <SummaryItem label="읽은 책" value={`${stats.booksReadCount}권`} />
            </View>
            <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.subheading}>장르별</Text>
                {stats.byGenre.length === 0
                    ? <StateView kind="empty" message="이 달에는 독서 기록이 없어요." />
                    : stats.byGenre.map(genre => <GenreRow key={genre.label} genre={genre} />)}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    statistics: { gap: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface.sandSoft, borderRadius: radii.card },
    heading: { ...typography.title, color: colors.brand.espresso, flexShrink: 1 },
    subheading: { ...typography.titleSmall, color: colors.brand.espresso },
    section: { gap: spacing.md },
    // 넓으면 한 줄에 4개, 좁으면(한 칸 최소 폭 3 × 44) 2×2로 줄바꿈한다. 높이를 고정하지 않아 큰 글자에서도 잘리지 않는다.
    summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    summaryItem: { flexGrow: 1, flexBasis: 0, minWidth: sizes.minTouch * 3, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
    summaryValue: { ...typography.heading, color: colors.brand.espresso, textAlign: 'center' },
    summaryLabel: { ...typography.bodySmall, color: colors.text.muted, textAlign: 'center' },
    genreRow: { minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    genreLabel: { ...typography.bodySmall, color: colors.brand.espresso, width: '28%' },
    barTrack: { flex: 1, height: spacing.md, borderRadius: radii.small, backgroundColor: colors.brand.sand, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: radii.small, backgroundColor: colors.text.muted },
    genreValue: { ...typography.label, color: colors.brand.espresso, width: '28%', textAlign: 'right' },
});
