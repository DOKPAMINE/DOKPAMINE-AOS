/**
 * #124 테스트용 expo-sqlite/kv-store. Jest가 node_modules 모듈 대신 자동으로 쓴다.
 * 기기 저장소를 메모리 Map으로 흉내 내며, 테스트는 __store로 저장된 값을 보고 __reset으로 비운다.
 */
const store = new Map<string, string>();

const Storage = {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    removeItemAsync: jest.fn(async (key: string) => store.delete(key)),
};

export const __store = store;
export function __reset() {
    store.clear();
    Storage.getItemAsync.mockImplementation(async (key: string) => store.get(key) ?? null);
    Storage.setItemAsync.mockImplementation(async (key: string, value: string) => { store.set(key, value); });
    Storage.removeItemAsync.mockImplementation(async (key: string) => store.delete(key));
}
export { Storage, Storage as AsyncStorage };
export default Storage;
