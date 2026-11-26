/**
 * #132 FR-09 S-80 좋아요한 감상: 마이 미리보기와 S-80 하위 좋아요한 감상 목록의 문구·개수 규칙.
 * 서버 응답 모양에만 기대며 화면·IO에 의존하지 않는다.
 */

/** 마이 미리보기 칸에서 불러오는 책 묶음 수(API.md "마이 미리보기는 size=3"). */
export const LIKED_PREVIEW_SIZE = 3;
/** 전체 목록에서 한 번에 이어 받는 책 묶음 수. */
export const LIKED_PAGE_SIZE = 20;
/** 전체 목록의 책 묶음 하나에서 펼치기 전에 보여 줄 사람 수. */
export const VISIBLE_PEOPLE = 3;

interface Person { nickname: string; likedCount: number; mine: boolean }
interface Group<P extends Person = Person> { bookKey: string; bookTitle: string; people: readonly P[] }

/** "첫 사람 외 N명". 한 명이면 닉네임만, 사람이 없으면 빈 문자열이다. */
export function likedPeopleSummary(people: readonly Pick<Person, 'nickname'>[]): string {
    const [first] = people;
    if (!first) return '';
    return people.length > 1 ? `${first.nickname} 외 ${people.length - 1}명` : first.nickname;
}

/** 미리보기 한 줄 "어린 왕자 · 하늘님 외 1명". 사람이 없으면 제목만 보여 준다. */
export function likedPreviewText(group: Pick<Group, 'bookTitle' | 'people'>): string {
    const people = likedPeopleSummary(group.people);
    return people ? `${group.bookTitle} · ${people}` : group.bookTitle;
}

/** 미리보기 한 줄의 스크린리더 라벨. 누르면 전체 목록을 여는 것까지 읽는다. */
export function likedPreviewLabel(group: Pick<Group, 'bookTitle' | 'people'>): string {
    const people = likedPeopleSummary(group.people);
    return [group.bookTitle, people, '좋아요한 감상 전체 보기'].filter(Boolean).join(', ');
}

/** 묶음 안에서 보여 줄 사람. 펼치지 않았으면 앞에서부터 VISIBLE_PEOPLE명까지다(서버 순서 유지). */
export function visiblePeople<P>(people: readonly P[], expanded: boolean): readonly P[] {
    return expanded ? people : people.slice(0, VISIBLE_PEOPLE);
}

/** 펼치기 전에 숨는 사람 수. 0이면 "더 보기"를 두지 않는다. */
export function hiddenPeopleCount(people: readonly unknown[]): number {
    return Math.max(0, people.length - VISIBLE_PEOPLE);
}

/** "2명 더 보기" */
export function morePeopleText(hidden: number): string {
    return `${hidden}명 더 보기`;
}

/** 사람 줄 라벨 "어린 왕자, 하늘님, 내 감상, 좋아요 2개, 감상 보기". 내 감상이 아니면 "내 감상"을 빼고 읽는다. */
export function likedPersonLabel(bookTitle: string, person: Person): string {
    return [bookTitle, person.nickname, person.mine ? '내 감상' : null, `좋아요 ${person.likedCount}개`, '감상 보기']
        .filter(Boolean).join(', ');
}

/**
 * 이어 받은 페이지를 한 목록으로 합친다. 서버는 묶음 단위로 잘라 한 책이 두 페이지에 나뉘지 않지만,
 * 넘기는 사이 순서가 바뀌어도 같은 bookKey가 두 번 보이지 않도록 먼저 나온 묶음만 둔다.
 */
export function mergeLikedPages<G extends { bookKey: string }>(pages: readonly { items: readonly G[] }[]): G[] {
    const seen = new Set<string>();
    const merged: G[] = [];
    for (const page of pages) {
        for (const group of page.items) {
            if (seen.has(group.bookKey)) continue;
            seen.add(group.bookKey);
            merged.push(group);
        }
    }
    return merged;
}

/** 다음 페이지 cursor. 마지막 페이지(null·없음·빈 문자열)면 undefined라 더 부르지 않는다. */
export function nextLikedCursor(page: { nextCursor?: string | null }): string | undefined {
    return page.nextCursor ? page.nextCursor : undefined;
}
