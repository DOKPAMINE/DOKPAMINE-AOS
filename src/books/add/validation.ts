import { z } from 'zod';
import { isBookGenre, normalizeIsbn, parseTotalPages } from '../../domain/bookAddRules';

export const bookAddSchema = z.object({
    title: z.string().trim().min(1, '제목을 입력해 주세요.').max(200, '제목은 200자 이내로 입력해 주세요.'),
    author: z.string().trim().min(1, '저자를 입력해 주세요.').max(100, '저자는 100자 이내로 입력해 주세요.'),
    totalPages: z.string().refine(value => parseTotalPages(value) !== null, '전체 쪽수는 1 이상의 정수로 입력해 주세요.'),
    genre: z.string().refine((value): boolean => isBookGenre(value), '목록에서 장르를 선택해 주세요.'),
    isbn: z.string().refine(value => !value.trim() || normalizeIsbn(value) !== null, '올바른 ISBN을 입력해 주세요.'),
    publisher: z.string().trim().max(100, '출판사는 100자 이내로 입력해 주세요.'),
    coverUrl: z.string(),
});
export type BookAddValues = z.infer<typeof bookAddSchema>;
export const emptyBookValues: BookAddValues = { title: '', author: '', totalPages: '', genre: '', isbn: '', publisher: '', coverUrl: '' };
