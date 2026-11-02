import { Stack } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { NotoSansKR_400Regular } from '@expo-google-fonts/noto-sans-kr/400Regular';
import { NotoSansKR_500Medium } from '@expo-google-fonts/noto-sans-kr/500Medium';
import { NotoSansKR_700Bold } from '@expo-google-fonts/noto-sans-kr/700Bold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { navigationTheme } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const [loaded, error] = useFonts({ NotoSansKR_400Regular, NotoSansKR_500Medium, NotoSansKR_700Bold });

    useEffect(() => {
        if (error) throw error;
        if (loaded) void SplashScreen.hideAsync();
    }, [loaded, error]);

    if (!loaded) return null;

    return (
        <ThemeProvider value={navigationTheme}>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
    );
}
