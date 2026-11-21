import { GENRES, normalizeGenre } from '../pageRules';

test('FR-01 장르는 YES24 대분야에 맞춘 아홉 개예요', () => {
    expect(GENRES).toEqual(['소설/시', '에세이', '인문/사회', '경제/경영', '자기계발', '과학/IT', '예술', '만화', '기타']);
});

test.each([
    ['소설', '소설/시'], ['SF', '소설/시'], ['시/에세이', '에세이'], ['인문', '인문/사회'], ['역사', '인문/사회'],
    ['사회/정치', '인문/사회'], ['과학', '과학/IT'], ['경제/경영', '경제/경영'], ['소설/시', '소설/시'], [' 만화 ', '만화'],
])('FR-01 BE V4 규칙대로 %s 장르를 %s로 바꿔요', (before, after) => {
    expect(normalizeGenre(before)).toBe(after);
});

test('FR-01 모르는 장르나 빈 값은 null이에요', () => {
    expect(normalizeGenre('여행')).toBeNull();
    expect(normalizeGenre('')).toBeNull();
    expect(normalizeGenre(null)).toBeNull();
});
