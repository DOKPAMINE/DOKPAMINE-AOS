import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { initializeDatabase } from '../db/client';
import type { RecordRepository } from '../db/repository';
import type { BookRecord, SessionRecord } from '../db/schema';

type CalendarRecords =
    | { kind: 'loading' | 'error' }
    | { kind: 'ready'; books: BookRecord[]; sessions: SessionRecord[] };

/** S-60~62 / NFR-04: 로컬 저장소만 읽고 편집·삭제·동기화 변경을 구독한다. */
export function useCalendarRecords() {
    const [records, setRecords] = useState<CalendarRecords>({ kind: 'loading' });
    const [attempt, setAttempt] = useState(0);

    useFocusEffect(useCallback(() => {
        let active = true;
        let repository: RecordRepository | undefined;
        let unsubscribe: (() => void) | undefined;
        const refresh = () => {
            if (!active || !repository) return;
            try {
                setRecords({ kind: 'ready', books: repository.books.list(), sessions: repository.sessions.list() });
            } catch {
                setRecords({ kind: 'error' });
            }
        };
        void (async () => {
            try {
                const prepared = await initializeDatabase();
                if (!active) return;
                repository = prepared.repository;
                unsubscribe = repository.subscribe(refresh);
                refresh();
            } catch {
                if (active) setRecords({ kind: 'error' });
            }
        })();
        const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
        return () => { active = false; unsubscribe?.(); appState.remove(); };
    // 재시도 시 초기화와 구독을 다시 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]));

    return { records, retry: () => { setRecords({ kind: 'loading' }); setAttempt(value => value + 1); } };
}
