import { useLocalSearchParams } from 'expo-router';
import { UserBookReviewsScreen } from '../../../src/lounge/UserBookReviewsScreen';

// S-76 · FR-08, FR-09 책 감상 모음: 한 사람이 한 책에 쓴 공개 한줄평·독후감과 좋아요
// #132: S-80 하위 좋아요한 감상 목록에서 열면(from=liked) 아래 버튼을 "돌아가기"로 보여 주고, 이전 화면이 없으면 그 목록으로 간다.
// 그 밖의 from 값(없음·배열·다른 문자열)은 라운지에서 연 것으로 본다.
export default function UserBookReviewsRoute() {
    const { userBookId, from } = useLocalSearchParams<{ userBookId?: string | string[]; from?: string | string[] }>();
    const liked = from === 'liked';
    return <UserBookReviewsScreen userBookId={typeof userBookId === 'string' ? userBookId : ''}
        backLabel={liked ? '돌아가기' : undefined} backFallback={liked ? '/liked-reviews' : undefined} />;
}
