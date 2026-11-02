import { Stack } from 'expo-router';
import { useAuth } from '../../src/auth/AuthProvider';

export const unstable_settings = { initialRouteName: 'index' };

// S-01~03 · FR-10/FR-18: 안내 완료 뒤에는 뒤로 가기로도 다시 열리지 않는다.
export default function AuthLayout() {
    const { status } = useAuth();
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Protected guard={status === 'onboarding'}>
                <Stack.Screen name="onboarding" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'signedOut'}>
                <Stack.Screen name="login" />
                <Stack.Screen name="signup" />
            </Stack.Protected>
        </Stack>
    );
}
