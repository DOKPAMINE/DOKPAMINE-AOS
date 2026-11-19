/** S-10: 홈에서 한 번에 보여 줄 읽는 중 책 수 */
export const HOME_BOOKS_PER_PAGE = 2;

/** S-10: 책이 없어도 페이지는 최소 1쪽으로 센다. */
export function homePageCount(total: number, perPage = HOME_BOOKS_PER_PAGE) {
    return Math.max(1, Math.ceil(total / perPage));
}

/** S-10: 책이 줄어 페이지가 사라지면 남은 마지막 페이지로 맞춘다. */
export function clampHomePage(page: number, total: number, perPage = HOME_BOOKS_PER_PAGE) {
    return Math.min(Math.max(page, 0), homePageCount(total, perPage) - 1);
}

/** S-10: 선택된 책이 있는 페이지를 찾고, 찾지 못하면 첫 페이지로 둔다. */
export function homePageOf(index: number, perPage = HOME_BOOKS_PER_PAGE) {
    return index < 0 ? 0 : Math.floor(index / perPage);
}

/** S-10: 해당 페이지에 보여 줄 책만 잘라 낸다. */
export function homePageBooks<T>(books: readonly T[], page: number, perPage = HOME_BOOKS_PER_PAGE) {
    const start = clampHomePage(page, books.length, perPage) * perPage;
    return books.slice(start, start + perPage);
}

/** S-10: 읽은 비율을 0~100 정수로 내림해 끝까지 읽기 전에는 100%가 되지 않게 한다. */
export function readingPercent(currentPage: number, totalPages: number) {
    if (!(totalPages > 0)) return 0;
    return Math.min(100, Math.max(0, Math.floor((currentPage / totalPages) * 100)));
}
