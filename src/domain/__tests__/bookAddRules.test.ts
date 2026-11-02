import { isBookGenre, normalizeIsbn, parseTotalPages } from '../bookAddRules';

test('FR-01 · S-20/S-25 ISBN-10과 하이픈이 있는 ISBN-13을 같은 책으로 판별해요', () => {
    expect(normalizeIsbn('0-306-40615-2')).toBe('9780306406157');
    expect(normalizeIsbn(' 978-0-306-40615-7 ')).toBe('9780306406157');
    expect(normalizeIsbn('080442957X')).toBe('9780804429573');
});
test.each(['1234567890128', '9780306406158', '0306406151', '979123', ''])('FR-01 · S-20 잘못된 ISBN %s를 받지 않아요', value => {
    expect(normalizeIsbn(value)).toBeNull();
});
test.each(['', '0', '-1', '1.5', '1e3', '2147483648'])('FR-01 · S-23 전체 쪽수 경계 %s를 거절해요', value => {
    expect(parseTotalPages(value)).toBeNull();
});
test('FR-01 · S-23 전체 쪽수와 장르는 허용된 범위만 받아요', () => {
    expect(parseTotalPages('1')).toBe(1);
    expect(parseTotalPages('2147483647')).toBe(2147483647);
    expect(isBookGenre('소설')).toBe(true);
    expect(isBookGenre('자유 장르')).toBe(false);
});
