import { beginReading, completeReading, groupShelfBooks, parseBookEdit, readingTimeLabel, type BookEditFields } from '../shelfRules';

const book = { id: 'book', title: '데미안', genre: '소설' as const, deleted: false, status: 'DONE' as const, currentPage: 84, totalPages: 240, completedCount: 1, completedAt: 100 };
const fields: BookEditFields = { title: ' 데미안 ', author: ' 헤르만 헤세 ', publisher: '', totalPages: '240', genre: '소설' };

test('FR-04 S-30 장르를 고정 순서로 묶고 빈 장르와 삭제된 책은 숨겨요', () => {
    const science = { ...book, id: 'science', genre: '과학' as const };
    expect(groupShelfBooks([science, { ...book, id: 'deleted', deleted: true }, book])).toEqual([
        { genre: '소설', books: [book] }, { genre: '과학', books: [science] },
    ]);
    expect(groupShelfBooks([])).toEqual([]);
});

test.each(['WANT', 'DONE'] as const)('FR-17 D7 S-32 S-33 %s에서 읽기를 시작해도 지난 쪽과 완독 이력은 보존해요', status => {
    const input = { ...book, status };
    expect(beginReading(input)).toEqual({ ...input, status: 'READING', completedAt: null });
    expect(input.status).toBe(status);
});

test('FR-04 S-31 완독은 전체 쪽수와 완료 시각을 저장하고 중복 표시해도 누적하지 않아요', () => {
    const result = completeReading({ ...book, status: 'READING' }, 500);
    expect(result).toMatchObject({ status: 'DONE', currentPage: 240, completedAt: 500, completedCount: 2 });
    expect(completeReading(result, 600)).toEqual(result);
});

test('FR-01 S-34 필수 입력을 다듬고 출판사 빈칸은 선택 값으로 저장해요', () => {
    expect(parseBookEdit(fields, 84)).toEqual({ title: '데미안', author: '헤르만 헤세', publisher: null, totalPages: 240, genre: '소설' });
    expect(parseBookEdit({ ...fields, totalPages: '84' }, 84).totalPages).toBe(84);
});

test.each(['', '0', '-1', '1.5', '1e3', '0x20', '2147483648'])('FR-01 S-34 전체 쪽수 %s는 저장할 수 없어요', totalPages => {
    expect(() => parseBookEdit({ ...fields, totalPages }, 0)).toThrow('전체 쪽수');
});

test('FR-01 S-34 현재 쪽 미만과 공백 제목·저자는 거부해요', () => {
    expect(() => parseBookEdit({ ...fields, totalPages: '83' }, 84)).toThrow('84쪽 이상');
    expect(() => parseBookEdit({ ...fields, title: ' ' }, 0)).toThrow('제목');
    expect(() => parseBookEdit({ ...fields, author: ' ' }, 0)).toThrow('저자');
});

test('FR-04 S-31 누적 시간은 삭제 기록을 제외하고 초까지 표시해요', () => {
    expect(readingTimeLabel([{ activeSeconds: 3661, deleted: false }, { activeSeconds: 100, deleted: true }])).toBe('1시간 1분 1초');
    expect(readingTimeLabel([])).toBe('0시간 0분 0초');
});
