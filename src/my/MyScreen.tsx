import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Card, Screen, SecondaryButton, StateView } from '../components';
import { calendarDuration, monthlyStats } from '../domain/calendarRules';
import { kstDate } from '../domain/kstDate';
import { useMyProfile } from './useMyProfile';
import { useMyRecords } from './useMyRecords';
import { styles } from './styles';

export function MyScreen() {
    const { state: account, retry: retryProfile } = useMyProfile();
    const { records, retry } = useMyRecords();
    const stats = records.kind === 'ready' ? monthlyStats(records.sessions, records.books, kstDate(records.now).slice(0, 7)) : null;
    return <Screen title="마이">
        <Card>
            <Text style={styles.heading}>{account.kind === 'ready' && account.profile ? `${account.profile.nickname}님` : '나의 독서 생활'}</Text>
            {account.kind === 'loading' && <StateView kind="loading" />}
            {account.kind === 'error' && <StateView kind="error" message="계정 정보를 불러오지 못했어요." onRetry={retryProfile} />}
            {account.kind === 'ready' && account.offline && <StateView kind="offline" />}
            {account.kind === 'ready' && account.failed && <StateView kind="error" message="계정 정보를 새로 불러오지 못했어요." onRetry={retryProfile} />}
        </Card>
        <Card>
            <Text accessibilityRole="header" style={styles.heading}>이번 달 독서</Text>
            {records.kind !== 'ready' && <StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} />}
            {stats && <>
                <Text style={styles.meta}>{stats.month} · 한국 시간 기준</Text>
                <View style={styles.row}><Text style={styles.body}>독서 시간</Text><Text style={styles.body}>{calendarDuration(stats.totalSeconds)}</Text></View>
                <View style={styles.row}><Text style={styles.body}>읽은 쪽수</Text><Text style={styles.body}>{stats.totalPages}쪽</Text></View>
                <View style={styles.row}><Text style={styles.body}>완독</Text><Text style={styles.body}>{stats.completedBooks}권</Text></View>
            </>}
        </Card>
        <Card>
            <Text accessibilityRole="header" style={styles.heading}>동기화 상태</Text>
            {records.kind === 'ready' ? <Text accessibilityLiveRegion="polite" style={styles.body}>전송 대기 {records.pendingCount}건</Text>
                : <Text style={styles.meta}>기록을 불러오면 전송 대기 건수를 확인할 수 있어요.</Text>}
        </Card>
        <SecondaryButton label="설정" onPress={() => router.push('/settings')} />
    </Screen>;
}
