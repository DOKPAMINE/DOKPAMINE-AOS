import { z } from 'zod';

type ReviewEntry = { id: string; oneLine: string | null; body: string | null; createdAt: number; updatedAt: number };

/** PRD A3 / S-31·S-50: 책의 한줄평은 한줄평이 든 감상 중 가장 최근에 고친 하나다. */
export function bookOneLine<T extends ReviewEntry>(reviews: readonly T[]): T | undefined {
    return reviews.filter(review => review.oneLine?.trim())
        .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0];
}

/** S-50: 독후감은 독서마다 쌓이며 최신 작성 순으로 보여 준다. */
export function bookReports<T extends ReviewEntry>(reviews: readonly T[]): T[] {
    return reviews.filter(review => review.body?.trim())
        .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

const visibilitySchema = z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE');
type Visibility = z.output<typeof visibilitySchema>;

/**
 * FR-08 / S-31: 공개 범위는 책 단위로 정한다. 감상이 있으면 모두 공개일 때만 공개이고,
 * 감상이 없으면 fallback(기기에 저장한 책별 값, 없으면 S-81 기본값)을 따른다.
 * 공개 범위가 섞인 책은 앱 전체 알림(mixedVisibilityBooks)으로 사용자가 하나로 맞추므로,
 * 그 전의 짧은 순간에는 공개되지 않은 감상이 있다는 사실대로 비공개로 본다.
 */
export function bookVisibility(reviews: readonly { visibility: Visibility }[], fallback: Visibility): Visibility {
    if (reviews.length === 0) return fallback;
    return reviews.every(review => review.visibility === 'PUBLIC') ? 'PUBLIC' : 'PRIVATE';
}

/**
 * FR-08 / S-31: 감상(충돌·삭제 제외)의 공개 범위가 섞인 책을 제목 순으로 찾는다.
 * 책 단위 공개 범위가 도입되기 전의 예전 데이터와, 감상마다 공개 범위를 고르는 S-50 충돌 해결로
 * 다시 섞인 경우 모두 이 규칙으로 찾아 같은 알림에서 한 권씩 고르게 한다.
 */
export function mixedVisibilityBooks<B extends { id: string; title: string }>(
    books: readonly B[], reviews: readonly { bookId: string; visibility: Visibility }[],
): B[] {
    const mixed = mixedVisibilityBookIds(reviews);
    return books.filter(book => mixed.has(book.id))
        .sort((a, b) => a.title.localeCompare(b.title, 'ko') || a.id.localeCompare(b.id));
}

/** FR-08 / S-31: 공개 범위가 섞인 책 ID만 먼저 골라, 그 책들만 읽을 수 있게 한다. */
export function mixedVisibilityBookIds(reviews: readonly { bookId: string; visibility: Visibility }[]): Set<string> {
    const found = new Map<string, Set<Visibility>>();
    for (const review of reviews) found.set(review.bookId, (found.get(review.bookId) ?? new Set()).add(review.visibility));
    return new Set([...found].filter(([, visibilities]) => visibilities.size > 1).map(([bookId]) => bookId));
}

/**
 * FR-08 / S-31: 비공개 감상을 공개로 바꿀 때만 확인하고, 비공개로 바꾸는 것은 바로 적용한다.
 * 감상이 없는 책은 공개될 감상이 없으므로 확인하지 않는다.
 */
export function needsPublishConfirm(current: Visibility, next: Visibility, reviewCount: number): boolean {
    return reviewCount > 0 && next === 'PUBLIC' && current !== 'PUBLIC';
}

/** FR-07·FR-08 / S-51: 한줄평 쓰기 화면은 100자 입력칸 하나만 두고, 공개 범위는 화면이 책 단위 값으로 채운다. */
export const oneLineSchema = z.object({
    text: z.string().max(100, '한줄평은 100자 이내로 입력해 주세요.').trim().min(1, '한줄평을 입력해 주세요.'),
    visibility: visibilitySchema,
});
export type OneLineFields = z.input<typeof oneLineSchema>;

/** #91: unchanged는 고친 것이 없다는 뜻이다. 화면은 DB에 다시 쓰지 않고 저장한 것처럼 닫는다. */
export type OneLineSavePlan = { kind: 'invalid'; message: string } | { kind: 'unchanged' } | { kind: 'save'; text: string; visibility: Visibility };

/** S-51: 한줄평은 책당 하나라 기존 한줄평을 비울 수 없다. 내용·공개 범위가 그대로면 다시 쓰지 않도록 unchanged를 돌려준다(#91). */
export function planOneLineSave(fields: OneLineFields, current?: { oneLine: string | null; visibility: Visibility }): OneLineSavePlan {
    if (current && !fields.text.trim()) return { kind: 'invalid', message: '한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.' };
    const result = oneLineSchema.safeParse(fields);
    if (!result.success) return { kind: 'invalid', message: result.error.issues[0].message };
    const { text, visibility } = result.data;
    if (current && text === current.oneLine?.trim() && visibility === current.visibility) {
        return { kind: 'unchanged' };
    }
    return { kind: 'save', text, visibility };
}

/** FR-07·FR-08 / S-53: 독후감 쓰기 화면은 5,000자 입력칸 하나만 두고 저장할 때마다 새로 추가한다. 공개 범위는 책 단위 값을 쓴다. */
export const reportSchema = z.object({
    text: z.string().max(5000, '독후감은 5,000자 이내로 입력해 주세요.').trim().min(1, '독후감을 입력해 주세요.'),
    visibility: visibilitySchema,
});
export type ReportFields = z.input<typeof reportSchema>;

/** FR-07 / S-52: 빈 쪽수는 null, 0쪽을 포함한 정수만 저장한다. */
export const quoteSchema = z.object({
    text: z.string().max(1000, '문장은 1,000자 이내로 입력해 주세요.').trim().min(1, '문장을 입력해 주세요.'),
    page: z.string().trim().refine(value => value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))),
        '쪽수는 0 이상의 정수로 입력해 주세요.').transform(value => value === '' ? null : Number(value)),
});
export type QuoteFields = z.input<typeof quoteSchema>;
export const emptyQuoteFields: QuoteFields = { text: '', page: '' };

export type ReportSavePlan = { kind: 'invalid'; message: string } | { kind: 'unchanged' } | { kind: 'save'; text: string };

/** #91 S-53: 새 독후감은 입력만 확인한다. 독후감 수정은 비울 수 없고, 바뀐 것이 없으면 unchanged를 돌려준다. */
export function planReportSave(text: string, current?: { body: string | null }): ReportSavePlan {
    if (current && !text.trim()) return { kind: 'invalid', message: '독후감은 비울 수 없어요. 지우려면 감상 목록에서 삭제해 주세요.' };
    const result = reportSchema.shape.text.safeParse(text);
    if (!result.success) return { kind: 'invalid', message: result.error.issues[0].message };
    if (current && result.data === current.body?.trim()) return { kind: 'unchanged' };
    return { kind: 'save', text: result.data };
}

/** #91 S-52: 문장 수정 화면은 기존 문장과 쪽수를 채워 연다. 쪽수가 없으면 빈 칸이다. */
export function quoteFieldsOf(quote: { text: string; page: number | null }): QuoteFields {
    return { text: quote.text, page: quote.page === null ? '' : String(quote.page) };
}

export type QuoteSavePlan = { kind: 'invalid'; message: string } | { kind: 'unchanged' } | { kind: 'save'; text: string; page: number | null };

/** #91 S-52: 검증은 새 문장과 같다. 문장 수정에서 바뀐 것이 없으면 unchanged를 돌려준다. */
export function planQuoteSave(fields: QuoteFields, current?: { text: string; page: number | null }): QuoteSavePlan {
    const result = quoteSchema.safeParse(fields);
    if (!result.success) return { kind: 'invalid', message: result.error.issues[0].message };
    const { text, page } = result.data;
    if (current && text === current.text.trim() && page === current.page) {
        return { kind: 'unchanged' };
    }
    return { kind: 'save', text, page };
}

export type ReviewPart = 'oneLine' | 'body';
export type ReviewPartDeletePlan = { kind: 'delete' } | { kind: 'clear'; oneLine: string | null; body: string | null };

/**
 * #91 S-50: 한줄평과 독후감은 따로 저장하지만(#76), 예전 데이터나 서버 기록에는 한 감상에 둘이 함께 들어 있을 수 있다.
 * 지우는 쪽만 비우고 남은 쪽은 그대로 두며, 남는 내용이 없을 때만 감상 전체를 삭제(tombstone)한다.
 */
export function planReviewPartDelete(review: { oneLine: string | null; body: string | null }, part: ReviewPart): ReviewPartDeletePlan {
    const rest = part === 'oneLine' ? review.body : review.oneLine;
    if (!rest?.trim()) return { kind: 'delete' };
    return part === 'oneLine' ? { kind: 'clear', oneLine: null, body: review.body } : { kind: 'clear', oneLine: review.oneLine, body: null };
}

/**
 * #91 S-50: 해결하지 않은 충돌 감상에 한줄평이 들어 있으면 책의 한줄평을 고치거나 지우지 못하게 한다.
 * 충돌한 감상은 목록에서 빠지므로, 막지 않으면 그 아래 예전 한줄평을 고치거나 새 한줄평이 생겨 한줄평이 둘이 된다.
 */
export function hasOneLineConflict(conflicts: readonly { oneLine: string | null; conflict: { latest?: { oneLine: string | null } | null } | null }[]): boolean {
    return conflicts.some(review => Boolean(review.oneLine?.trim() || review.conflict?.latest?.oneLine?.trim()));
}

export const conflictLockMessage = '동기화 충돌을 먼저 해결하면 수정·삭제할 수 있어요.';
