import { catalogIsbn } from '../../api/endpoints';
import { isOnline } from '../../api/connectivity';
import { ApiError, offlineError } from '../../api/errors';
import { initializeDatabase } from '../../db/client';
import type { EntityRepository } from '../../db/repository';
import type { BookRecord } from '../../db/schema';
import { isBookGenre, normalizeIsbn, parseTotalPages } from '../../domain/bookAddRules';
import { bookAddSchema, emptyBookValues, type BookAddValues } from './validation';

export async function lookupBook(isbn: string): Promise<BookAddValues> {
    const normalized = normalizeIsbn(isbn);
    if (!normalized) throw new Error('올바른 ISBN을 입력해 주세요.');
    if (!await isOnline()) throw offlineError();
    const result = await catalogIsbn(normalized);
    return {
        ...emptyBookValues, isbn: normalized, title: result.title ?? '', author: result.author ?? '',
        publisher: result.publisher ?? '', coverUrl: result.coverUrl ?? '',
        totalPages: result.totalPages == null ? '' : String(result.totalPages),
        genre: result.genre && isBookGenre(result.genre) ? result.genre : '',
    };
}

export function findExistingBook(books: EntityRepository<BookRecord>, isbn: string): BookRecord | undefined {
    const normalized = normalizeIsbn(isbn);
    return normalized ? books.list().find(book => !book.deleted && book.isbn && normalizeIsbn(book.isbn) === normalized) : undefined;
}

/** NFR-04~06 / S-22·S-25: 중복 확인과 저장 사이에는 await를 두지 않는다. */
export function saveNewBook(books: EntityRepository<BookRecord>, values: BookAddValues, status: 'READING' | 'WANT', id: string) {
    const valid = bookAddSchema.parse(values);
    const existing = findExistingBook(books, valid.isbn);
    if (existing) return { kind: 'duplicate' as const, book: existing };
    const book = books.save({
        id, title: valid.title, author: valid.author, totalPages: parseTotalPages(valid.totalPages)!,
        genre: isBookGenre(valid.genre) ? valid.genre : '기타', isbn: normalizeIsbn(valid.isbn),
        publisher: valid.publisher.trim() || null, coverUrl: valid.coverUrl || null,
        status, currentPage: 0, completedCount: 0, completedAt: null,
    });
    return { kind: 'saved' as const, book };
}

export async function getBookRepository() {
    return (await initializeDatabase()).repository.books;
}

export function bookAddError(error: unknown): string {
    return error instanceof ApiError ? error.message : '책 정보를 저장하거나 불러오지 못했어요. 다시 시도해 주세요.';
}
