import type { RankingEntry, WeeklyRankingResponse } from '../api/types';
import { rankingTimeLabel } from './rankingTime';

/** S-73 · AOS#126: Top 30 탭에서 배경을 채우는 1~3위 색 이름. 4위부터는 없다. */
export type PodiumTone = 'gold' | 'sky' | 'orange';

export function podiumTone(rank: number): PodiumTone | null {
    return rank === 1 ? 'gold' : rank === 2 ? 'sky' : rank === 3 ? 'orange' : null;
}

/** S-73: 이번 주 내 순위 항목. Top 30과 주변 30명 중 `me`인 항목이며, 참여하지 않았거나 기록이 없으면 null이다. */
export function myRankingEntry(data: WeeklyRankingResponse): RankingEntry | null {
    return data.top.find(entry => entry.me) ?? data.around.find(entry => entry.me) ?? null;
}

/**
 * S-73 · AOS#126 [내 주변] 탭 목록.
 * - 참여하지 않았으면 null(참여 안내를 보여 준다).
 * - 서버가 주변 30명을 주면(31위 이하) 그대로 쓴다.
 * - 30위 이내면 서버가 `around=[]`를 주므로 Top 30을 쓴다.
 * - 참여했지만 이번 주 기록이 없으면 빈 목록이다.
 */
export function aroundEntries(data: WeeklyRankingResponse): RankingEntry[] | null {
    if (!data.participating) return null;
    if (data.around.length > 0) return data.around;
    return data.top.some(entry => entry.me) ? data.top : [];
}

/** S-73: 스크린리더가 한 줄을 "1위, 닉네임, 3시간 20분, 나"처럼 읽는다. */
export function rankingRowLabel(entry: RankingEntry): string {
    return [`${entry.rank}위`, entry.nickname, rankingTimeLabel(entry.seconds), ...(entry.me ? ['나'] : [])].join(', ');
}

/** S-73: 고정된 내 순위 줄은 "내 순위"로 시작하므로 끝에 "나"를 다시 붙이지 않는다. */
export function myRankingLabel(entry: RankingEntry): string {
    return ['내 순위', `${entry.rank}위`, entry.nickname, rankingTimeLabel(entry.seconds)].join(', ');
}
