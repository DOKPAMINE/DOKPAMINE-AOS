import { kstDate } from './kstDate';
import { reportHeading } from './reviewRules';

/** #113 S-70·S-71·S-76: 내가 쓴 박스면 첫 줄 뒤에 "(내 감상)"을 붙인다. */
export function withMine(text: string, mine: boolean): string {
    return mine ? `${text} (내 감상)` : text;
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

const timeOf = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
};

type BoxReview = {
    id: string; userBookId?: string | null; oneLine?: string | null; body?: string | null;
    publishedAt?: string | null; bodyWrittenAt?: string | null; likeCount: number;
};

/** #113 S-71: 사람의 책 하나(또는 userBookId가 없는 예전 응답의 감상 하나)를 박스 하나로 본다. */
export interface ReviewBox<T extends BoxReview> {
    key: string;
    userBookId: string | null;
    reviews: T[];
    representative: T;
}

/**
 * #113 S-71: 박스의 대표 감상은 가장 최근에 새로 쓴 독후감(bodyWrittenAt이 가장 늦은 것, 같으면 서버 순서가 앞선 것)이고,
 * 독후감이 없으면 서버 순서에서 첫 한줄평이다.
 */
export function boxRepresentative<T extends BoxReview>(reviews: readonly T[]): T {
    let best: T | undefined;
    let bestTime = -Infinity;
    for (const review of reviews) {
        if (!filled(review.body)) continue;
        const time = timeOf(review.bodyWrittenAt) ?? -Infinity;
        if (best === undefined || time > bestTime) { best = review; bestTime = time; }
    }
    return best ?? reviews.find(review => filled(review.oneLine)) ?? reviews[0];
}

/**
 * #113 S-71: 책 묶음의 감상을 사람의 책(userBookId)별 박스로 묶는다. 박스는 처음 나온 순서를 따른다.
 * userBookId를 주지 않는 예전 응답의 감상은 하나씩 박스가 된다.
 */
export function groupReviewBoxes<T extends BoxReview>(reviews: readonly T[]): ReviewBox<T>[] {
    const boxes = new Map<string, { userBookId: string | null; reviews: T[] }>();
    for (const review of reviews) {
        const key = review.userBookId ? `user-book:${review.userBookId}` : `review:${review.id}`;
        const box = boxes.get(key);
        if (box) box.reviews.push(review);
        else boxes.set(key, { userBookId: review.userBookId || null, reviews: [review] });
    }
    return [...boxes].map(([key, box]) => ({ key, ...box, representative: boxRepresentative(box.reviews) }));
}

export type ReviewBoxOrder = 'latest' | 'likes';

const latestPublished = (box: ReviewBox<BoxReview>) =>
    box.reviews.reduce<number | null>((latest, review) => {
        const time = timeOf(review.publishedAt);
        return time === null ? latest : latest === null ? time : Math.max(latest, time);
    }, null);
const likeSum = (box: ReviewBox<BoxReview>) => box.reviews.reduce((sum, review) => sum + review.likeCount, 0);
// 서버의 UUID 문자열 오름차순과 같게, 로캘이 아닌 코드 단위로 비교한다.
const byCode = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function compareLatest(a: ReviewBox<BoxReview>, b: ReviewBox<BoxReview>): number {
    const [timeA, timeB] = [latestPublished(a), latestPublished(b)];
    if (timeA !== timeB) {
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        return timeB - timeA;
    }
    return byCode(a.userBookId ?? a.key, b.userBookId ?? b.key);
}

/**
 * #113 S-71: [최신순]은 박스 안 공개 감상 중 가장 늦은 publishedAt 내림차순(시각이 없으면 마지막, 같으면 userBookId 오름차순),
 * [좋아요 많은 순]은 박스 안 감상의 좋아요 합계 내림차순이고 같으면 최신순이다. 원본은 바꾸지 않는다.
 */
export function sortReviewBoxes<B extends ReviewBox<BoxReview>>(boxes: readonly B[], order: ReviewBoxOrder): B[] {
    return [...boxes].sort((a, b) => (order === 'likes' ? likeSum(b) - likeSum(a) : 0) || compareLatest(a, b));
}

/**
 * #113 S-76: 독후감 카드 위쪽 문구 "독후감 1 · 2026. 11. 15."(S-50과 같은 형식). 번호는 그 박스의 공개 독후감을
 * bodyWrittenAt이 이른 순(같으면 감상 ID 순, 시각이 없으면 마지막)으로 1번부터 매기고, 날짜는 bodyWrittenAt의 KST 날짜다.
 * 시각이 없으면 날짜 없이 "독후감 3"이다. 카드 순서는 바꾸지 않으므로 감상 ID별 문구를 돌려준다.
 */
export function userBookReportHeadings(reports: readonly Pick<BoxReview, 'id' | 'bodyWrittenAt'>[]): Map<string, { text: string; label: string }> {
    const ordered = [...reports].sort((a, b) => {
        const [timeA, timeB] = [timeOf(a.bodyWrittenAt), timeOf(b.bodyWrittenAt)];
        if (timeA !== timeB) {
            if (timeA === null) return 1;
            if (timeB === null) return -1;
            return timeA - timeB;
        }
        return byCode(a.id, b.id);
    });
    return new Map(ordered.map((report, index) => {
        const time = timeOf(report.bodyWrittenAt);
        const number = index + 1;
        return [report.id, time === null ? { text: `독후감 ${number}`, label: `독후감 ${number}` } : reportHeading(number, time)];
    }));
}

/** #113 S-70·S-71: 스크린리더가 읽는 감상 앞부분. 공백을 한 칸으로 줄이고 max자를 넘으면 줄임표를 붙인다. */
export function previewText(text: string, max = 80): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    const chars = Array.from(compact);
    return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : compact;
}

/**
 * #113 S-70·S-71: 박스의 스크린리더 문구. 화면 순서와 같게 읽는다.
 * S-70: 『제목』(내 감상) → 닉네임 → 감상 앞부분 → 날짜. 예: "『데미안』 내 감상, 독자, 각자의 길을 찾는 이야기, 2026년 11월 25일에 쓴 독후감"
 * S-71: 책 제목은 묶음 제목에서 보여 주므로 bookTitle 없이 닉네임(내 감상) → 감상 앞부분 → 날짜. 예: "독자 (내 감상), 각자의 길을 찾는 이야기"
 */
export function loungeBoxLabel({ nickname, bookTitle, mine, text, date }: {
    nickname: string; bookTitle?: string; mine: boolean; text: string; date: { label: string } | null;
}): string {
    return [
        ...bookTitle === undefined ? [withMine(nickname, mine)] : [bookTitleLabel(bookTitle, mine), nickname],
        previewText(text),
        date ? `${date.label}에 쓴 독후감` : '',
    ].filter(Boolean).join(', ');
}

/**
 * #113 S-71: 책 묶음 제목 옆 표지. 묶음 감상 중 coverUrl이 있는 첫 감상의 표지이고, 없으면 null(기본 표지)이다.
 * 기본 표지에 쓰는 장르는 그 감상의 장르, 표지가 없으면 첫 감상의 장르다.
 */
export function groupCover(reviews: readonly { coverUrl?: string | null; genre: string }[]): { uri: string | null; genre: string } {
    const covered = reviews.find(review => typeof review.coverUrl === 'string' && review.coverUrl.trim().length > 0);
    return { uri: covered?.coverUrl ?? null, genre: (covered ?? reviews[0])?.genre ?? '기타' };
}

/**
 * #113 S-70·S-76: Noto Sans KR(Regular·Medium·Bold)의 『는 글자 칸(1em) 왼쪽 0.60em이 비어 있고, 한글은 약 0.03em이다.
 * 『를 그 차이(0.57em)만큼 왼쪽으로 당겨 아래 줄과 글자 왼쪽 끝을 맞춘다. 큰 글씨 설정(fontScale)만큼 함께 커진다.
 * 이 값은 Noto Sans KR 글꼴의 수치이므로, 글꼴을 불러오지 못해 기본 글꼴로 그릴 때는 당기지 않는다(0).
 */
export const OPENING_BRACKET_INDENT_EM = 0.57;
export function openingBracketIndent(fontSize: number, fontScale: number, notoLoaded: boolean): number {
    if (!notoLoaded) return 0;
    return Math.round(OPENING_BRACKET_INDENT_EM * fontSize * fontScale * 10) / 10;
}

/** #113 S-70·S-76: 『제목』 줄을 스크린리더가 한 번에 읽는 문구. 내가 쓴 박스면 "『데미안』 내 감상"이다. */
export function bookTitleLabel(bookTitle: string, mine: boolean): string {
    return mine ? `『${bookTitle}』 내 감상` : `『${bookTitle}』`;
}
