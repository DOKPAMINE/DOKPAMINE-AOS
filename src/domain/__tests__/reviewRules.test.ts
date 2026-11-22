import { bookOneLine, bookReports, bookVisibility, emptyQuoteFields, hasOneLineConflict, mixedVisibilityBooks, needsPublishConfirm, oneLineSchema, planOneLineSave, planQuoteSave, planReportSave, planReviewPartDelete, quoteFieldsOf, quoteSchema, reportSchema } from '../reviewRules';

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
test('#75 #91 S-51 기존 한줄평은 비우면 막고, 바꾸지 않으면 다시 쓰지 않도록 unchanged예요', () => {
    const current = { oneLine: '기존 한줄평', visibility: 'PRIVATE' as const };
    expect(planOneLineSave({ text: ' ', visibility: 'PRIVATE' }, current))
        .toEqual({ kind: 'invalid', message: '한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.' });
    expect(planOneLineSave({ text: ' 기존 한줄평 ', visibility: 'PRIVATE' }, current))
        .toEqual({ kind: 'unchanged' });
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
test('#89 FR-08 S-31 감상이 있으면 모두 공개일 때만 공개이고 저장값보다 감상이 우선해요', () => {
    expect(bookVisibility(visibilities('PUBLIC', 'PUBLIC'), 'PRIVATE')).toBe('PUBLIC');
    expect(bookVisibility(visibilities('PRIVATE'), 'PUBLIC')).toBe('PRIVATE');
    expect(bookVisibility(visibilities('PRIVATE', 'PUBLIC'), 'PUBLIC')).toBe('PRIVATE');
});
test('#89 FR-08 S-31 감상 공개 범위가 섞인 책만 제목 순으로 찾아요', () => {
    const books = [{ id: 'c', title: '하얀 책' }, { id: 'a', title: '데미안' }, { id: 'b', title: '같은 책' }, { id: 'd', title: '감상 없는 책' }];
    const reviews = [
        { bookId: 'c', visibility: 'PUBLIC' }, { bookId: 'c', visibility: 'PRIVATE' },
        { bookId: 'a', visibility: 'PRIVATE' }, { bookId: 'a', visibility: 'PUBLIC' }, { bookId: 'a', visibility: 'PUBLIC' },
        { bookId: 'b', visibility: 'PUBLIC' }, { bookId: 'b', visibility: 'PUBLIC' },
        { bookId: 'deleted-book', visibility: 'PUBLIC' }, { bookId: 'deleted-book', visibility: 'PRIVATE' },
    ] as const;
    expect(mixedVisibilityBooks(books, reviews).map(book => book.title)).toEqual(['데미안', '하얀 책']);
    expect(mixedVisibilityBooks(books, [])).toEqual([]);
});
test('#89 FR-08 S-31 공개로 바꿀 때만 확인하고 비공개로 바꿀 때는 확인하지 않아요', () => {
    expect(needsPublishConfirm('PRIVATE', 'PUBLIC', 1)).toBe(true);
    expect(needsPublishConfirm('PUBLIC', 'PRIVATE', 1)).toBe(false);
    expect(needsPublishConfirm('PUBLIC', 'PUBLIC', 2)).toBe(false);
});
test('#89 FR-08 S-31 감상이 없는 책은 공개로 바꿔도 공개될 감상이 없어 확인하지 않아요', () => {
    expect(needsPublishConfirm('PRIVATE', 'PUBLIC', 0)).toBe(false);
});

describe('#91 감상·문장 수정과 삭제 규칙', () => {
    test('S-53 독후감 수정은 비우면 막고, 바뀐 것이 없으면 unchanged이며, 고친 내용은 앞뒤 공백을 빼고 저장해요', () => {
        const current = { body: '처음 독후감' };
        expect(planReportSave('  ', current)).toEqual({ kind: 'invalid', message: '독후감은 비울 수 없어요. 지우려면 감상 목록에서 삭제해 주세요.' });
        expect(planReportSave(' 처음 독후감 ', current)).toEqual({ kind: 'unchanged' });
        expect(planReportSave(' 고친 독후감 ', current)).toEqual({ kind: 'save', text: '고친 독후감' });
        expect(planReportSave('가'.repeat(5001), current)).toEqual({ kind: 'invalid', message: '독후감은 5,000자 이내로 입력해 주세요.' });
    });
    test('S-53 새 독후감은 입력만 확인해요', () => {
        expect(planReportSave('')).toEqual({ kind: 'invalid', message: '독후감을 입력해 주세요.' });
        expect(planReportSave('새 독후감')).toEqual({ kind: 'save', text: '새 독후감' });
    });
    test('S-52 문장 수정은 기존 문장·쪽수를 채우고 쪽수가 없으면 빈 칸이에요', () => {
        expect(quoteFieldsOf({ text: '문장', page: 0 })).toEqual({ text: '문장', page: '0' });
        expect(quoteFieldsOf({ text: '문장', page: null })).toEqual({ text: '문장', page: '' });
    });
    test('S-52 문장 수정은 문장이나 쪽수가 바뀌어야 저장하고, 그대로면 unchanged예요', () => {
        const current = { text: '새는 알에서 나온다.', page: 10 };
        expect(planQuoteSave({ text: ' 새는 알에서 나온다. ', page: '10' }, current)).toEqual({ kind: 'unchanged' });
        expect(planQuoteSave({ text: '새는 알에서 나온다.', page: '' }, current)).toEqual({ kind: 'save', text: '새는 알에서 나온다.', page: null });
        expect(planQuoteSave({ text: '고친 문장', page: '10' }, current)).toEqual({ kind: 'save', text: '고친 문장', page: 10 });
        expect(planQuoteSave({ text: '', page: '10' }, current)).toEqual({ kind: 'invalid', message: '문장을 입력해 주세요.' });
    });
    test('S-50 한 감상에 한줄평과 독후감이 함께 있으면 지우는 쪽만 비우고, 남는 내용이 없으면 감상을 삭제해요', () => {
        const both = { oneLine: '한줄평', body: '독후감' };
        expect(planReviewPartDelete(both, 'oneLine')).toEqual({ kind: 'clear', oneLine: null, body: '독후감' });
        expect(planReviewPartDelete(both, 'body')).toEqual({ kind: 'clear', oneLine: '한줄평', body: null });
        expect(planReviewPartDelete({ oneLine: '한줄평', body: null }, 'oneLine')).toEqual({ kind: 'delete' });
        expect(planReviewPartDelete({ oneLine: '  ', body: '독후감' }, 'body')).toEqual({ kind: 'delete' });
    });
    test('S-50 한줄평이 든 충돌 감상이 있을 때만 한줄평 수정·삭제를 막아요', () => {
        expect(hasOneLineConflict([])).toBe(false);
        expect(hasOneLineConflict([{ oneLine: null, conflict: { latest: { oneLine: null } } }])).toBe(false);
        expect(hasOneLineConflict([{ oneLine: '기기 한줄평', conflict: {} }])).toBe(true);
        expect(hasOneLineConflict([{ oneLine: null, conflict: { latest: { oneLine: '서버 한줄평' } } }])).toBe(true);
    });
});
