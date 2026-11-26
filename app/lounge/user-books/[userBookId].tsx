import { useLocalSearchParams } from 'expo-router';
import { UserBookReviewsScreen } from '../../../src/lounge/UserBookReviewsScreen';

// S-76 · FR-08, FR-09 책 감상 모음: 한 사람이 한 책에 쓴 공개 한줄평·독후감과 좋아요
// #132: S-80 하위 좋아요한 감상 목록에서 열면(from=liked) 아래 버튼을 "돌아가기"로 보여 준다.
export default function UserBookReviewsRoute() {
    const { userBookId, from } = useLocalSearchParams<{ userBookId?: string | string[]; from?: string | string[] }>();
    return <UserBookReviewsScreen userBookId={typeof userBookId === 'string' ? userBookId : ''}
        backLabel={from === 'liked' ? '돌아가기' : undefined} />;
}
