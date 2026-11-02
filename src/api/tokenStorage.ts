import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'dokpamine.accessToken';

/** 401에서는 삭제하지 않는다. 삭제는 명시적 로그아웃에서만 호출한다(ADR-0003). */
export const tokenStorage = {
    save: (token: string): Promise<void> => SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token),
    get: (): Promise<string | null> => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    remove: (): Promise<void> => SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
};
