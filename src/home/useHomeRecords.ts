import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { initializeDatabase } from '../db/client';
import type { RecordRepository } from '../db/repository';
import type { BookRecord, SessionRecord } from '../db/schema';
import { thisWeekSeconds } from '../domain/calendarRules';
import { kstDate } from '../domain/kstDate';
import { readingStreak } from '../domain/readingSummary';

type HomeRecords =
    | { kind: 'loading' | 'error' }
    | { kind: 'ready'; books: BookRecord[]; sessions: SessionRecord[] };

/** S-10 / NFR-04: 서버를 거치지 않고 공통 기록 저장소를 읽고 변경을 구독한다. */
export function useHomeRecords() {
    const [records, setRecords] = useState<HomeRecords>({ kind: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const [now, setNow] = useState(Date.now);

    useFocusEffect(useCallback(() => {
        let active = true;
        let repository: RecordRepository | undefined;
        let unsubscribe: (() => void) | undefined;
        const refresh = () => {
            if (!active || !repository) return;
            setNow(Date.now());
            try {
                setRecords({ kind: 'ready', books: repository.books.list(), sessions: repository.sessions.list() });
            } catch {
                setRecords({ kind: 'error' });
            }
        };

        void initializeDatabase().then(prepared => {
            if (!active) return;
            repository = prepared.repository;
            unsubscribe = repository.subscribe(refresh);
            refresh();
        }).catch(() => { if (active) setRecords({ kind: 'error' }); });

        const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
        // 화면을 계속 열어 두어도 KST 날짜에 따라 도메인 집계를 다시 계산한다.
        const clock = setInterval(() => { if (active) setNow(Date.now()); }, 60_000);
        return () => {
            active = false;
            unsubscribe?.();
            appState.remove();
            clearInterval(clock);
        };
    // 재시도 시 초기화부터 다시 실행하기 위한 의도적인 구독 재생성 키다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]));

    const today = kstDate(now);
    const sessions = records.kind === 'ready' ? records.sessions : [];
    const books = records.kind === 'ready' ? records.books : [];
    return {
        records,
        // FR-05 / S-10: 마이(S-80) 현재 연속일과 같은 함수·기준(하루 합계 10분 이상)을 쓴다.
        streak: readingStreak(sessions, books, today).current,
        weekSeconds: thisWeekSeconds(sessions, today),
        retry: () => { setRecords({ kind: 'loading' }); setAttempt(value => value + 1); },
    };
}
