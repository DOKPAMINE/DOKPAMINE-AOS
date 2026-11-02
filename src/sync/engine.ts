import { ApiError } from '../api/errors';
import type { BookDto, QuoteDto, ReviewDto, SessionDto, SyncSnapshot } from '../api/types';
import type { RecordRepository } from '../db/repository';
import { bookDto, quoteDto, reviewDto, sessionDto, snapshotRecords } from './serialization';

export interface SyncTransport {
    putBook(body: BookDto): Promise<unknown>;
    putSession(body: SessionDto): Promise<unknown>;
    putReview(body: ReviewDto): Promise<unknown>;
    putQuote(body: QuoteDto): Promise<unknown>;
    snapshot(): Promise<SyncSnapshot>;
}
export type SyncState = { status: 'idle' | 'syncing' | 'offline' | 'reauthentication-required' | 'error'; failedCount: number; error?: unknown };

/** NFR-04~06: 한 엔진의 복원과 업로드는 직렬 실행하며 실패 행은 삭제하지 않는다. */
export function createSyncEngine(repository: RecordRepository, transport: SyncTransport, online: () => Promise<boolean>) {
    let state: SyncState = { status: 'idle', failedCount: 0 };
    const failedRows = new Set<string>();
    let invalidSnapshotCount = 0;
    const listeners = new Set<() => void>();
    const setState = (next: Omit<SyncState, 'failedCount'>) => {
        state = { ...next, failedCount: failedRows.size + invalidSnapshotCount };
        listeners.forEach(listener => listener());
    };
    let active: Promise<void> | undefined;
    let pending = false;
    let restore = false;
    let stopped = false;
    let loginRequired = false;
    const checkStopped = () => { if (stopped) throw new Error('동기화가 중지되었어요.'); };
    const stopsUpload = (error: unknown) => error instanceof ApiError && (
        ['unauthorized', 'offline', 'network', 'timeout'].includes(error.kind) ||
        error.status === 401 || (error.status !== undefined && error.status >= 500)
    );
    async function attempt(key: string, work: () => Promise<void>) {
        try { await work(); failedRows.delete(key); } catch (error) {
            failedRows.add(key);
            if (stopsUpload(error) || stopped) throw error;
        }
    }
    async function upload() {
        async function sendBook(id: string) {
            const row = repository.books.get(id, true);
            if (!row) return;
            checkStopped();
            await transport.putBook(bookDto(row));
            if (!stopped) {
                repository.books.markSynced(row.id, row.localVersion);
                failedRows.delete(`book:${row.id}`);
            }
        }
        for (const row of repository.books.list({ includeDeleted: true, syncPending: true })) {
            await attempt(`book:${row.id}`, () => sendBook(row.id));
        }
        async function sendChildren<T extends { id: string; bookId: string; localVersion: number }>(
            kind: string,
            entity: { list(options: { includeDeleted: boolean; syncPending: boolean }): T[]; markSynced(id: string, version: number): void },
            put: (row: T) => Promise<unknown>,
        ) {
            for (const row of entity.list({ includeDeleted: true, syncPending: true })) {
                await attempt(`${kind}:${row.id}`, async () => {
                    checkStopped();
                    try { await put(row); } catch (error) {
                        if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'BOOK_NOT_SYNCED') throw error;
                        // 서버에 없는 부모는 로컬 완료 여부와 무관하게 다시 전송한다.
                        await sendBook(row.bookId);
                        checkStopped();
                        await put(row);
                    }
                    if (!stopped) entity.markSynced(row.id, row.localVersion);
                });
            }
        }
        await sendChildren('session', repository.sessions, row => transport.putSession(sessionDto(row)));
        await sendChildren('review', repository.reviews, row => transport.putReview(reviewDto(row)));
        await sendChildren('quote', repository.quotes, row => transport.putQuote(quoteDto(row)));
    }
    async function run() {
        try {
            if (!pending || stopped || loginRequired) return;
            if (!await online()) throw new ApiError('offline', 'OFFLINE', '인터넷 연결을 확인해 주세요.');
            while (pending && !stopped && !loginRequired) {
                pending = false;
                setState({ status: 'syncing' });
                let restoreError: unknown;
                if (restore) {
                    try {
                        const snapshot = snapshotRecords(await transport.snapshot());
                        if (stopped) return;
                        repository.restoreSnapshot(snapshot);
                        invalidSnapshotCount = snapshot.skippedCount;
                        restore = false;
                    } catch (error) {
                        if (error instanceof ApiError && (error.kind === 'unauthorized' || error.status === 401)) throw error;
                        restoreError = error;
                    }
                }
                await upload();
                if (!stopped) setState({ status: restoreError || failedRows.size || invalidSnapshotCount ? 'error' : 'idle', error: restoreError });
                // 복원 알림은 다음 업로드를 예약할 수 있지만 복원 실패 자체는 즉시 반복하지 않는다.
            }
        } catch (error) {
            if (stopped) return;
            pending = false;
            loginRequired = error instanceof ApiError && (error.kind === 'unauthorized' || error.status === 401);
            setState({ status: loginRequired ? 'reauthentication-required' : error instanceof ApiError && error.kind === 'offline' ? 'offline' : 'error', error });
        }
    }
    function request(afterLogin = false): Promise<void> {
        if (stopped) return Promise.resolve();
        if (afterLogin) { restore = true; loginRequired = false; }
        if (loginRequired) return Promise.resolve();
        pending = true;
        if (!active) {
            failedRows.clear();
            function finish(): Promise<void> | void {
                if (pending && !stopped && !loginRequired) return run().then(finish);
                active = undefined;
            }
            // active를 먼저 할당해 상태 구독자가 재진입해도 같은 작업을 기다리게 한다.
            active = Promise.resolve().then(run).then(finish);
        }
        return active;
    }
    return {
        sync: () => request(), afterLogin: () => request(true),
        getState: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        stop() { stopped = true; listeners.clear(); },
    };
}
export type SyncEngine = ReturnType<typeof createSyncEngine>;
