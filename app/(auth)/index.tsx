import { Redirect } from 'expo-router';
import { useAuth } from '../../src/auth/AuthProvider';

// S-01/S-02 · FR-10/FR-18: 보호 화면 전환의 공통 진입점
export default function AuthEntry() {
    const { status } = useAuth();
    return <Redirect href={status === 'onboarding' ? '/(auth)/onboarding' : '/(auth)/login'} />;
}
