import { bookOneLine, bookReports, emptyQuoteFields, emptyReviewFields, planReviewSave, quoteSchema, reviewSchema } from '../reviewRules';

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

const entry = (id: string, oneLine: string | null, body: string | null, createdAt: number, updatedAt = createdAt) =>
    ({ id, oneLine, body, createdAt, updatedAt });

test('#75 S-31 S-50 책의 한줄평은 한줄평이 든 감상 중 가장 최근에 고친 하나예요', () => {
    expect(bookOneLine([entry('a', null, '독후감', 30)])).toBeUndefined();
    expect(bookOneLine([entry('a', '처음', null, 10, 10), entry('b', '  ', null, 40), entry('c', '고친 한줄평', null, 5, 20)])?.id).toBe('c');
});
test('#75 S-50 독후감은 내용이 있는 감상만 최신 작성 순으로 모아요', () => {
    const reports = bookReports([entry('a', '한줄평', null, 50), entry('b', null, '첫 독후감', 10), entry('c', null, '둘째 독후감', 20, 20)]);
    expect(reports.map(report => report.id)).toEqual(['c', 'b']);
});
test('#75 S-51 처음 쓰면 한줄평과 독후감을 각각 저장해요', () => {
    expect(planReviewSave({ oneLine: ' 한줄평 ', body: ' 독후감 ', visibility: 'PUBLIC' }, undefined))
        .toEqual({ kind: 'save', oneLine: '한줄평', body: '독후감', visibility: 'PUBLIC' });
});
test('#75 S-51 한줄평을 그대로 두고 독후감만 쓰면 한줄평은 저장하지 않아요', () => {
    expect(planReviewSave({ oneLine: '기존 한줄평', body: '새 독후감', visibility: 'PUBLIC' }, '기존 한줄평'))
        .toEqual({ kind: 'save', oneLine: null, body: '새 독후감', visibility: 'PUBLIC' });
});
test('#75 S-51 한줄평만 고치면 독후감 없이 한줄평만 저장해요', () => {
    expect(planReviewSave({ oneLine: '고친 한줄평', body: '', visibility: 'PRIVATE' }, '기존 한줄평'))
        .toEqual({ kind: 'save', oneLine: '고친 한줄평', body: null, visibility: 'PRIVATE' });
});
test('#75 S-51 바뀐 내용이 없거나 기존 한줄평을 비우면 저장할 수 없어요', () => {
    expect(planReviewSave({ oneLine: '기존 한줄평', body: ' ', visibility: 'PRIVATE' }, '기존 한줄평'))
        .toEqual({ kind: 'invalid', message: '새로 쓴 내용이 없어요. 한줄평을 고치거나 독후감을 입력해 주세요.' });
    expect(planReviewSave({ oneLine: '', body: '독후감', visibility: 'PRIVATE' }, '기존 한줄평'))
        .toEqual({ kind: 'invalid', message: '한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.' });
});
test('#75 S-51 한줄평 100자와 독후감 5,000자 제한은 그대로예요', () => {
    expect(planReviewSave({ oneLine: '가'.repeat(101), body: '', visibility: 'PRIVATE' }, '기존')).toMatchObject({ kind: 'invalid' });
    expect(planReviewSave({ oneLine: '기존', body: '가'.repeat(5001), visibility: 'PRIVATE' }, '기존')).toMatchObject({ kind: 'invalid' });
    expect(planReviewSave({ oneLine: '가'.repeat(100), body: '가'.repeat(5000), visibility: 'PRIVATE' }, '기존')).toMatchObject({ kind: 'save' });
});
