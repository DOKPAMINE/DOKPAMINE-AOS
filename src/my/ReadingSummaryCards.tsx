import { Text, View } from 'react-native';
import { Card, StateView } from '../components';
import { monthlyTotalDuration } from '../domain/calendarRules';
import type { GenreBookCount, ReadingStreak, ReadingTotals } from '../domain/readingSummary';
import { styles } from './styles';

/** S-80 연속 독서일. 카드 내용을 "7일 연속 독서 중, 최고 21일"처럼 한 요소로 읽는다. */
export function StreakCard({ streak }: { streak: ReadingStreak }) {
    const reading = streak.current > 0;
    const title = reading ? `${streak.current}일 연속 독서 중` : '연속 독서 0일';
    const best = `최고 ${streak.best}일`;
    const hint = reading ? null : '오늘 읽으면 1일째예요.';
    return <Card>
        <View testID="streak" accessible accessibilityRole="text" accessibilityLabel={[title, best, hint].filter(Boolean).join(', ')}
            style={styles.streak}>
            <Text style={styles.meta}>연속 독서일</Text>
            <View style={styles.streakLine}>
                <Text style={styles.streakValue}>{title}</Text>
                <Text style={styles.body}>· {best}</Text>
            </View>
            {hint && <Text style={styles.meta}>{hint}</Text>}
        </View>
    </Card>;
}

/** S-80 누적 숫자 하나. "총 독서시간 1시간 30분"처럼 한 요소로 읽는다. */
function SummaryItem({ label, value }: { label: string; value: string }) {
    return <View accessible accessibilityRole="text" accessibilityLabel={`${label} ${value}`} style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{value}</Text>
        <Text style={styles.summaryLabel}>{label}</Text>
    </View>;
}

/** S-80 장르별 한 줄: 장르 이름 / 막대 / 권수. "소설, 8권"처럼 한 요소로 읽고 막대는 보조 기술에서 숨긴다. */
function GenreRow({ genre }: { genre: GenreBookCount }) {
    const count = `${genre.books}권`;
    return <View testID="my-genre-row" accessible accessibilityRole="text" accessibilityLabel={`${genre.label}, ${count}`} style={styles.genreRow}>
        <Text style={styles.genreLabel}>{genre.label}</Text>
        <View testID="my-genre-bar-track" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={styles.barTrack}>
            <View testID="my-genre-bar-fill" style={[styles.barFill, { width: `${genre.ratio * 100}%` }]} />
        </View>
        <Text style={styles.genreValue}>{count}</Text>
    </View>;
}

/** S-80 누적 기록 "지금까지": 총 독서시간·읽은 책·완독과 장르별 권수 막대 */
export function TotalsCard({ totals }: { totals: ReadingTotals }) {
    return <Card>
        <Text accessibilityRole="header" style={styles.heading}>지금까지</Text>
        <View style={styles.summary}>
            <SummaryItem label="총 독서시간" value={monthlyTotalDuration(totals.totalSeconds)} />
            <SummaryItem label="읽은 책" value={`${totals.booksReadCount}권`} />
            <SummaryItem label="완독" value={`${totals.completedBooks}권`} />
        </View>
        {totals.byGenre.length === 0
            ? <StateView kind="empty" message="아직 독서 기록이 없어요." />
            : <View style={styles.genres}>
                <Text accessibilityRole="header" style={styles.subheading}>장르별</Text>
                {totals.byGenre.map(genre => <GenreRow key={genre.label} genre={genre} />)}
            </View>}
    </Card>;
}
