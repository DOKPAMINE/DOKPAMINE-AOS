// 요청에 사용한 토큰을 전달해 이전 세션의 늦은 401이 새 로그인을 무효화하지 않게 한다.
const listeners = new Set<(token: string) => void>();
const unauthorizedTokens = new Set<string>();

export const wasUnauthorized = (token: string): boolean => unauthorizedTokens.has(token);

export function onUnauthorized(listener: (token: string) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function notifyUnauthorized(token: string): void {
    unauthorizedTokens.add(token);
    listeners.forEach(listener => listener(token));
}
