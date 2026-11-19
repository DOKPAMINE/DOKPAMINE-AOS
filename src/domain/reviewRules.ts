import { z } from 'zod';

/** FR-07·FR-08 / S-51: 공개는 명시적으로 선택하며 기본값은 나만 보기다. */
export const reviewSchema = z.object({
    oneLine: z.string().max(100, '한줄평은 100자 이내로 입력해 주세요.').transform(value => value.trim()),
    body: z.string().max(5000, '독후감은 5,000자 이내로 입력해 주세요.').transform(value => value.trim()),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
}).refine(value => Boolean(value.oneLine || value.body), {
    message: '한줄평이나 독후감 중 하나를 입력해 주세요.', path: ['oneLine'],
});
export type ReviewFields = z.input<typeof reviewSchema>;
export const emptyReviewFields: ReviewFields = { oneLine: '', body: '', visibility: 'PRIVATE' };

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

export type ReviewSavePlan =
    | { kind: 'invalid'; message: string }
    /** oneLine이 null이면 책의 한줄평을 그대로 두고, body가 null이면 독후감을 추가하지 않는다. */
    | { kind: 'save'; oneLine: string | null; body: string | null; visibility: 'PRIVATE' | 'PUBLIC' };

/** S-51: 한줄평은 바뀐 경우에만 책의 한줄평 하나를 고치고, 독후감은 입력했을 때만 새로 추가한다. */
export function planReviewSave(fields: ReviewFields, currentOneLine: string | null | undefined): ReviewSavePlan {
    const result = reviewSchema.safeParse(fields);
    if (!result.success) return { kind: 'invalid', message: result.error.issues[0].message };
    const { oneLine, body, visibility } = result.data;
    const current = currentOneLine?.trim() ?? '';
    if (current && !oneLine) return { kind: 'invalid', message: '한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.' };
    const changed = oneLine !== current;
    if (!changed && !body) return { kind: 'invalid', message: '새로 쓴 내용이 없어요. 한줄평을 고치거나 독후감을 입력해 주세요.' };
    return { kind: 'save', oneLine: changed ? oneLine : null, body: body || null, visibility };
}

/** FR-07 / S-52: 빈 쪽수는 null, 0쪽을 포함한 정수만 저장한다. */
export const quoteSchema = z.object({
    text: z.string().max(1000, '문장은 1,000자 이내로 입력해 주세요.').trim().min(1, '문장을 입력해 주세요.'),
    page: z.string().trim().refine(value => value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))),
        '쪽수는 0 이상의 정수로 입력해 주세요.').transform(value => value === '' ? null : Number(value)),
});
export type QuoteFields = z.input<typeof quoteSchema>;
export const emptyQuoteFields: QuoteFields = { text: '', page: '' };
