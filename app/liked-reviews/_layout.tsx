import { Stack } from 'expo-router';

// S-80 하위 좋아요한 감상 목록 · FR-09: 루트 Protected의 liked-reviews 경계 안에서 연다.
export default function LikedReviewsLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
