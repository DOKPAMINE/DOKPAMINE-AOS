import { kstDate } from './kstDate';

/** #113 S-70: 박스 제목은 "닉네임 · 『책 제목』"이다. */
export function loungeBoxHeading(nickname: string, bookTitle: string): string {
    return `${nickname} · 『${bookTitle}』`;
}

/**
 * #113 S-70 S-76: 독후감을 쓴 날(서버의 bodyWrittenAt)을 기기 시간대와 관계없이 KST 날짜로 보여 준다.
 * 화면 문구는 "2026. 11. 25.", 스크린리더는 "2026년 11월 25일"로 읽는다. 시각이 없거나 읽을 수 없으면 null이다.
 */
export function writtenDate(iso: string | null | undefined): { text: string; label: string } | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    const [year, month, day] = kstDate(ms).split('-').map(Number);
    return { text: `${year}. ${month}. ${day}.`, label: `${year}년 ${month}월 ${day}일` };
}

const filled = (text: string | null | undefined) => typeof text === 'string' && text.trim().length > 0;

/**
 * #113 S-76: 한 사람이 한 책에 쓴 공개 감상을 한줄평과 독후감으로 나눈다. 각 묶음 안은 서버 순서를 그대로 둔다.
 * 좋아요는 감상마다 하나라, 한줄평과 독후감이 함께 든 예전 감상은 독후감에만 한 번 넣고 카드에 한줄평을 함께 보여 준다.
 * 둘 다 비어 있는 감상은 보여 줄 내용이 없어 뺀다.
 */
export function splitUserBookReviews<T extends { oneLine?: string | null; body?: string | null }>(
    reviews: readonly T[],
): { oneLines: T[]; reports: T[] } {
    return {
        oneLines: reviews.filter(review => !filled(review.body) && filled(review.oneLine)),
        reports: reviews.filter(review => filled(review.body)),
    };
}
