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

/** FR-07 / S-52: 빈 쪽수는 null, 0쪽을 포함한 정수만 저장한다. */
export const quoteSchema = z.object({
    text: z.string().max(1000, '문장은 1,000자 이내로 입력해 주세요.').trim().min(1, '문장을 입력해 주세요.'),
    page: z.string().trim().refine(value => value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))),
        '쪽수는 0 이상의 정수로 입력해 주세요.').transform(value => value === '' ? null : Number(value)),
    memo: z.string().max(500, '메모는 500자 이내로 입력해 주세요.').transform(value => value.trim()),
});
export type QuoteFields = z.input<typeof quoteSchema>;
export const emptyQuoteFields: QuoteFields = { text: '', page: '', memo: '' };
