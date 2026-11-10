import { ApiError } from '../../api/errors';
import type { SyncSnapshot } from '../../api/types';
import { prepareRecordDatabase } from '../../db/client';
import { createRecordRepository, type RecordRepository, type SaveInput } from '../../db/repository';
import type { BookRecord, SessionRecord } from '../../db/schema';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import { createSyncEngine, type SyncTransport } from '../engine';
import { bookDto, quoteDto, reviewDto, sessionDto } from '../serialization';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../runtime', () => ({ startRecordSync: jest.fn() }));
const id = (last: number) => `00000000-0000-4000-8000-${String(last).padStart(12, '0')}`;
const book: SaveInput<BookRecord> = { id: id(1), title: '데미안', author: '헤세', isbn: null, publisher: null,
    totalPages: 240, currentPage: 0, genre: '소설', coverUrl: null, status: 'READING', completedCount: 0, completedAt: null };
const session: SaveInput<SessionRecord> = { id: id(2), bookId: book.id, startedAt: 1000, endedAt: 61000,
    activeSeconds: 60, startPage: 0, endPage: 84, source: 'TIMER' };
let memory: ReturnType<typeof memorySQLite>;
let records: RecordRepository;
let transport: jest.Mocked<SyncTransport>;
let online: jest.Mock<Promise<boolean>, []>;
const empty = (): SyncSnapshot => ({ books: [], sessions: [], reviews: [], quotes: [] });
beforeEach(async () => {
    memory = memorySQLite();
    const { db } = await prepareRecordDatabase(memory.sqlite);
    records = createRecordRepository(db, () => 100000);
    records.books.save(book);
    records.sessions.save(session);
    transport = { putBook: jest.fn().mockResolvedValue(undefined), putSession: jest.fn().mockResolvedValue(undefined),
        putReview: jest.fn().mockResolvedValue(undefined), putQuote: jest.fn().mockResolvedValue(undefined), snapshot: jest.fn().mockResolvedValue(empty()) };
    online = jest.fn().mockResolvedValue(true);
});
afterEach(() => memory.connection.close());

test('NFR-04·05 S-80 책 → 세션 → 감상 → 문장 순서로 tombstone도 전송해요', async () => {
    records.reviews.save({ id: id(3), bookId: book.id, oneLine: '좋아요', body: null, visibility: 'PRIVATE', publishedAt: null });
    records.quotes.save({ id: id(4), bookId: book.id, text: '문장', page: 10, memo: null });
    records.books.softDelete(book.id);
    const order: string[] = [];
    transport.putBook.mockImplementation(async () => { order.push('book'); });
    transport.putSession.mockImplementation(async () => { order.push('session'); });
    transport.putReview.mockImplementation(async () => { order.push('review'); });
    transport.putQuote.mockImplementation(async () => { order.push('quote'); });
    await createSyncEngine(records, transport, online).sync();
    expect(order).toEqual(['book', 'session', 'review', 'quote']);
    for (const entity of [records.books, records.sessions, records.reviews, records.quotes]) {
        expect(entity.list({ includeDeleted: true })).toEqual([expect.objectContaining({ deleted: true, syncPending: false })]);
    }
    expect(transport.putBook.mock.calls[0][0]).not.toHaveProperty('syncPending');
    expect(transport.putSession.mock.calls[0][0]).not.toHaveProperty('localVersion');
});

test('NFR-05 S-80 서버에 책이 없어 세션이 409면 완료된 부모도 먼저 다시 올리고 재시도해요', async () => {
    const row = records.books.get(book.id)!;
    records.books.markSynced(row.id, row.localVersion);
    const order: string[] = [];
    transport.putSession.mockImplementationOnce(async () => { order.push('session:409'); throw new ApiError('http', 'BOOK_NOT_SYNCED', '책 없음', 409); })
        .mockImplementationOnce(async () => { order.push('session:ok'); });
    transport.putBook.mockImplementation(async () => { order.push('book'); });
    await createSyncEngine(records, transport, online).sync();
    expect(order).toEqual(['session:409', 'book', 'session:ok']);
    expect(records.sessions.get(session.id)?.syncPending).toBe(false);
});

test('NFR-05 S-80 409가 계속되어도 무한 반복하지 않고 다음 전송까지 대기해요', async () => {
    transport.putSession.mockRejectedValue(new ApiError('http', 'BOOK_NOT_SYNCED', '책 없음', 409));
    const engine = createSyncEngine(records, transport, online);
    await engine.sync();
    expect(transport.putSession).toHaveBeenCalledTimes(2);
    expect(records.sessions.get(session.id)?.syncPending).toBe(true);
    transport.putSession.mockResolvedValue(undefined);
    await engine.sync();
    expect(records.sessions.get(session.id)?.syncPending).toBe(false);
});

test('NFR-05 S-02 401이면 대기 기록과 UUID를 보존하고 재로그인 상태를 알려요', async () => {
    transport.putBook.mockRejectedValue(new ApiError('unauthorized', 'TOKEN_EXPIRED', '다시 로그인해 주세요.', 401));
    const engine = createSyncEngine(records, transport, online);
    const listener = jest.fn();
    engine.subscribe(listener);
    const before = records.books.get(book.id);
    await engine.sync();
    expect(engine.getState().status).toBe('reauthentication-required');
    expect(records.books.get(book.id)).toEqual(before);
    expect(records.sessions.get(session.id)?.syncPending).toBe(true);
    expect(transport.putSession).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    await engine.sync();
    expect(transport.putBook).toHaveBeenCalledTimes(1);
    transport.putBook.mockResolvedValue(undefined);
    await engine.afterLogin();
    expect(transport.snapshot).toHaveBeenCalledTimes(1);
    expect(records.books.get(book.id)?.syncPending).toBe(false);
});

test('NFR-05 S-45 전송 도중 같은 행을 다시 저장하면 이전 완료 응답이 대기를 해제하지 않아요', async () => {
    transport.putSession.mockImplementationOnce(async () => { records.sessions.save({ ...session, endPage: 90 }); });
    await createSyncEngine(records, transport, online).sync();
    expect(records.sessions.get(session.id)).toMatchObject({ endPage: 90, syncPending: true, localVersion: 100001 });
});

test('NFR-06 S-80 오프라인이면 요청하지 않고 복구 후 전송해요', async () => {
    online.mockResolvedValue(false);
    const engine = createSyncEngine(records, transport, online);
    await engine.afterLogin();
    expect(engine.getState().status).toBe('offline');
    expect(transport.snapshot).not.toHaveBeenCalled();
    expect(transport.putBook).not.toHaveBeenCalled();
    online.mockResolvedValue(true);
    await engine.sync();
    expect(transport.snapshot).toHaveBeenCalledTimes(1);
    expect(records.sessions.get(session.id)?.syncPending).toBe(false);
});

test('NFR-06 S-80 전송 도중 연결이 끊기면 후속 요청을 멈춰요', async () => {
    records.reviews.save({ id: id(3), bookId: book.id, oneLine: '감상', body: null, visibility: 'PRIVATE', publishedAt: null });
    transport.putSession.mockRejectedValue(new ApiError('network', 'NETWORK_ERROR', '연결 끊김'));
    const engine = createSyncEngine(records, transport, online);
    await engine.sync();
    expect(transport.putReview).not.toHaveBeenCalled();
    expect(records.sessions.get(session.id)?.syncPending).toBe(true);
    expect(engine.getState().status).toBe('error');
    expect(online).toHaveBeenCalledTimes(1);
});

test('NFR-04·05 S-02 로그인 snapshot을 책·세션·감상·문장 모두 복원해요', async () => {
    records.reviews.save({ id: id(3), bookId: book.id, oneLine: '한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    records.quotes.save({ id: id(4), bookId: book.id, text: '문장', page: null, memo: null });
    const snapshot: SyncSnapshot = { books: records.books.list().map(bookDto), sessions: records.sessions.list().map(sessionDto),
        reviews: records.reviews.list().map(reviewDto), quotes: records.quotes.list().map(quoteDto) };
    const target = memorySQLite();
    try {
        const { repository } = await prepareRecordDatabase(target.sqlite);
        transport.snapshot.mockResolvedValue(snapshot);
        await createSyncEngine(repository, transport, online).afterLogin();
        expect(repository.books.get(book.id)).toMatchObject({ title: '데미안', createdAt: 100000, syncPending: false });
        expect(repository.sessions.get(session.id)).toMatchObject({ startedAt: 1000, endedAt: 61000, endPage: 84, syncPending: false });
        expect(repository.reviews.get(id(3))).toMatchObject({ oneLine: '한줄평', visibility: 'PRIVATE', syncPending: false });
        expect(repository.quotes.get(id(4))).toMatchObject({ text: '문장', page: null, syncPending: false });
        expect(transport.putBook).not.toHaveBeenCalled();
    } finally { target.connection.close(); }
});

test('NFR-04·05 S-02 snapshot은 로컬 수정·삭제 대기와 서버에 없는 로컬 행을 보존해요', async () => {
    const snapshot = { ...empty(), books: [bookDto(records.books.get(book.id)!)], sessions: [sessionDto(records.sessions.get(session.id)!)] };
    records.books.save({ ...book, title: '로컬 수정' });
    records.sessions.softDelete(session.id);
    records.books.save({ ...book, id: id(5), title: '서버에 없는 책' });
    transport.snapshot.mockResolvedValue(snapshot);
    await createSyncEngine(records, transport, online).afterLogin();
    expect(records.books.get(book.id)?.title).toBe('로컬 수정');
    expect(records.books.get(id(5))?.title).toBe('서버에 없는 책');
    expect(records.sessions.get(session.id, true)?.deleted).toBe(true);
    expect(transport.putSession).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }));
});

test('NFR-04 S-02 잘못된 snapshot 행만 건너뛰고 정상 행 복원과 업로드를 진행해요', async () => {
    const dto = bookDto(records.books.get(book.id)!);
    transport.snapshot.mockResolvedValue({ ...empty(), books: [{ ...dto, id: id(5) }],
        reviews: [{ id: id(6), bookId: id(5), oneLine: null, body: null, visibility: 'PRIVATE', deleted: false, createdAt: dto.createdAt, updatedAt: dto.updatedAt }] });
    const engine = createSyncEngine(records, transport, online);
    await engine.afterLogin();
    expect(engine.getState()).toMatchObject({ status: 'error', failedCount: 1 });
    expect(records.books.get(id(5))?.title).toBe('데미안');
    expect(records.reviews.get(id(6))).toBeNull();
    expect(records.books.get(book.id)?.syncPending).toBe(false);
});

test.each([400, 403])('NFR-05 S-80 %s 행 뒤의 행과 다음 기록 종류는 전송된다', async status => {
    records.books.save({ ...book, id: id(5), title: '다음 책' });
    records.sessions.save({ ...session, id: id(6), bookId: id(5) });
    transport.putBook.mockRejectedValueOnce(new ApiError('http', 'REJECTED', '거부됨', status));
    transport.putSession.mockRejectedValueOnce(new ApiError('http', 'REJECTED', '거부됨', status));
    const engine = createSyncEngine(records, transport, online);
    await engine.sync();
    expect(records.books.get(book.id)?.syncPending).toBe(true);
    expect(records.books.get(id(5))?.syncPending).toBe(false);
    expect(records.sessions.get(session.id)?.syncPending).toBe(true);
    expect(records.sessions.get(id(6))?.syncPending).toBe(false);
    expect(engine.getState()).toMatchObject({ status: 'error', failedCount: 2 });
    await engine.sync();
    expect(engine.getState()).toMatchObject({ status: 'idle', failedCount: 0 });
});

test.each([
    new ApiError('http', 'SERVER_ERROR', '서버 오류', 503),
    new ApiError('timeout', 'TIMEOUT', '시간 초과'),
    new ApiError('offline', 'OFFLINE', '오프라인'),
])('NFR-05·06 S-80 일시 장애 $code는 전체 전송을 중단하고 대기를 보존해요', async error => {
    records.books.save({ ...book, id: id(5) });
    transport.putBook.mockRejectedValueOnce(error);
    await createSyncEngine(records, transport, online).sync();
    expect(transport.putBook).toHaveBeenCalledTimes(1);
    expect(transport.putSession).not.toHaveBeenCalled();
    expect(records.books.list({ syncPending: true })).toHaveLength(2);
});

test('NFR-05 S-02 snapshot 5xx 실패도 기기 기록 업로드를 막지 않아요', async () => {
    transport.snapshot.mockRejectedValueOnce(new ApiError('http', 'SERVER_ERROR', '복원 실패', 503));
    const engine = createSyncEngine(records, transport, online);
    await engine.afterLogin();
    expect(records.sessions.get(session.id)?.syncPending).toBe(false);
    expect(engine.getState().status).toBe('error');
    await engine.sync();
    expect(transport.snapshot).toHaveBeenCalledTimes(2);
    expect(engine.getState().status).toBe('idle');
});

test('NFR-05 S-45 실행 종료 직전 마이크로태스크의 새 요청도 완료 전에 전송해요', async () => {
    const engine = createSyncEngine(records, transport, online);
    let requested = false;
    engine.subscribe(() => {
        if (engine.getState().status !== 'idle' || requested) return;
        requested = true;
        records.sessions.save({ ...session, endPage: 90 });
        void Promise.resolve().then(() => engine.sync());
    });
    await engine.sync();
    expect(transport.putSession).toHaveBeenCalledTimes(2);
    expect(records.sessions.get(session.id)).toMatchObject({ endPage: 90, syncPending: false });
});

test('NFR-04 S-02 snapshot 복원은 구독자에게 알리고 기존 공개 시각을 유지해요', async () => {
    const review = records.reviews.save({ id: id(3), bookId: book.id, oneLine: '기존 감상', body: null, visibility: 'PUBLIC', publishedAt: 12345 });
    records.reviews.markSynced(review.id, review.localVersion);
    const listener = jest.fn();
    records.subscribe(listener);
    transport.snapshot.mockResolvedValue({ ...empty(), reviews: [{ ...reviewDto(review), oneLine: '복원 감상' }] });
    await createSyncEngine(records, transport, online).afterLogin();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(records.reviews.get(review.id)).toMatchObject({ oneLine: '복원 감상', publishedAt: 12345 });
});

test('NFR-04 S-02 잘못된 책·시각·세션·문장은 건너뛰고 정상 snapshot 행은 복원해요', async () => {
    const dto = bookDto(records.books.get(book.id)!);
    const sessionRecord = sessionDto(records.sessions.get(session.id)!);
    transport.snapshot.mockResolvedValue({
        books: [{ ...dto, id: id(5), title: '' }, { ...dto, id: id(6), updatedAt: 'invalid' }, { ...dto, id: id(7) }],
        sessions: [{ ...sessionRecord, id: id(8), bookId: id(7), endPage: 241 }],
        reviews: [],
        quotes: [{ id: id(9), bookId: id(7), text: '', deleted: false, createdAt: dto.createdAt, updatedAt: dto.updatedAt }],
    });
    const engine = createSyncEngine(records, transport, online);
    await engine.afterLogin();
    expect(records.books.get(id(5))).toBeNull();
    expect(records.books.get(id(6))).toBeNull();
    expect(records.books.get(id(7))?.syncPending).toBe(false);
    expect(records.sessions.get(id(8))).toBeNull();
    expect(records.quotes.get(id(9))).toBeNull();
    expect(engine.getState().failedCount).toBe(4);
    expect(records.sessions.get(session.id)?.syncPending).toBe(false);
});

test('NFR-05 S-02 snapshot 401은 업로드도 멈추고 재로그인 상태를 알려요', async () => {
    transport.snapshot.mockRejectedValue(new ApiError('unauthorized', 'TOKEN_EXPIRED', '로그인 필요', 401));
    const engine = createSyncEngine(records, transport, online);
    await engine.afterLogin();
    expect(transport.putBook).not.toHaveBeenCalled();
    expect(engine.getState().status).toBe('reauthentication-required');
    expect(records.books.get(book.id)?.syncPending).toBe(true);
});

test('NFR-06 S-80 여러 대기 행이 있어도 엔진의 연결 조회는 실행 시작 한 번만 해요', async () => {
    records.books.save({ ...book, id: id(5) });
    await createSyncEngine(records, transport, online).sync();
    expect(online).toHaveBeenCalledTimes(1);
    expect(transport.putBook).toHaveBeenCalledTimes(2);
    expect(transport.putSession).toHaveBeenCalledTimes(1);
});

test('NFR-05 S-80 동시에 전송을 요청해도 HTTP 전송을 중복 실행하지 않아요', async () => {
    const engine = createSyncEngine(records, transport, online);
    await Promise.all([engine.sync(), engine.sync(), engine.sync()]);
    expect(transport.putBook).toHaveBeenCalledTimes(1);
    expect(transport.putSession).toHaveBeenCalledTimes(1);
});

test('NFR-05 S-81 로그아웃 중 도착한 응답은 기록의 대기를 해제하지 않아요', async () => {
    const engine = createSyncEngine(records, transport, online);
    transport.putBook.mockImplementation(async () => { engine.stop(); });
    await engine.sync();
    expect(records.books.get(book.id)?.syncPending).toBe(true);
    expect(transport.putSession).not.toHaveBeenCalled();
});

test('NFR-05 S-51 첫 PUT 응답의 버전으로 전송 중 편집과 다음 삭제를 동기화해요', async () => {
    const draft = { id: id(3), bookId: book.id, oneLine: '첫 감상', body: null, visibility: 'PRIVATE' as const, publishedAt: null };
    records.reviews.save(draft);
    transport.putReview.mockImplementationOnce(async request => {
        records.reviews.save({ ...draft, oneLine: '전송 중 수정' });
        return { ...request, version: 0 };
    }).mockImplementation(async request => ({ ...request, version: (request.version ?? 0) + 1 }));
    const engine = createSyncEngine(records, transport, online);
    await engine.sync();
    expect(transport.putReview.mock.calls[0][0]).not.toHaveProperty('version');
    expect(records.reviews.get(draft.id)).toMatchObject({ serverVersion: 0, syncPending: true, oneLine: '전송 중 수정' });
    await engine.sync();
    expect(transport.putReview.mock.calls[1][0]).toMatchObject({ version: 0, oneLine: '전송 중 수정' });
    records.reviews.softDelete(draft.id);
    await engine.sync();
    expect(transport.putReview.mock.calls[2][0]).toMatchObject({ version: 1, deleted: true });
});

test('NFR-05·09 S-50 오래된 공개 초안은 최신 비공개 감상을 확인하고 선택할 때까지 전송하지 않아요', async () => {
    const draft = { id: id(3), bookId: book.id, oneLine: '로컬 초안', body: null, visibility: 'PUBLIC' as const, publishedAt: null };
    const initial = records.reviews.save(draft);
    records.reviews.markSynced(initial.id, initial.localVersion);
    const server = { ...reviewDto(initial), oneLine: '서버 초기 감상', version: 0 };
    transport.snapshot.mockResolvedValueOnce({ ...empty(), reviews: [server] });
    const engine = createSyncEngine(records, transport, online);
    await engine.afterLogin();
    expect(records.reviews.get(draft.id)?.serverVersion).toBe(0);

    records.reviews.save(draft);
    transport.putReview.mockRejectedValueOnce(new ApiError('http', 'REVIEW_VERSION_CONFLICT', '버전 충돌', 409));
    transport.snapshot.mockResolvedValueOnce({ ...empty(), reviews: [{ ...server, visibility: 'PRIVATE', oneLine: '서버 최신 감상', version: 2 }] });
    await engine.sync();
    const restarted = createSyncEngine(records, transport, online);
    await restarted.sync();
    expect(transport.putReview).toHaveBeenCalledTimes(1);
    expect(records.reviews.get(draft.id)).toMatchObject({
        oneLine: '로컬 초안', serverVersion: 0, syncPending: true,
        conflict: { latest: { oneLine: '서버 최신 감상', visibility: 'PRIVATE', version: 2 } },
    });

    records.reviews.resolveConflict(draft.id, 2, 'PRIVATE', id(4));
    transport.putReview.mockImplementationOnce(async request => ({ ...request, version: 3 }));
    await restarted.sync();
    expect(transport.putReview.mock.calls[1][0]).toMatchObject({ version: 2, visibility: 'PRIVATE', oneLine: '로컬 초안' });
    expect(records.reviews.get(draft.id)).toMatchObject({ conflict: null, serverVersion: 3, syncPending: false });
});

test('NFR-05·09 S-50 서버에서 삭제한 감상은 초안을 다시 저장할 때 새 ID로 생성해요', async () => {
    const draft = records.reviews.save({ id: id(3), bookId: book.id, oneLine: '로컬 초안', body: null, visibility: 'PRIVATE', publishedAt: null });
    transport.putReview.mockRejectedValueOnce(new ApiError('http', 'REVIEW_VERSION_CONFLICT', '버전 충돌', 409));
    const engine = createSyncEngine(records, transport, online);
    await engine.sync();
    expect(records.reviews.get(draft.id)).toMatchObject({ conflict: { latest: null }, oneLine: '로컬 초안' });

    records.reviews.resolveConflict(draft.id, null, 'PRIVATE', id(4));
    await engine.sync();
    expect(records.reviews.get(draft.id)).toBeNull();
    expect(transport.putReview.mock.calls[1][0]).toMatchObject({ id: id(4), oneLine: '로컬 초안' });
    expect(transport.putReview.mock.calls[1][0]).not.toHaveProperty('version');
});
