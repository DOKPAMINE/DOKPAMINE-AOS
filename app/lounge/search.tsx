import { useLocalSearchParams } from 'expo-router';
import { BookReviewsScreen } from '../../src/lounge/BookReviewsScreen';

// S-71 · FR-16 책별 공개 감상 목록
export default function BookReviewsRoute() {
    const { query } = useLocalSearchParams<{ query?: string | string[] }>();
    return <BookReviewsScreen query={typeof query === 'string' ? query : ''} />;
}
