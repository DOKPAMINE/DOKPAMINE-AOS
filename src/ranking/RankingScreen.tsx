import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { RankingEntry, WeeklyRankingResponse } from '../api/types';
import { Screen, SecondaryButton, StateView } from '../components';
import { rankingTimeLabel } from '../domain/rankingTime';
import { aroundEntries, myRankingEntry, podiumTone, rankingRowLabel } from '../domain/rankingView';
import { useWeeklyRanking } from './queries';
import { RankingError } from './RankingError';
import { styles, toneStyles } from './styles';

type Tab = 'top' | 'around';
const tabs: { value: Tab; label: string }[] = [{ value: 'top', label: 'Top 30' }, { value: 'around', label: '내 주변' }];

// AOS#126: 참여·중단은 설정(S-81)에서 한다. 랭킹 화면은 순위 보기에 집중한다.
// 순서: 제목 → [라운지로] → 폴더 탭 → 랭킹판(제목 줄·내 순위 고정, 안쪽 칸의 목록만 스크롤) → 안내 글.
export function RankingScreen() {
    const ranking = useWeeklyRanking();
    const data = ranking.data;
    const [tab, setTab] = useState<Tab>('top');
    return <Screen title="독서왕 랭킹" scroll={false}>
        <SecondaryButton label="라운지로" onPress={() => router.dismissTo('/(tabs)/lounge')} />
        <View style={styles.boardArea}>
            {/* 책갈피는 아래가 판 윗변에 붙어 위로 솟는다. */}
            <RankingTabs value={tab} onChange={setTab} />
            <View style={styles.book}>
                {/* 판 뒤 종이 두 장과 책등은 꾸밈이다. */}
                <View style={[styles.page, styles.pageBack]} pointerEvents="none" />
                <View style={[styles.page, styles.pageMiddle]} pointerEvents="none" />
                <View style={styles.board}>
                    <View style={styles.spine} pointerEvents="none" />
                    {/* 각 줄이 순위·닉네임·시간을 한 번에 읽으므로 제목 줄은 스크린리더에서 건너뛴다. */}
                    <View style={styles.columns} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <Text style={[styles.columnLabel, styles.rankColumn]}>순위</Text>
                        <Text style={[styles.columnLabel, styles.nicknameColumn]}>닉네임</Text>
                        <Text style={[styles.columnLabel, styles.timeColumn]}>독서 시간</Text>
                    </View>
                    {data && !ranking.isError && <View style={styles.mine}><MyRank data={data} /></View>}
                    <View style={styles.well}>
                        {ranking.isError ? <RankingError error={ranking.error} retry={() => { void ranking.refetch(); }} />
                            : !data ? <StateView kind="loading" />
                                : tab === 'top' ? <TopList entries={data.top} /> : <AroundList entries={aroundEntries(data)} />}
                    </View>
                </View>
            </View>
        </View>
        <View style={styles.notes}>
            <Text style={styles.note}>매주 월요일부터 일요일까지 타이머 독서 시간을 하루 최대 180분 집계해요. 수동 기록은 제외하며, 동점이면 먼저 달성한 분이 앞서요.</Text>
            {data && <Text style={styles.note}>{data.weekStart} 시작 주 · 한국 시간</Text>}
        </View>
    </Screen>;
}

function MyRank({ data }: { data: WeeklyRankingResponse }) {
    const mine = myRankingEntry(data);
    if (mine) return <RankingRow entry={mine} podium={false} label={`내 순위, ${rankingRowLabel(mine)}`} />;
    if (!data.participating) {
        const message = '아직 랭킹에 참여하지 않았어요. 눌러서 설정에서 참여할 수 있어요.';
        return <Pressable accessibilityRole="button" accessibilityLabel={message} accessibilityHint="설정 화면을 열어요"
            onPress={() => router.push('/settings')} style={({ pressed }) => [styles.notice, pressed && styles.pressed]}>
            <Text style={styles.noticeText}>{message}</Text>
        </Pressable>;
    }
    return <View style={styles.notice}>
        <Text style={styles.noticeText}>이번 주 집계된 타이머 독서 시간이 생기면 내 순위를 볼 수 있어요.</Text>
    </View>;
}

function RankingTabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
    return <View testID="ranking-tabs" accessibilityRole="tablist" style={styles.ribbons}>
        {tabs.map(tab => {
            const selected = tab.value === value;
            return <Pressable key={tab.value} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }}
                onPress={() => onChange(tab.value)} style={[styles.ribbon, selected && styles.ribbonSelected]}>
                <View style={styles.ribbonNotch} />
                <Text style={[styles.ribbonLabel, selected && styles.ribbonLabelSelected]}>{tab.label}</Text>
            </Pressable>;
        })}
    </View>;
}

function TopList({ entries }: { entries: RankingEntry[] }) {
    if (entries.length === 0) return <StateView kind="empty" message="이번 주 순위에 오른 독자가 아직 없어요." />;
    return <RankingList entries={entries} podium />;
}

function AroundList({ entries }: { entries: RankingEntry[] | null }) {
    if (entries === null) return <StateView kind="empty" message="마이 > 설정에서 랭킹에 참여하면 내 주변 순위를 볼 수 있어요" />;
    if (entries.length === 0) return <StateView kind="empty" message="이번 주 집계된 타이머 독서 시간이 생기면 내 주변 순위를 볼 수 있어요." />;
    // 내 주변 탭에서는 1~3위도 색 없이 일반 모양으로 보여 준다.
    return <RankingList entries={entries} podium={false} />;
}

function RankingList({ entries, podium }: { entries: RankingEntry[]; podium: boolean }) {
    return <ScrollView style={styles.listScroll} contentContainerStyle={styles.list} nestedScrollEnabled>
        {entries.map(entry => <RankingRow key={entry.userId} entry={entry} podium={podium} />)}
    </ScrollView>;
}

/**
 * 바깥 진한 선(outline) 안에 두꺼운 하얀 테두리(halo), 그 안에 카드가 있다. 내 줄만 두 테두리에 색이 있고,
 * 다른 줄은 같은 두께의 빈 테두리라 모든 줄의 크기가 같다. 내 줄은 화면 글자 대신 스크린리더 라벨 끝의 "나"로 알린다.
 */
function RankingRow({ entry, podium, label }: { entry: RankingEntry; podium: boolean; label?: string }) {
    const tone = podium ? podiumTone(entry.rank) : null;
    return <View accessible accessibilityLabel={label ?? rankingRowLabel(entry)} style={[styles.outline, entry.me && styles.outlineMine]}>
        <View testID="ranking-halo" style={[styles.halo, entry.me && styles.haloMine]}>
            <View testID="ranking-card" style={[styles.card, tone && toneStyles[tone].card]}>
                <View testID="ranking-rank" style={[styles.rankCell, tone && toneStyles[tone].rank]}>
                    {/* 화면에는 숫자만, 스크린리더는 줄 라벨로 "1위"라고 읽는다. */}
                    <Text style={styles.rank}>{entry.rank}</Text>
                </View>
                <Text style={[styles.nickname, styles.nicknameColumn, entry.me && styles.myName]} numberOfLines={1}>
                    {entry.nickname}
                </Text>
                <Text style={[styles.time, styles.timeColumn]}>{rankingTimeLabel(entry.seconds)}</Text>
            </View>
        </View>
    </View>;
}
