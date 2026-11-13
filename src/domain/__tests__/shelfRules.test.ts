import { beginReading, BookEditError, completeReading, countShelfGenres, countShelfStatuses, filterShelfBooks, filterShelfGenre, groupShelfBooks, parseBookEdit, readingTimeLabel, toggleShelfFilter, type BookEditFields } from '../shelfRules';
import { monthlyStats } from '../calendarRules';
import type { Genre } from '../pageRules';

const book = { id: 'book', title: '데미안', genre: '소설' as const, deleted: false, status: 'DONE' as const, currentPage: 84, totalPages: 240, completedCount: 1, completedAt: 100 };
const fields: BookEditFields = { title: ' 데미안 ', author: ' 헤르만 헤세 ', publisher: '', totalPages: '240', genre: '소설' };
const editingBook = { ...book, status: 'READING' as const };

test('FR-04 S-30 장르를 고정 순서로 묶고 빈 장르와 삭제된 책은 숨겨요', () => {
    const science = { ...book, id: 'science', genre: '과학' as const };
    expect(groupShelfBooks([science, { ...book, id: 'deleted', deleted: true }, book])).toEqual([
        { genre: '소설', books: [book] }, { genre: '과학', books: [science] },
    ]);
    expect(groupShelfBooks([])).toEqual([]);
});

test.each(['WANT', 'DONE'] as const)('FR-17 D7 S-32 S-33 %s에서 읽기를 시작해도 지난 쪽과 완독 이력은 보존해요', status => {
    const input = { ...book, status };
    expect(beginReading(input)).toEqual({ ...input, status: 'READING' });
    expect(input.status).toBe(status);
});

test('FR-06 S-33 S-62 월 경계에서 다시 읽기를 시작해도 지난달 완독 권수를 유지해요', () => {
    const completed = { ...book, author: '헤르만 헤세', completedAt: Date.parse('2026-10-31T14:59:59.999Z'), currentPage: 240 };
    const nextMonthCompleted = { ...completed, id: 'next-month', completedAt: Date.parse('2026-10-31T15:00:00.000Z') };
    const before = monthlyStats([], [completed, nextMonthCompleted], '2026-10');
    const rereading = beginReading(completed);
    expect(monthlyStats([], [rereading, nextMonthCompleted], '2026-10').completedBooks).toBe(before.completedBooks);
    expect(before.completedBooks).toBe(1);
    expect(monthlyStats([], [rereading, nextMonthCompleted], '2026-11').completedBooks).toBe(1);
    expect(rereading).toMatchObject({ completedAt: completed.completedAt, completedCount: 1, currentPage: 240 });
});

test('FR-01 D7 S-34 완독 책은 읽은 쪽을 늘리지 않고 다시 읽기 전 전체 쪽수 증가를 안내해요', () => {
    expect(() => parseBookEdit({ ...fields, totalPages: '300' }, { ...book, currentPage: 240 })).toThrow('다시 읽기를 시작한 뒤 편집');
    expect(parseBookEdit(fields, { ...book, currentPage: 240 }).totalPages).toBe(240);
    expect(parseBookEdit({ ...fields, totalPages: '300' }, { ...editingBook, currentPage: 240 }).totalPages).toBe(300);
});

test('FR-01 S-34 복원된 완독 책의 현재 쪽이 전체보다 작아도 제목만 수정할 수 있어요', () => {
    expect(parseBookEdit({ ...fields, title: '바꾼 제목' }, book)).toMatchObject({ title: '바꾼 제목', totalPages: 240 });
    expect(parseBookEdit({ ...fields, totalPages: '200' }, book).totalPages).toBe(200);
    expect(() => parseBookEdit({ ...fields, totalPages: '241' }, book)).toThrow('다시 읽기를 시작한 뒤 편집');
});

test('FR-04 S-31 완독은 전체 쪽수와 완료 시각을 저장하고 중복 표시해도 누적하지 않아요', () => {
    const result = completeReading({ ...book, status: 'READING' }, 500);
    expect(result).toMatchObject({ status: 'DONE', currentPage: 240, completedAt: 500, completedCount: 2 });
    expect(completeReading(result, 600)).toEqual(result);
});

test('FR-01 S-34 필수 입력을 다듬고 출판사 빈칸은 선택 값으로 저장해요', () => {
    expect(parseBookEdit(fields, editingBook)).toEqual({ title: '데미안', author: '헤르만 헤세', publisher: null, totalPages: 240, genre: '소설' });
    expect(parseBookEdit({ ...fields, totalPages: '84' }, editingBook).totalPages).toBe(84);
});

test.each(['', '0', '-1', '1.5', '1e3', '0x20', '2147483648'])('FR-01 S-34 전체 쪽수 %s는 저장할 수 없어요', totalPages => {
    expect(() => parseBookEdit({ ...fields, totalPages }, { ...editingBook, currentPage: 0 })).toThrow('전체 쪽수');
});

test('FR-01 S-34 현재 쪽 미만과 공백 제목·저자는 거부해요', () => {
    expect(() => parseBookEdit({ ...fields, totalPages: '83' }, editingBook)).toThrow('84쪽 이상');
    expect(() => parseBookEdit({ ...fields, title: ' ' }, editingBook)).toThrow('제목');
    expect(() => parseBookEdit({ ...fields, author: ' ' }, editingBook)).toThrow('저자');
});

test('FR-04 S-31 누적 시간은 삭제 기록을 제외하고 초까지 표시해요', () => {
    expect(readingTimeLabel([{ activeSeconds: 3661, deleted: false }, { activeSeconds: 100, deleted: true }])).toBe('1시간 1분 1초');
    expect(readingTimeLabel([])).toBe('0시간 0분 0초');
});

test('FR-01 S-34 출판사는 BE 검증과 같은 100자까지 저장하고 초과 오류의 필드를 전달해요', () => {
    expect(parseBookEdit({ ...fields, publisher: '가'.repeat(100) }, editingBook).publisher).toHaveLength(100);
    expect(() => parseBookEdit({ ...fields, publisher: '가'.repeat(101) }, editingBook)).toThrow('출판사는 100자 이내로 입력해 주세요.');
    expect(() => parseBookEdit({ ...fields, title: '' }, editingBook)).toThrow(BookEditError);
    try { parseBookEdit({ ...fields, title: '' }, editingBook); } catch (error) {
        expect((error as BookEditError).field).toBe('title');
    }
});

const statusBook = (id: string, status: 'WANT' | 'READING' | 'DONE', deleted = false) => ({ id, status, deleted });

test('FR-04 FR-17 S-30 삭제된 책을 빼고 상태별 권수를 세요', () => {
    const books = [statusBook('a', 'READING'), statusBook('b', 'READING'), statusBook('c', 'DONE'), statusBook('d', 'WANT'), statusBook('e', 'DONE', true)];
    expect(countShelfStatuses(books)).toEqual({ READING: 2, DONE: 1, WANT: 1 });
    expect(countShelfStatuses([])).toEqual({ READING: 0, DONE: 0, WANT: 0 });
});

test('FR-04 S-30 필터가 없으면 모든 책을 그대로 보여요', () => {
    const books = [statusBook('a', 'READING'), statusBook('b', 'DONE'), statusBook('c', 'WANT')];
    expect(filterShelfBooks(books, null)).toEqual(books);
});

test('FR-04 S-30 읽는 중 필터를 고르면 읽는 중 책만 남겨요', () => {
    const books = [statusBook('a', 'READING'), statusBook('b', 'DONE'), statusBook('c', 'READING')];
    expect(filterShelfBooks(books, 'READING').map(item => item.id)).toEqual(['a', 'c']);
});

test('S-30 선택된 필터를 다시 누르면 선택을 풀고 다른 필터를 누르면 그쪽으로 옮겨요', () => {
    expect(toggleShelfFilter('DONE', 'DONE')).toBeNull();
    expect(toggleShelfFilter('READING', 'WANT')).toBe('WANT');
    expect(toggleShelfFilter(null, 'READING')).toBe('READING');
});
const genreBook = (id: string, genre: Genre, deleted = false) => ({ id, genre, deleted });

test('FR-04 S-30 책이 있는 장르만 고정 순서로 권수를 세고 삭제된 책은 빼요', () => {
    const books = [genreBook('a', 'SF'), genreBook('b', '소설'), genreBook('c', '소설'), genreBook('d', '과학', true)];
    expect(countShelfGenres(books)).toEqual([{ genre: '소설', count: 2 }, { genre: 'SF', count: 1 }]);
    expect(countShelfGenres([])).toEqual([]);
});

test('FR-04 S-30 장르를 고르지 않으면 모든 책을, 고르면 그 장르 책만 보여요', () => {
    const books = [genreBook('a', 'SF'), genreBook('b', '소설'), genreBook('c', 'SF')];
    expect(filterShelfGenre(books, null)).toEqual(books);
    expect(filterShelfGenre(books, 'SF').map(item => item.id)).toEqual(['a', 'c']);
});
