import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { initializeDatabase } from '../db/client';
import type { RecordRepository } from '../db/repository';
import type { BookRecord, QuoteRecord, ReviewRecord } from '../db/schema';

type Records = { kind: 'loading' | 'error' } | {
    kind: 'ready'; repository: RecordRepository; book: BookRecord | null; reviews: ReviewRecord[]; conflicts: ReviewRecord[]; quotes: QuoteRecord[];
};

/** S-50~S-52 / NFR-04: 서버 없이 로컬 기록을 읽고 구독한다. */
export function useReviewRecords(bookId: string) {
    const [records, setRecords] = useState<Records>({ kind: 'loading' });
    const [attempt, setAttempt] = useState(0);
    useFocusEffect(useCallback(() => {
        let active = true;
        let unsubscribe: (() => void) | undefined;
        void initializeDatabase().then(({ repository }) => {
            if (!active) return;
            const refresh = () => {
                if (!active) return;
                try {
                    setRecords({ kind: 'ready', repository, book: repository.books.get(bookId),
                        reviews: repository.reviews.list({ bookId }).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)),
                        conflicts: repository.reviews.conflicts(bookId),
                        quotes: repository.quotes.list({ bookId }).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)),
                    });
                } catch { setRecords({ kind: 'error' }); }
            };
            unsubscribe = repository.subscribe(refresh);
            refresh();
        }).catch(() => { if (active) setRecords({ kind: 'error' }); });
        return () => { active = false; unsubscribe?.(); };
    // 재시도는 초기화와 구독을 다시 실행하는 키다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, attempt]));
    return { records, retry: () => { setRecords({ kind: 'loading' }); setAttempt(value => value + 1); } };
}
