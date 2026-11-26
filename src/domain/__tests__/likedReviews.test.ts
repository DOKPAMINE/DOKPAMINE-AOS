import {
    hiddenPeopleCount, LIKED_PAGE_SIZE, LIKED_PREVIEW_SIZE, likedPeopleSummary, likedPersonLabel, likedPreviewLabel, likedPreviewText,
    mergeLikedPages, morePeopleText, nextLikedCursor, VISIBLE_PEOPLE, visiblePeople,
} from '../likedReviews';

const person = (nickname: string, likedCount = 1, mine = false) => ({ nickname, likedCount, mine });
const sky = person('하늘님', 2);
const star = person('별님', 1);

test('FR-09 S-80 미리보기는 3개, 전체 목록은 20개씩 불러오고 묶음마다 3명까지 보여 줘요', () => {
    expect(LIKED_PREVIEW_SIZE).toBe(3);
    expect(LIKED_PAGE_SIZE).toBe(20);
    expect(VISIBLE_PEOPLE).toBe(3);
});

test('FR-09 S-80 어린 왕자에 하늘님과 별님에게 좋아요했으면 "어린 왕자 · 하늘님 외 1명"이에요', () => {
    const group = { bookTitle: '어린 왕자', people: [sky, star] };
    expect(likedPeopleSummary(group.people)).toBe('하늘님 외 1명');
    expect(likedPreviewText(group)).toBe('어린 왕자 · 하늘님 외 1명');
    expect(likedPreviewLabel(group)).toBe('어린 왕자, 하늘님 외 1명, 좋아요한 감상 전체 보기');
});

test('FR-09 S-80 한 명이면 "외 N명" 없이 닉네임만 보여 줘요', () => {
    expect(likedPreviewText({ bookTitle: '어린 왕자', people: [sky] })).toBe('어린 왕자 · 하늘님');
    expect(likedPreviewLabel({ bookTitle: '어린 왕자', people: [sky] })).toBe('어린 왕자, 하늘님, 좋아요한 감상 전체 보기');
});

test('FR-09 S-80 사람이 없는 묶음은 제목만 보여 줘요', () => {
    expect(likedPeopleSummary([])).toBe('');
    expect(likedPreviewText({ bookTitle: '어린 왕자', people: [] })).toBe('어린 왕자');
    expect(likedPreviewLabel({ bookTitle: '어린 왕자', people: [] })).toBe('어린 왕자, 좋아요한 감상 전체 보기');
});

test.each([
    [0, 0, 0],
    [3, 3, 0],
    [4, 3, 1],
    [5, 3, 2],
])('FR-09 S-80 한 책에 %i명이면 펼치기 전 %i명을 보여 주고 %i명을 숨겨요', (count, visible, hidden) => {
    const people = Array.from({ length: count }, (_, index) => person(`독자${index + 1}`));
    expect(visiblePeople(people, false)).toEqual(people.slice(0, visible));
    expect(visiblePeople(people, true)).toEqual(people);
    expect(hiddenPeopleCount(people)).toBe(hidden);
});

test('FR-09 S-80 숨은 사람이 2명이면 "2명 더 보기"예요', () => {
    expect(morePeopleText(2)).toBe('2명 더 보기');
});

test('FR-09 S-80 사람 줄 라벨은 제목·닉네임·좋아요 수·감상 보기 순서이고 내 감상이면 "내 감상"을 함께 읽어요', () => {
    expect(likedPersonLabel('어린 왕자', sky)).toBe('어린 왕자, 하늘님, 좋아요 2개, 감상 보기');
    expect(likedPersonLabel('어린 왕자', person('책산책', 1, true))).toBe('어린 왕자, 책산책, 내 감상, 좋아요 1개, 감상 보기');
});

test('FR-09 S-80 이어 받은 페이지는 순서대로 합치고 같은 책 묶음은 한 번만 둬요', () => {
    const group = (bookKey: string) => ({ bookKey });
    expect(mergeLikedPages([{ items: [group('a'), group('b')] }, { items: [group('b'), group('c')] }]).map(item => item.bookKey))
        .toEqual(['a', 'b', 'c']);
    expect(mergeLikedPages([])).toEqual([]);
});

test.each([
    [{ nextCursor: 'next-1' }, 'next-1'],
    [{ nextCursor: null }, undefined],
    [{}, undefined],
    [{ nextCursor: '' }, undefined],
])('FR-09 S-80 nextCursor %p이면 다음 cursor는 %p예요', (page, cursor) => {
    expect(nextLikedCursor(page)).toBe(cursor);
});
