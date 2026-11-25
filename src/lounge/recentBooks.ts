import { useCallback, useEffect, useSyncExternalStore } from 'react';
import Storage from 'expo-sqlite/kv-store';
import { parseRecentBooks, pushRecentBook, recentBooksStorageKey, removeRecentBook, type RecentBook } from '../domain/recentBooks';

/**
 * #124 S-70·S-71 최근 고른 책. 계정별 키로 기기 저장소(expo-sqlite/kv-store)에만 두고 서버로 보내지 않는다.
 * 라운지 탭과 S-71이 함께 떠 있으므로 한쪽에서 고르거나 지운 결과가 다른 쪽에도 바로 보이도록 계정별 목록을 모듈 하나가 관리한다.
 * 저장에 실패해도 화면의 목록은 바꾸고 검색은 계속 쓸 수 있다. 읽기에 실패하면 빈 목록으로 본다.
 */
const lists = new Map<string, RecentBook[]>();
const loads = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const empty: RecentBook[] = [];
// 고르기·지우기가 빠르게 이어져도 마지막 목록이 마지막에 저장되도록 쓰기를 순서대로 한다.
let writes: Promise<unknown> = Promise.resolve();

function emit() { for (const listener of listeners) listener(); }

function ensureLoaded(userId: string): Promise<void> {
    if (lists.has(userId)) return Promise.resolve();
    let load = loads.get(userId);
    if (!load) {
        load = Storage.getItemAsync(recentBooksStorageKey(userId))
            .then(raw => parseRecentBooks(raw), () => [])
            .then(books => { if (!lists.has(userId)) lists.set(userId, books); })
            .finally(() => { loads.delete(userId); emit(); });
        loads.set(userId, load);
    }
    return load;
}

async function update(userId: string, change: (books: RecentBook[]) => RecentBook[]) {
    // 읽기 전에 고르면 저장된 목록을 잃지 않도록 먼저 읽고 바꾼다.
    await ensureLoaded(userId);
    const next = change(lists.get(userId) ?? []);
    lists.set(userId, next);
    emit();
    const key = recentBooksStorageKey(userId);
    writes = writes.catch(() => {}).then(async () => {
        if (next.length > 0) await Storage.setItemAsync(key, JSON.stringify(next));
        else await Storage.removeItemAsync(key);
    }).catch(() => {});
    await writes;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** #124: 로그인한 계정(userId)의 최근 고른 책. 계정이 없으면 빈 목록이고 고르거나 지워도 저장하지 않는다. */
export function useRecentBooks(userId: string | undefined) {
    const books = useSyncExternalStore(subscribe, () => (userId ? lists.get(userId) : undefined) ?? empty);
    useEffect(() => { if (userId) void ensureLoaded(userId); }, [userId]);
    const add = useCallback((book: RecentBook) => { if (userId) void update(userId, list => pushRecentBook(list, book)); }, [userId]);
    const remove = useCallback((bookKey: string) => { if (userId) void update(userId, list => removeRecentBook(list, bookKey)); }, [userId]);
    const clear = useCallback(() => { if (userId) void update(userId, () => []); }, [userId]);
    return { books, add, remove, clear };
}

/** #124: 메모리에 읽어 둔 목록을 버린다. 다음에 화면이 열리면 기기 저장소에서 다시 읽는다(테스트에서 테스트마다 비울 때 쓴다). */
export function forgetRecentBooks() {
    lists.clear();
    loads.clear();
    emit();
}
