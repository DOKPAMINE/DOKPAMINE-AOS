import { ApiError } from '../api/errors';
import { StateView } from '../components';

export const removedReviewMessage = '삭제됐거나 비공개로 바뀐 감상이에요.';

export function QueryError({ error, retry }: { error: unknown; retry?: () => void }) {
    // #91 S-72: 서버의 404는 감상이 삭제됐거나 비공개로 바뀌었다는 뜻이다. 오류 대신 그 사실을 알린다.
    if (error instanceof ApiError && error.status === 404) return <StateView kind="empty" message={removedReviewMessage} />;
    return <StateView kind={error instanceof ApiError && error.kind === 'offline' ? 'offline' : 'error'}
        message={error instanceof ApiError && error.kind !== 'offline' ? error.message : undefined} onRetry={retry} />;
}
