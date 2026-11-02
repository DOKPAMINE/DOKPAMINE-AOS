import { useLocalSearchParams } from 'expo-router';
import { ReviewDetailScreen } from '../../src/lounge/ReviewDetailScreen';

// S-72 · FR-08, FR-09 감상 상세·좋아요
export default function ReviewDetailRoute() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    return <ReviewDetailScreen id={typeof id === 'string' ? id : ''} />;
}
