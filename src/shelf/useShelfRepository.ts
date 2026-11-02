import { useEffect, useState } from 'react';
import { initializeDatabase } from '../db/client';
import type { RecordRepository } from '../db/repository';

/** NFR-04~06: 화면은 공통 로컬 저장소만 구독한다. 쓰기의 동기화 예약도 저장소가 담당한다. */
export function useShelfRepository() {
    const [repository, setRepository] = useState<RecordRepository | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [, refresh] = useState(0);
    useEffect(() => {
        let active = true;
        let unsubscribe: (() => void) | undefined;
        void initializeDatabase().then(prepared => {
            if (!active) return;
            unsubscribe = prepared.repository.subscribe(() => refresh(value => value + 1));
            setRepository(prepared.repository);
        }).catch(() => { if (active) setError(true); });
        return () => { active = false; unsubscribe?.(); };
    }, [attempt]);
    return { repository, error, retry: () => { setError(false); setAttempt(value => value + 1); } };
}
