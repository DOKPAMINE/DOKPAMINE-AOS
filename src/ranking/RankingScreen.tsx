import { router } from 'expo-router';
import { Text, View } from 'react-native';
import type { RankingEntry } from '../api/types';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { rankingTimeLabel } from '../domain/rankingTime';
import { useWeeklyRanking } from './queries';
import { RankingError } from './RankingError';
import { styles } from './styles';

export function RankingScreen() {
    const ranking = useWeeklyRanking();
    const data = ranking.data;
    return <Screen title="독서왕 랭킹">
        <SecondaryButton label="라운지로" onPress={() => router.dismissTo('/(tabs)/lounge')} />
        <Text style={styles.secondary}>매주 월요일부터 일요일까지 타이머 독서 시간을 하루 최대 180분 집계해요. 수동 기록은 제외하며, 동점이면 먼저 달성한 분이 앞서요.</Text>
        {ranking.isError ? <RankingError error={ranking.error} retry={() => { void ranking.refetch(); }} />
            : !data ? <StateView kind="loading" /> : <>
                <Text style={styles.body}>{data.weekStart} 시작 주 · 한국 시간</Text>
                {data.participating ? <>
                    <Text style={styles.body}>랭킹에 참여 중이에요.</Text>
                    <SecondaryButton label="참여 중단" onPress={() => router.push('/ranking/withdraw')} />
                </> : <>
                    <Text style={styles.body}>아직 랭킹에 참여하지 않았어요. 동의하시면 닉네임·순위·독서 시간이 공개돼요.</Text>
                    <PrimaryButton label="랭킹 참여 안내" onPress={() => router.push('/ranking/consent')} />
                </>}
                <View style={styles.section}>
                    <Text accessibilityRole="header" style={styles.heading}>전체 1~30위</Text>
                    {data.top.length === 0 ? <StateView kind="empty" message="이번 주 순위에 오른 독자가 아직 없어요." />
                        : data.top.map(entry => <RankingRow key={entry.userId} entry={entry} />)}
                </View>
                {data.around.length > 0 && <View style={styles.divider}>
                    <Text accessibilityRole="header" style={styles.heading}>내 순위 주변 30명</Text>
                    {data.around.map(entry => <RankingRow key={entry.userId} entry={entry} />)}
                </View>}
                {data.participating && ![...data.top, ...data.around].some(entry => entry.me)
                    && <Text style={styles.secondary}>이번 주 집계된 타이머 독서 시간이 생기면 내 순위를 볼 수 있어요.</Text>}
            </>}
    </Screen>;
}

function RankingRow({ entry }: { entry: RankingEntry }) {
    return <View style={[styles.row, entry.me && styles.mine]}>
        <View style={styles.identity}>
            <Text style={styles.body}>{entry.rank}위</Text>
            <Text style={[styles.nickname, entry.me && styles.myName]}>{entry.nickname}{entry.me ? ' · 나' : ''}</Text>
        </View>
        <Text style={styles.time}>{rankingTimeLabel(entry.seconds)}</Text>
    </View>;
}
