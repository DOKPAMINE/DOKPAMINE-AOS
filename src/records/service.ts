import type { RecordRepository } from '../db/repository';
import { currentPageAfterSave, toManualSession, type ValidManualSession } from '../domain/manualSessionRules';

function findBook(repository: RecordRepository, bookId: string) {
    const book = repository.books.get(bookId);
    if (!book) throw new Error('책을 찾을 수 없어요.');
    return book;
}

/** FR-02·04 / S-36·D-02: 쓰기는 저장소만 사용하며 진행 쪽 저장 실패도 같은 작업으로 재시도한다. */
export function prepareRecordSave(repository: RecordRepository, bookId: string, id: string, input: ValidManualSession, now: number, editing: boolean) {
    findBook(repository, bookId);
    const existing = repository.sessions.get(id);
    if (editing && (!existing || existing.bookId !== bookId)) throw new Error('수정할 기록을 찾을 수 없어요.');
    const before = repository.sessions.list({ bookId });
    const record = toManualSession(input, id, bookId, existing, now);
    return () => {
        const book = findBook(repository, bookId);
        repository.sessions.save(record);
        const currentPage = currentPageAfterSave(book.currentPage, book.totalPages, before, repository.sessions.list({ bookId }));
        if (currentPage !== book.currentPage) repository.books.save({ ...book, currentPage });
    };
}

export function prepareRecordDelete(repository: RecordRepository, bookId: string, id: string) {
    findBook(repository, bookId);
    const record = repository.sessions.get(id);
    if (!record || record.bookId !== bookId) throw new Error('삭제할 기록을 찾을 수 없어요.');
    const before = repository.sessions.list({ bookId });
    return () => {
        const book = findBook(repository, bookId);
        repository.sessions.softDelete(id);
        const currentPage = currentPageAfterSave(book.currentPage, book.totalPages, before, repository.sessions.list({ bookId }));
        if (currentPage !== book.currentPage) repository.books.save({ ...book, currentPage });
    };
}
