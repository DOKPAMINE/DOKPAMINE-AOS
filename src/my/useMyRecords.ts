import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { initializeDatabase } from '../db/client';
import type { RecordRepository } from '../db/repository';
import type { BookRecord, SessionRecord, SyncRejection } from '../db/schema';
import { subscribeSyncState } from '../sync';

type MyRecords = { kind: 'loading' | 'error' } | {
    kind: 'ready'; books: BookRecord[]; sessions: SessionRecord[]; conflictBooks: { id: string; title: string }[]; rejections: SyncRejection[]; now: number;
};

/** S-80 / NFR-04: 누적 기록·연속 독서일에 쓸 로컬 기록과 동기화 문제(감상 충돌·서버 거절)를 기존 읽기 API로 조회한다. */
export function useMyRecords() {
    const [records, setRecords] = useState<MyRecords>({ kind: 'loading' });
    const [attempt, setAttempt] = useState(0);
    useFocusEffect(useCallback(() => {
        let active = true;
        let repository: RecordRepository | undefined;
        let unsubscribe: (() => void) | undefined;
        const refresh = () => {
            if (!active || !repository) return;
            try {
                const conflictBookIds = new Set(repository.reviews.conflicts().map(row => row.bookId));
                const conflictBooks = Array.from(conflictBookIds, id => ({
                    id, title: repository?.books.get(id, true)?.title ?? '삭제된 책',
                }));
                setRecords({ kind: 'ready', books: repository.books.list(), sessions: repository.sessions.list(), conflictBooks,
                    rejections: repository.syncRejections.list(), now: Date.now() });
            } catch { setRecords({ kind: 'error' }); }
        };
        void initializeDatabase().then(prepared => {
            if (!active) return;
            repository = prepared.repository;
            unsubscribe = repository.subscribe(refresh);
            refresh();
        }).catch(() => { if (active) setRecords({ kind: 'error' }); });
        // markSynced는 기록 구독을 알리지 않으므로 전송 상태 변경도 함께 구독한다.
        const stopSync = subscribeSyncState(refresh);
        const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
        return () => { active = false; unsubscribe?.(); stopSync(); appState.remove(); };
    // 재시도는 초기화와 구독을 다시 실행하는 키다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]));
    return { records, retry: () => { setRecords({ kind: 'loading' }); setAttempt(value => value + 1); } };
}
