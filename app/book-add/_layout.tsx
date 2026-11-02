import { Stack } from 'expo-router';

// S-20~S-25: 책 등록 흐름의 Android 뒤로 가기를 유지한다.
export default function BookAddLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
