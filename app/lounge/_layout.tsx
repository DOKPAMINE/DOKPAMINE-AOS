import { Stack } from 'expo-router';

// S-71~72 · FR-08, FR-09, FR-16: 인증된 라운지 하위 화면
export default function LoungeLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
