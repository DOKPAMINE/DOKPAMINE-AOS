import { useCallback, useEffect, useSyncExternalStore } from 'react';
import Storage from 'expo-sqlite/kv-store';
import { parseRecentBooks, pushRecentBook, recentBooksStorageKey, removeRecentBook, type RecentBook } from '../domain/recentBooks';

/**
 * #124 S-70·S-71 최근 고른 책. 계정별 키로 기기 저장소(expo-sqlite/kv-store)에만 두고 서버로 보내지 않는다.
 * 라운지 탭과 S-71이 함께 떠 있으므로 한쪽에서 고르거나 지운 결과가 다른 쪽에도 바로 보이도록 계정별 목록을 모듈 하나가 관리한다.
 * 저장에 실패해도 화면의 목록은 바꾸고 검색은 계속 쓸 수 있다.
 * 읽기에 실패하면 화면에는 빈 목록을 보여 주지만 메모리에 담지 않아, 다음에(검색창을 다시 누르거나 책을 고를 때) 다시 읽는다.
 * 그때도 읽지 못하면 고른 책을 기록하지 않는다. 읽지 못한 기기 목록을 새 목록으로 덮어쓰지 않기 위해서다.
 * 로그아웃·계정 전환·로그인 만료 때 지우지 않는 것은 의도다. 목록은 계정별 키로 기기에 남아 다른 계정에는 보이지 않고,
 * 같은 계정으로 다시 로그인하면 그대로 보인다. 로그아웃하면 userId가 없으므로 목록이 비고 저장도 하지 않는다.
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
            .then(raw => { if (!lists.has(userId)) lists.set(userId, parseRecentBooks(raw)); }, () => {})
            .finally(() => { loads.delete(userId); emit(); });
        loads.set(userId, load);
    }
    return load;
}

async function update(userId: string, change: (books: RecentBook[]) => RecentBook[]) {
    // 읽기 전에 고르면 저장된 목록을 잃지 않도록 먼저 읽고 바꾼다.
    await ensureLoaded(userId);
    const current = lists.get(userId);
    // 읽지 못했으면 저장된 목록을 모르므로 바꾸지 않는다. 다음에 다시 읽는다.
    if (!current) return;
    const next = change(current);
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

/**
 * #124: 로그인한 계정(userId)의 최근 고른 책. 계정이 없으면 빈 목록이고 고르거나 지워도 저장하지 않는다.
 * active가 true로 바뀔 때마다(검색창 포커스) 아직 읽지 못한 목록을 다시 읽는다.
 */
export function useRecentBooks(userId: string | undefined, active = true) {
    const books = useSyncExternalStore(subscribe, () => (userId ? lists.get(userId) : undefined) ?? empty);
    useEffect(() => { if (userId && active) void ensureLoaded(userId); }, [userId, active]);
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
