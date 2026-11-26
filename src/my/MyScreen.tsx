import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card, Screen, SecondaryButton, StateView } from '../components';
import { kstDate } from '../domain/kstDate';
import { readingStreak, readingTotals } from '../domain/readingSummary';
import { colors, sizes } from '../theme';
import { GenreCard, StreakSummary, TotalsCard } from './ReadingSummaryCards';
import { useMyProfile } from './useMyProfile';
import { useMyRecords } from './useMyRecords';
import { styles } from './styles';

export function MyScreen() {
    const { state: account, retry: retryProfile } = useMyProfile();
    const { records, retry } = useMyRecords();
    const hasSyncIssues = records.kind === 'ready' && (records.conflictBooks.length > 0 || records.rejections.length > 0);
    const totals = records.kind === 'ready' ? readingTotals(records.sessions, records.books) : null;
    // S-80 → S-81: 설정은 제목 오른쪽 아이콘 버튼으로 연다. 아이콘은 꾸밈이라 숨기고 버튼 라벨 "설정"으로 읽는다.
    const settings = <Pressable testID="my-settings" accessibilityRole="button" accessibilityLabel="설정" onPress={() => router.push('/settings')}
        style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsPressed]}>
        <MaterialCommunityIcons name="cog-outline" size={sizes.icon} color={colors.brand.espresso} accessible={false} />
    </Pressable>;
    return <Screen title="마이" action={settings}>
        <Card>
            <Text style={styles.heading}>{account.kind === 'ready' && account.profile ? `${account.profile.nickname}님` : '나의 독서 생활'}</Text>
            {account.kind === 'loading' && <StateView kind="loading" />}
            {account.kind === 'error' && <StateView kind="error" message="계정 정보를 불러오지 못했어요." onRetry={retryProfile} />}
            {account.kind === 'ready' && account.offline && <StateView kind="offline" />}
            {account.kind === 'ready' && account.failed && <StateView kind="error" message="계정 정보를 새로 불러오지 못했어요." onRetry={retryProfile} />}
            {records.kind === 'ready' && <StreakSummary streak={readingStreak(records.sessions, records.books, kstDate(records.now))} />}
        </Card>
        {totals ? <>
            <TotalsCard totals={totals} />
            {totals.byGenre.length > 0 && <GenreCard byGenre={totals.byGenre} />}
        </> : <Card><StateView kind={records.kind === 'error' ? 'error' : 'loading'} onRetry={records.kind === 'error' ? retry : undefined} /></Card>}
        {/* NFR-04: 동기화 문제는 평소에 숨기고 감상 충돌·서버 거절이 있을 때만 경고 카드로 알린다. */}
        {records.kind === 'ready' && hasSyncIssues && <View testID="sync-issues" style={styles.warningCard}>
            <Text accessibilityRole="header" style={styles.warningHeading}>동기화를 확인해 주세요</Text>
            {records.conflictBooks.map(book => <SecondaryButton key={book.id}
                label={`${book.title} · 감상 충돌 확인`}
                onPress={() => router.push({ pathname: '/book/[id]/review', params: { id: book.id } })} />)}
            {records.rejections.map(issue => <View key={issue.key} style={styles.warningItem}>
                <Text accessibilityRole="alert" style={styles.body}>{issue.message}</Text>
                <Text style={styles.meta}>입력 내용을 보존했어요. 수정한 뒤 다시 동기화해요.</Text>
                <SecondaryButton label={`${records.books.find(book => book.id === issue.bookId)?.title ?? '책'} · ${issue.kind === 'book' ? '책 정보 수정' : '기록 시간·쪽수 수정'}`}
                    onPress={() => issue.kind === 'book'
                        ? router.push({ pathname: '/book/[id]/edit', params: { id: issue.bookId } })
                        : router.push({ pathname: '/book/[id]/records/[recordId]', params: { id: issue.bookId, recordId: issue.recordId } })} />
            </View>)}
        </View>}
    </Screen>;
}
