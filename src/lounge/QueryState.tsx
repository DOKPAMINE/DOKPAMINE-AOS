import { ApiError } from '../api/errors';
import { StateView } from '../components';

export function QueryError({ error, retry }: { error: unknown; retry?: () => void }) {
    if (error instanceof ApiError && error.status === 404) return <StateView kind="empty" message="볼 수 없는 감상이에요" />;
    return <StateView kind={error instanceof ApiError && error.kind === 'offline' ? 'offline' : 'error'}
        message={error instanceof ApiError && error.kind !== 'offline' ? error.message : undefined} onRetry={retry} />;
}
