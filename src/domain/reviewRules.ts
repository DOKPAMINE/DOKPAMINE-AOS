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

/** FR-07·FR-08 / S-51: 한줄평 쓰기 화면은 100자 입력칸 하나와 공개 범위만 둔다. */
export const oneLineSchema = z.object({
    text: z.string().max(100, '한줄평은 100자 이내로 입력해 주세요.').trim().min(1, '한줄평을 입력해 주세요.'),
    visibility: visibilitySchema,
});
export type OneLineFields = z.input<typeof oneLineSchema>;

export type OneLineSavePlan = { kind: 'invalid'; message: string } | { kind: 'save'; text: string; visibility: Visibility };

/** S-51: 한줄평은 책당 하나라 기존 한줄평을 비울 수 없고, 내용·공개 범위가 그대로면 저장하지 않는다. */
export function planOneLineSave(fields: OneLineFields, current?: { oneLine: string | null; visibility: Visibility }): OneLineSavePlan {
    if (current && !fields.text.trim()) return { kind: 'invalid', message: '한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.' };
    const result = oneLineSchema.safeParse(fields);
    if (!result.success) return { kind: 'invalid', message: result.error.issues[0].message };
    const { text, visibility } = result.data;
    if (current && text === current.oneLine?.trim() && visibility === current.visibility) {
        return { kind: 'invalid', message: '바뀐 내용이 없어요. 한줄평이나 공개 범위를 고친 뒤 저장해 주세요.' };
    }
    return { kind: 'save', text, visibility };
}

/** FR-07·FR-08 / S-51: 독후감 쓰기 화면은 5,000자 입력칸 하나와 공개 범위만 두고, 저장할 때마다 새로 추가한다. */
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
