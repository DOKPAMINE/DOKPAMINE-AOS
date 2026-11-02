import { Stack } from 'expo-router';

// S-81: 루트 Protected의 settings 경계 안에서 설정 화면을 연다.
export default function SettingsLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
