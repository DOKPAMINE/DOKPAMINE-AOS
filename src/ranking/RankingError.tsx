import { ApiError } from '../api/errors';
import { StateView } from '../components';

export function RankingError({ error, retry }: { error: unknown; retry?: () => void }) {
    const offline = error instanceof ApiError && error.kind === 'offline';
    return <StateView kind={offline ? 'offline' : 'error'}
        message={!offline && error instanceof ApiError ? error.message : undefined} onRetry={retry} />;
}
