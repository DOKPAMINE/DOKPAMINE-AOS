import { bookOneLine, bookReports, bookVisibility, emptyQuoteFields, needsPublishConfirm, newReviewVisibility, oneLineSchema, planOneLineSave, quoteSchema, reportSchema } from '../reviewRules';

test.each([[1000, true], [1001, false]])('FR-07 S-52 문장 %i자 허용 여부는 %s예요', (count, success) => {
    expect(quoteSchema.safeParse({ ...emptyQuoteFields, text: '가'.repeat(count) }).success).toBe(success);
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
test.each([[100, true], [101, false]])('#75 FR-07 S-51 한줄평 화면은 %i자 허용 여부가 %s예요', (count, success) => {
    expect(oneLineSchema.safeParse({ text: '가'.repeat(count) }).success).toBe(success);
});
test('#75 FR-08 S-51 한줄평은 공백만 입력하면 저장할 수 없고 공개 범위를 생략하면 비공개예요', () => {
    expect(oneLineSchema.safeParse({ text: '  ' }).success).toBe(false);
    expect(oneLineSchema.parse({ text: ' 한줄평 ' })).toEqual({ text: '한줄평', visibility: 'PRIVATE' });
    expect(oneLineSchema.safeParse({ text: '한줄평', visibility: 'UNKNOWN' }).success).toBe(false);
});
test('#75 S-51 처음 쓰는 한줄평은 입력한 공개 범위로 저장해요', () => {
    expect(planOneLineSave({ text: ' 첫 한줄평 ', visibility: 'PUBLIC' })).toEqual({ kind: 'save', text: '첫 한줄평', visibility: 'PUBLIC' });
    expect(planOneLineSave({ text: '', visibility: 'PRIVATE' })).toEqual({ kind: 'invalid', message: '한줄평을 입력해 주세요.' });
});
test('#75 S-51 기존 한줄평은 내용이나 공개 범위를 고치면 저장해요', () => {
    const current = { oneLine: '기존 한줄평', visibility: 'PRIVATE' as const };
    expect(planOneLineSave({ text: '고친 한줄평', visibility: 'PRIVATE' }, current)).toEqual({ kind: 'save', text: '고친 한줄평', visibility: 'PRIVATE' });
    expect(planOneLineSave({ text: '기존 한줄평', visibility: 'PUBLIC' }, current)).toEqual({ kind: 'save', text: '기존 한줄평', visibility: 'PUBLIC' });
});
test('#75 S-51 기존 한줄평을 비우거나 바꾸지 않으면 저장하지 않고 안내해요', () => {
    const current = { oneLine: '기존 한줄평', visibility: 'PRIVATE' as const };
    expect(planOneLineSave({ text: ' ', visibility: 'PRIVATE' }, current))
        .toEqual({ kind: 'invalid', message: '한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.' });
    expect(planOneLineSave({ text: ' 기존 한줄평 ', visibility: 'PRIVATE' }, current))
        .toEqual({ kind: 'invalid', message: '바뀐 내용이 없어요. 한줄평을 고친 뒤 저장해 주세요.' });
});
test.each([[5000, true], [5001, false]])('#75 FR-07 S-53 독후감 화면은 %i자 허용 여부가 %s예요', (count, success) => {
    expect(reportSchema.safeParse({ text: '가'.repeat(count) }).success).toBe(success);
});
test('#75 FR-08 S-53 독후감은 공백만 입력하면 저장할 수 없고 공개 범위를 생략하면 비공개예요', () => {
    expect(reportSchema.safeParse({ text: '	 ' }).success).toBe(false);
    expect(reportSchema.parse({ text: ' 독후감 ' })).toEqual({ text: '독후감', visibility: 'PRIVATE' });
});

const visibilities = (...values: ('PRIVATE' | 'PUBLIC')[]) => values.map(visibility => ({ visibility }));

test.each(['PRIVATE', 'PUBLIC'] as const)('#89 FR-08 S-31 S-81 감상이 없는 책은 기본 공개 범위 %s를 따라요', fallback => {
    expect(bookVisibility([], fallback)).toBe(fallback);
});
test('#89 FR-08 S-31 감상이 모두 같으면 그 값이고 섞여 있으면 MIXED예요', () => {
    expect(bookVisibility(visibilities('PUBLIC', 'PUBLIC'), 'PRIVATE')).toBe('PUBLIC');
    expect(bookVisibility(visibilities('PRIVATE'), 'PUBLIC')).toBe('PRIVATE');
    expect(bookVisibility(visibilities('PRIVATE', 'PUBLIC'), 'PUBLIC')).toBe('MIXED');
});
test('#89 FR-08 S-51 S-53 새 감상은 공개인 책에서만 공개로 저장하고 섞인 책은 비공개예요', () => {
    expect(newReviewVisibility('PUBLIC')).toBe('PUBLIC');
    expect(newReviewVisibility('PRIVATE')).toBe('PRIVATE');
    expect(newReviewVisibility('MIXED')).toBe('PRIVATE');
});
test('#89 FR-08 S-31 공개로 바꿀 때만 확인하고 비공개로 바꿀 때는 확인하지 않아요', () => {
    expect(needsPublishConfirm('PRIVATE', 'PUBLIC')).toBe(true);
    expect(needsPublishConfirm('MIXED', 'PUBLIC')).toBe(true);
    expect(needsPublishConfirm('PUBLIC', 'PRIVATE')).toBe(false);
    expect(needsPublishConfirm('MIXED', 'PRIVATE')).toBe(false);
});
