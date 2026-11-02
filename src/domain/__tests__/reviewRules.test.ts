import { emptyQuoteFields, emptyReviewFields, quoteSchema, reviewSchema } from '../reviewRules';

test.each([[100, true], [101, false]])('FR-07 S-51 한줄평 %i자 허용 여부는 %s예요', (count, success) => {
    expect(reviewSchema.safeParse({ ...emptyReviewFields, oneLine: '가'.repeat(count) }).success).toBe(success);
});
test.each([[5000, true], [5001, false]])('FR-07 S-51 독후감 %i자 허용 여부는 %s예요', (count, success) => {
    expect(reviewSchema.safeParse({ ...emptyReviewFields, body: '가'.repeat(count) }).success).toBe(success);
});
test.each([[1000, true], [1001, false]])('FR-07 S-52 문장 %i자 허용 여부는 %s예요', (count, success) => {
    expect(quoteSchema.safeParse({ ...emptyQuoteFields, text: '가'.repeat(count) }).success).toBe(success);
});
test('FR-08 S-51 공개 범위를 생략하면 비공개이고 명시적으로 공개할 수 있어요', () => {
    expect(emptyReviewFields.visibility).toBe('PRIVATE');
    expect(reviewSchema.parse({ oneLine: '감상', body: '' }).visibility).toBe('PRIVATE');
    expect(reviewSchema.parse({ oneLine: '', body: '독후감', visibility: 'PUBLIC' }).visibility).toBe('PUBLIC');
    expect(reviewSchema.safeParse({ oneLine: '감상', body: '', visibility: 'UNKNOWN' }).success).toBe(false);
});
test('FR-07 S-51 빈 감상이나 공백만 입력하면 저장할 수 없어요', () => {
    expect(reviewSchema.safeParse(emptyReviewFields).success).toBe(false);
    expect(reviewSchema.safeParse({ oneLine: '  ', body: '\n' }).success).toBe(false);
});
test('FR-07 S-52 문장은 필수이고 빈 쪽수는 null이며 0쪽도 보존해요', () => {
    expect(quoteSchema.safeParse(emptyQuoteFields).success).toBe(false);
    expect(quoteSchema.safeParse({ ...emptyQuoteFields, text: '  ' }).success).toBe(false);
    expect(quoteSchema.parse({ ...emptyQuoteFields, text: ' 문장 ' })).toMatchObject({ text: '문장', page: null });
    expect(quoteSchema.parse({ ...emptyQuoteFields, text: '문장', page: '0' }).page).toBe(0);
});
test.each(['-1', '1.5', 'abc', '1e3', '9007199254740992'])('FR-07 S-52 잘못된 쪽수 %s는 거절해요', page => {
    expect(quoteSchema.safeParse({ ...emptyQuoteFields, text: '문장', page }).success).toBe(false);
});
test.each([[500, true], [501, false]])('FR-07 S-52 선택 메모 %i자 허용 여부는 %s예요', (count, success) => {
    expect(quoteSchema.safeParse({ ...emptyQuoteFields, text: '문장', memo: '가'.repeat(count) }).success).toBe(success);
});
