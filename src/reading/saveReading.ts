import type { RecordRepository } from '../db/repository';
import { parseEndPage } from '../domain/pageRules';
import { completeReading } from '../domain/shelfRules';
import { toTimerSession, type TimerState } from '../domain/timerState';

/** FR-02·03 / S-45: 세션 UUID로 재시도를 멱등 처리한다. 호출자는 DB 트랜잭션으로 감싼다. */
export function saveReading(repository: RecordRepository, timer: TimerState, complete: boolean, now: number) {
    const existing = repository.sessions.get(timer.sessionId, true);
    if (existing) {
        if (existing.deleted || existing.bookId !== timer.bookId) throw new Error('저장할 기록을 확인해 주세요.');
        return existing;
    }
    const book = repository.books.get(timer.bookId);
    if (!book) throw new Error('책을 찾을 수 없어요.');
    const page = parseEndPage(timer.endPageDraft, timer.startPage, book.totalPages);
    if (page.kind === 'invalid') throw new Error(page.message);
    const result = toTimerSession(timer, page, book.currentPage, now);
    const nextBook = { ...book, currentPage: book.status === 'DONE' ? book.currentPage : result.currentPage, status: book.status === 'WANT' ? 'READING' as const : book.status };
    repository.books.save(complete ? completeReading(nextBook, timer.finishedAtMs!) : nextBook);
    return repository.sessions.save(result.session);
}
