import type { RankingEntry, WeeklyRankingResponse } from '../../api/types';
import { aroundEntries, myRankingEntry, myRankingLabel, podiumTone, rankingRowLabel } from '../rankingView';

const entry = (rank: number, me = false): RankingEntry => ({ rank, userId: `u-${rank}`, nickname: `독서가 ${rank}`, seconds: 12000, me });
const top = (myRank?: number) => Array.from({ length: 30 }, (_, i) => entry(i + 1, i + 1 === myRank));
const response = (patch: Partial<WeeklyRankingResponse>): WeeklyRankingResponse =>
    ({ weekStart: '2026-11-23', participating: true, top: top(), around: [], ...patch });

test.each([[1, 'gold'], [2, 'sky'], [3, 'orange'], [4, null], [30, null]] as const)(
    'S-73 AOS#126 %i위의 줄 색은 %s예요', (rank, tone) => {
        expect(podiumTone(rank)).toBe(tone);
    });

test('S-73 AOS#126 참여하지 않았으면 내 순위와 내 주변 목록이 없어요', () => {
    const data = response({ participating: false });
    expect(myRankingEntry(data)).toBeNull();
    expect(aroundEntries(data)).toBeNull();
});

test('S-73 AOS#126 참여했지만 이번 주 기록이 없으면 내 순위가 없고 내 주변 목록은 비어 있어요', () => {
    const data = response({});
    expect(myRankingEntry(data)).toBeNull();
    expect(aroundEntries(data)).toEqual([]);
});

test('S-73 AOS#126 12위이면 내 주변 탭에 Top 30을 보여 줘요', () => {
    const data = response({ top: top(12) });
    expect(myRankingEntry(data)?.rank).toBe(12);
    expect(aroundEntries(data)).toBe(data.top);
});

test('S-73 AOS#126 38위이면 서버가 준 주변 30명을 보여 줘요', () => {
    const around = Array.from({ length: 30 }, (_, i) => entry(i + 16, i + 16 === 38));
    const data = response({ around });
    expect(myRankingEntry(data)?.rank).toBe(38);
    expect(aroundEntries(data)).toBe(around);
});

test('S-73 AOS#126 스크린리더는 순위, 닉네임, 시간, 나 순서로 읽어요', () => {
    expect(rankingRowLabel({ ...entry(1, true), seconds: 12000 })).toBe('1위, 독서가 1, 3시간 20분, 나');
    expect(rankingRowLabel(entry(4))).toBe('4위, 독서가 4, 3시간 20분');
});

test('S-73 AOS#126 고정된 내 순위 줄은 "내 순위"로 시작하고 "나"를 두 번 읽지 않아요', () => {
    expect(myRankingLabel({ ...entry(12, true), seconds: 12000 })).toBe('내 순위, 12위, 독서가 12, 3시간 20분');
});
