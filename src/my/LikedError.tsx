import { View } from 'react-native';
import { ApiError } from '../api/errors';
import { SecondaryButton, StateView } from '../components';
import { isBadRequest, isOfflineError } from './likedQueries';
import { likedStyles } from './likedStyles';

/** 400(잘못된 cursor 등)의 앱 고정 안내. 서버 문구는 "요청 값의 형식…"처럼 사용자가 할 일과 맞지 않아 쓰지 않는다. */
export const likedBadRequestMessage = '목록을 불러오지 못했어요. 처음부터 다시 불러와 주세요.';

/**
 * #132 FR-09 S-80 좋아요한 감상 조회 오류 안내.
 * - 오프라인: 요청하지 않고 StateView 오프라인 안내(ADR-0003)
 * - 400(잘못된 cursor 등): 앱 고정 안내 + "처음부터 다시 불러오기"
 * - 그 밖(401 포함): 라운지 QueryError처럼 서버의 한국어 안내 + 다시 시도. 401의 로그아웃·재로그인 안내는 apiRequest가 이미 처리한다.
 */
export function LikedError({ error, retry, restart }: { error: unknown; retry: () => void; restart: () => void }) {
    if (isOfflineError(error)) return <StateView kind="offline" onRetry={retry} />;
    if (isBadRequest(error)) {
        return <View style={likedStyles.restart}>
            <StateView kind="error" message={likedBadRequestMessage} />
            <SecondaryButton label="처음부터 다시 불러오기" onPress={restart} />
        </View>;
    }
    return <StateView kind="error" message={error instanceof ApiError ? error.message : undefined} onRetry={retry} />;
}
