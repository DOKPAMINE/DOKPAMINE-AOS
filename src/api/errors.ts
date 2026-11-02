export type ApiErrorKind = 'offline' | 'unauthorized' | 'http' | 'timeout' | 'network' | 'invalid-response' | 'configuration' | 'storage';

/** message는 StateView 등에 그대로 전달할 수 있는 한국어 안내다. */
export class ApiError extends Error {
    constructor(
        public readonly kind: ApiErrorKind,
        public readonly code: string,
        message: string,
        public readonly status?: number,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export const offlineError = () => new ApiError('offline', 'OFFLINE', '인터넷 연결을 확인해 주세요.');
