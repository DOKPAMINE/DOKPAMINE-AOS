import { clampHomePage, homePageBooks, homePageCount, homePageOf } from '../homeBooks';

test('S-10 읽는 중 책을 2권씩 나눠 페이지 수를 세요', () => {
    expect(homePageCount(0)).toBe(1);
    expect(homePageCount(2)).toBe(1);
    expect(homePageCount(3)).toBe(2);
    expect(homePageCount(5)).toBe(3);
});

test('S-10 페이지마다 2권씩 보여 주고 마지막 페이지는 남은 책만 보여요', () => {
    const books = ['a', 'b', 'c', 'd', 'e'];
    expect(homePageBooks(books, 0)).toEqual(['a', 'b']);
    expect(homePageBooks(books, 1)).toEqual(['c', 'd']);
    expect(homePageBooks(books, 2)).toEqual(['e']);
});

test('S-10 책이 줄어 페이지가 사라지면 남은 마지막 페이지로 맞춰요', () => {
    expect(clampHomePage(2, 4)).toBe(1);
    expect(clampHomePage(-1, 4)).toBe(0);
    expect(homePageBooks(['a', 'b', 'c', 'd'], 5)).toEqual(['c', 'd']);
});

test('S-10 선택된 책이 있는 페이지에서 시작하고 못 찾으면 첫 페이지예요', () => {
    expect(homePageOf(0)).toBe(0);
    expect(homePageOf(3)).toBe(1);
    expect(homePageOf(4)).toBe(2);
    expect(homePageOf(-1)).toBe(0);
});
