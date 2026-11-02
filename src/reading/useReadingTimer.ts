import { uuid } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { tokenStorage } from '../api/tokenStorage';
import { initializeDatabase } from '../db/client';
import { suggestedStartPage } from '../domain/pageRules';
import { parseStartPage, stopAtReadingCheck } from '../domain/timerFlow';
import { finishTimer, pauseTimer, resumeTimer, startTimer, type TimerState } from '../domain/timerState';
import { requestReadingPermission } from './notifications';
import { saveReading } from './saveReading';
import { readingStorage, type ReadingDraft } from './storage';

type Prepared = Awaited<ReturnType<typeof initializeDatabase>>;
const STORAGE_ERROR = '저장하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.';

export function useReadingTimer(bookId: string | undefined) {
    const [prepared, setPrepared] = useState<Prepared | null>(null);
    const [draft, setDraft] = useState<ReadingDraft | null>(null);
    const [startPage, setStartPage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [now, setNow] = useState(Date.now);
    const storage = useRef<ReturnType<typeof readingStorage> | null>(null);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    useEffect(() => {
        let active = true;
        let unsubscribe: (() => void) | undefined;
        void (async () => {
            const account = await tokenStorage.getSession();
            if (!account) throw new Error('로그인이 필요해요.');
            const records = await initializeDatabase(account.userId);
            const store = readingStorage(account.userId);
            let restored = store.load();
            if (restored) {
                restored = { ...restored, timer: stopAtReadingCheck(restored.timer, restored.confirmedChecks, Date.now()) };
                store.save(restored);
            }
            const book = records.repository.books.get(restored?.timer.bookId ?? bookId ?? '');
            if (!active) return;
            const alreadySaved = Boolean(restored && records.repository.sessions.get(restored.timer.sessionId));
            if (alreadySaved) store.clear();
            storage.current = store;
            setDraft(restored);
            setSaved(alreadySaved);
            setStartPage(book ? String(suggestedStartPage(book.currentPage, book.totalPages)) : '');
            setPrepared(records);
            unsubscribe = records.repository.subscribe(() => setNow(Date.now()));
        })().catch(() => { if (active) setLoadError(true); });
        return () => { active = false; unsubscribe?.(); };
    }, [bookId, attempt]);

    const commit = (next: ReadingDraft): boolean => {
        try {
            if (!storage.current) throw new Error('저장소를 준비하고 있어요.');
            storage.current.save(next);
            setDraft(next);
            setError(null);
            setNow(Date.now());
            return true;
        } catch { setError(STORAGE_ERROR); return false; }
    };

    useEffect(() => {
        const update = () => {
            const timestamp = Date.now();
            if (draft && !saved) {
                const checked = stopAtReadingCheck(draft.timer, draft.confirmedChecks, timestamp);
                if (checked !== draft.timer) {
                    try {
                        const next = { ...draft, timer: checked };
                        storage.current!.save(next);
                        setDraft(next);
                    } catch { setError(STORAGE_ERROR); }
                }
            }
            setNow(timestamp);
        };
        const interval = setInterval(update, 1000);
        const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
        return () => { clearInterval(interval); subscription.remove(); };
    }, [draft, saved]);

    const book = prepared?.repository.books.get(draft?.timer.bookId ?? bookId ?? '') ?? null;
    const transition = (change: (timer: TimerState, timestamp: number) => TimerState) => {
        if (!draft) return;
        const timestamp = Date.now();
        commit({ ...draft, timer: change(stopAtReadingCheck(draft.timer, draft.confirmedChecks, timestamp), timestamp) });
    };
    return {
        ready: prepared !== null, book, draft, now, startPage, setStartPage, error, setError, loadError, notice, saved,
        retry: () => { setPrepared(null); setLoadError(false); setAttempt(value => value + 1); },
        start() {
            if (!book || draft) return;
            try {
                const page = parseStartPage(startPage, book.totalPages);
                const next = { timer: startTimer(uuid.v4(), book.id, page, Date.now()), confirmedChecks: 0 };
                if (commit(next)) void requestReadingPermission().then(message => { if (mounted.current) setNotice(message); });
            } catch (cause) { setError(cause instanceof Error ? cause.message : STORAGE_ERROR); }
        },
        pause: () => transition(pauseTimer), resume: () => transition(resumeTimer), finish: () => transition(finishTimer),
        setEndPage(text: string) { if (draft) commit({ ...draft, timer: { ...draft.timer, endPageDraft: text } }); },
        confirmCheck(continueReading: boolean) {
            if (!draft) return;
            const timestamp = Date.now();
            const paused = stopAtReadingCheck(draft.timer, draft.confirmedChecks, timestamp);
            commit({ timer: continueReading ? resumeTimer(paused, timestamp) : pauseTimer(paused, timestamp), confirmedChecks: draft.confirmedChecks + 1 });
        },
        save(complete: boolean) {
            if (!draft || !prepared) return;
            try {
                prepared.repository.atomic(() => saveReading(prepared.repository, draft.timer, complete, Date.now()));
                storage.current!.clear();
                setSaved(true);
                setError(null);
            } catch { setError(STORAGE_ERROR); }
        },
    };
}
