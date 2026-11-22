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
    const found = new Map<string, Set<Visibility>>();
    for (const review of reviews) found.set(review.bookId, (found.get(review.bookId) ?? new Set()).add(review.visibility));
    return books.filter(book => (found.get(book.id)?.size ?? 0) > 1)
        .sort((a, b) => a.title.localeCompare(b.title, 'ko') || a.id.localeCompare(b.id));
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

export type OneLineSavePlan = { kind: 'invalid'; message: string } | { kind: 'save'; text: string; visibility: Visibility };

/** S-51: 한줄평은 책당 하나라 기존 한줄평을 비울 수 없고, 내용·공개 범위가 그대로면 저장하지 않는다. */
export function planOneLineSave(fields: OneLineFields, current?: { oneLine: string | null; visibility: Visibility }): OneLineSavePlan {
    if (current && !fields.text.trim()) return { kind: 'invalid', message: '한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.' };
    const result = oneLineSchema.safeParse(fields);
    if (!result.success) return { kind: 'invalid', message: result.error.issues[0].message };
    const { text, visibility } = result.data;
    if (current && text === current.oneLine?.trim() && visibility === current.visibility) {
        return { kind: 'invalid', message: '바뀐 내용이 없어요. 한줄평을 고친 뒤 저장해 주세요.' };
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
