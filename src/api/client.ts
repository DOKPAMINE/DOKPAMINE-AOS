import { isOnline } from './connectivity';
import { ApiError, offlineError } from './errors';
import { tokenStorage } from './tokenStorage';
import { notifyUnauthorized } from './authEvents';

export interface ApiRequestOptions {
    method?: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    authenticated?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** 동기화는 엔진 시작 시의 토큰에 고정한다. 계정 전환 후 새 토큰을 빌리지 않는다. */
    accessToken?: string;
}

function getBaseUrl(): string {
    // Expo는 EXPO_PUBLIC_ 접두사의 정적 접근만 번들에 삽입한다. 비밀값을 넣지 않는다.
    const value = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
    if (!value || !/^https?:\/\/[^/\s?#]+(?:\/[^\s?#]*)?$/.test(value)) {
        throw new ApiError('configuration', 'API_BASE_URL_MISSING', '서버 주소 설정을 확인해 주세요.');
    }
    return value.replace(/\/+$/, '');
}

function isErrorBody(value: unknown): value is { code: string; message: string } {
    return typeof value === 'object' && value !== null &&
        'code' in value && typeof value.code === 'string' &&
        'message' in value && typeof value.message === 'string';
}

/** 화면은 개인 기록을 직접 PUT하지 않고 이후 공통 기록 저장소를 통해 저장한다. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestToken: string | null = null;
    let rejectCancellation: (error: ApiError) => void = () => {};
    const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    const cancel = () => {
        rejectCancellation(new ApiError('cancelled', 'CANCELLED', '요청을 취소했어요.'));
        controller.abort();
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();

    const request = async (): Promise<T> => {
        if (controller.signal.aborted) return await cancellation;
        if (!await isOnline()) throw offlineError();
        if (controller.signal.aborted) return await cancellation;
        const baseUrl = getBaseUrl();
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (options.authenticated !== false) {
            let token: string | null;
            try {
                token = options.accessToken ?? await tokenStorage.get();
            } catch {
                throw new ApiError('storage', 'TOKEN_STORAGE_FAILED', '로그인 정보를 불러오지 못했어요. 다시 시도해 주세요.');
            }
            // SecureStore를 기다리던 중 타임아웃이 발생했다면 뒤늦은 요청을 보내지 않는다.
            if (controller.signal.aborted) throw new ApiError('timeout', 'TIMEOUT', '서버 응답이 늦어요. 다시 시도해 주세요.');
            if (!token) throw new ApiError('unauthorized', 'AUTH_REQUIRED', '로그인이 필요해요.');
            headers.Authorization = `Bearer ${token}`;
            requestToken = token;
        }

        const response = await fetch(`${baseUrl}${path}`, {
            method: options.method ?? 'GET',
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: controller.signal,
        });
        if (controller.signal.aborted) throw new ApiError('cancelled', 'CANCELLED', '요청을 취소했어요.');
        if (response.status === 204 && response.ok) return undefined as T;
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            // HTML/빈 오류 응답도 HTTP 상태(특히 401)를 보존한다.
            if (response.ok) throw new ApiError('invalid-response', 'INVALID_RESPONSE', '서버 응답을 확인하지 못했어요.');
        }
        if (controller.signal.aborted) throw new ApiError('cancelled', 'CANCELLED', '요청을 취소했어요.');
        if (!response.ok) {
            const invalidCredentials = options.authenticated === false && response.status === 401;
            if (response.status === 401 && requestToken) notifyUnauthorized(requestToken);
            throw new ApiError(
                invalidCredentials ? 'credentials' : response.status === 401 ? 'unauthorized' : 'http',
                isErrorBody(body) ? body.code : `HTTP_${response.status}`,
                typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string' && /[가-힣]/.test(body.message) ? body.message.trim() : invalidCredentials ? '이메일 또는 비밀번호를 확인해 주세요.' : response.status === 401 ? '다시 로그인해 주세요.' : '요청을 처리하지 못했어요. 다시 시도해 주세요.',
                response.status,
            );
        }
        return body as T;
    };

    try {
        return await Promise.race([
            request(),
            cancellation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    reject(new ApiError('timeout', 'TIMEOUT', '서버 응답이 늦어요. 다시 시도해 주세요.'));
                    controller.abort();
                }, options.timeoutMs ?? 10_000);
            }),
        ]);
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('network', 'NETWORK_ERROR', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', cancel);
    }
}
