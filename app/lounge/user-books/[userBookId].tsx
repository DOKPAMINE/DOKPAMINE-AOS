import { useLocalSearchParams } from 'expo-router';
import { UserBookReviewsScreen } from '../../../src/lounge/UserBookReviewsScreen';

// S-76 · FR-08, FR-09 책 감상 모음: 한 사람이 한 책에 쓴 공개 한줄평·독후감과 좋아요
export default function UserBookReviewsRoute() {
    const { userBookId } = useLocalSearchParams<{ userBookId?: string | string[] }>();
    return <UserBookReviewsScreen userBookId={typeof userBookId === 'string' ? userBookId : ''} />;
}
