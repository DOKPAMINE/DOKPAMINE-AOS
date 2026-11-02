import { Stack } from 'expo-router';

// S-31~S-34 · FR-10: 루트의 book Protected 등록 아래에 상세·편집을 묶는다.
export default function BookLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
