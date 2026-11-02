/** 쪽수는 음수·비정상 값을 제거하되, 전체 초과 기록도 텍스트에서 숨기지 않습니다. */
const safePage = (page: number): number => Number.isFinite(page) ? Math.max(0, Math.trunc(page)) : 0;

export function readingProgress(currentPage: number, totalPages: number) {
    const current = safePage(currentPage);
    const total = safePage(totalPages);

    return {
        label: `${current} / ${total}쪽`,
        ratio: total === 0 ? 0 : Math.min(1, current / total),
    };
}
