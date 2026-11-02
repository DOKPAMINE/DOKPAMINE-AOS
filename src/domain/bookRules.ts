/** FR-01·03 / S-23·S-34: BookDto와 같은 저장 경계를 적용한다. */
export function validateBook(input: { title: string; author: string; totalPages: number; currentPage: number }): void {
    if (!input.title.trim() || input.title.length > 200) throw new Error('제목은 1~200자로 입력해 주세요.');
    if (!input.author.trim() || input.author.length > 100) throw new Error('저자는 1~100자로 입력해 주세요.');
    if (!Number.isSafeInteger(input.totalPages) || input.totalPages < 1) throw new Error('전체 쪽수를 확인해 주세요.');
    if (!Number.isSafeInteger(input.currentPage) || input.currentPage < 0 || input.currentPage > input.totalPages) {
        throw new Error('현재 페이지를 확인해 주세요.');
    }
}
