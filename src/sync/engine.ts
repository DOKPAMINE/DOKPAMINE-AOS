import { ApiError } from '../api/errors';
import type { BookDto, ReviewDto, SessionDto } from '../api/types';
import type { RecordRepository } from '../db/repository';
import { bookDto, quoteDto, reviewDto, sessionDto, snapshotRecords, type QuoteDto, type SyncSnapshot } from './serialization';

export interface SyncTransport {
    putBook(body: BookDto): Promise<unknown>;
    putSession(body: SessionDto): Promise<unknown>;
    putReview(body: ReviewDto): Promise<unknown>;
    putQuote(body: QuoteDto): Promise<unknown>;
    snapshot(): Promise<SyncSnapshot>;
}
export type SyncState = { status: 'idle' | 'syncing' | 'offline' | 'reauthentication-required' | 'error'; error?: unknown };

/** NFR-04~06: 한 엔진의 복원과 업로드는 직렬 실행하며 실패 행은 삭제하지 않는다. */
export function createSyncEngine(repository: RecordRepository, transport: SyncTransport, online: () => Promise<boolean>) {
    let state: SyncState = { status: 'idle' };
    const listeners = new Set<() => void>();
    const setState = (next: SyncState) => { state = next; listeners.forEach(listener => listener()); };
    let active: Promise<void> | undefined;
    let pending = false;
    let restore = false;
    let stopped = false;
    let loginRequired = false;
    const checkOnline = async () => {
        if (!await online()) throw new ApiError('offline', 'OFFLINE', '인터넷 연결을 확인해 주세요.');
        if (stopped) throw new Error('동기화가 중지되었어요.');
    };
    async function upload() {
        async function sendBook(id: string) {
            const row = repository.books.get(id, true);
            if (!row) return;
            await checkOnline();
            await transport.putBook(bookDto(row));
            if (!stopped) repository.books.markSynced(row.id, row.localVersion);
        }
        for (const row of repository.books.list({ includeDeleted: true, syncPending: true })) await sendBook(row.id);
        async function sendChildren<T extends { id: string; bookId: string; localVersion: number }>(
            entity: { list(options: { includeDeleted: boolean; syncPending: boolean }): T[]; markSynced(id: string, version: number): void },
            put: (row: T) => Promise<unknown>,
        ) {
            for (const row of entity.list({ includeDeleted: true, syncPending: true })) {
                await checkOnline();
                try { await put(row); } catch (error) {
                    if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'BOOK_NOT_SYNCED') throw error;
                    // 서버 snapshot에 책이 없지만 로컬에서는 완료된 경우에도 부모를 먼저 보낸다.
                    await sendBook(row.bookId);
                    await checkOnline();
                    try { await put(row); } catch (retryError) {
                        if (retryError instanceof ApiError && retryError.status === 409 && retryError.code === 'BOOK_NOT_SYNCED') continue;
                        throw retryError;
                    }
                }
                if (!stopped) entity.markSynced(row.id, row.localVersion);
            }
        }
        await sendChildren(repository.sessions, row => transport.putSession(sessionDto(row)));
        await sendChildren(repository.reviews, row => transport.putReview(reviewDto(row)));
        await sendChildren(repository.quotes, row => transport.putQuote(quoteDto(row)));
    }
    async function run() {
        try {
            while (pending && !stopped && !loginRequired) {
                pending = false;
                await checkOnline();
                setState({ status: 'syncing' });
                if (restore) {
                    const snapshot = await transport.snapshot();
                    if (stopped) return;
                    repository.restoreSnapshot(snapshotRecords(snapshot));
                    restore = false;
                }
                await upload();
                if (!stopped) setState({ status: 'idle' });
            }
        } catch (error) {
            if (stopped) return;
            loginRequired = error instanceof ApiError && error.kind === 'unauthorized';
            setState({ status: loginRequired ? 'reauthentication-required' : error instanceof ApiError && error.kind === 'offline' ? 'offline' : 'error', error });
        }
    }
    function request(afterLogin = false): Promise<void> {
        if (stopped) return Promise.resolve();
        if (afterLogin) { restore = true; loginRequired = false; }
        pending = true;
        if (!active) active = run().finally(() => { active = undefined; });
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
