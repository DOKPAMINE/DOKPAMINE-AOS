import { Stack } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { NotoSansKR_400Regular } from '@expo-google-fonts/noto-sans-kr/400Regular';
import { NotoSansKR_500Medium } from '@expo-google-fonts/noto-sans-kr/500Medium';
import { NotoSansKR_700Bold } from '@expo-google-fonts/noto-sans-kr/700Bold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { navigationTheme } from '../src/theme';
import { connectQueryManagers, queryClient } from '../src/api/queryClient';
import { initializeDatabase } from '../src/db/client';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const [loaded, error] = useFonts({ NotoSansKR_400Regular, NotoSansKR_500Medium, NotoSansKR_700Bold });
    const [databaseReady, setDatabaseReady] = useState(false);
    const [databaseError, setDatabaseError] = useState<unknown>(null);

    useEffect(() => {
        let mounted = true;
        void initializeDatabase().then(() => { if (mounted) setDatabaseReady(true); })
            .catch(cause => { if (mounted) setDatabaseError(cause); });
        return () => { mounted = false; };
    }, []);

    // 폰트를 불러오지 못해도 시스템 글꼴로 앱을 열어 스플래시에 갇히지 않게 합니다.
    const ready = (loaded || error != null) && databaseReady;

    useEffect(() => connectQueryManagers(), []);

    useEffect(() => {
        if (ready) void SplashScreen.hideAsync();
    }, [ready]);

    if (databaseError) throw databaseError;
    if (!ready) return null;

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider value={navigationTheme}>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false }} />
            </ThemeProvider>
        </QueryClientProvider>
    );
}
