import * as SecureStore from 'expo-secure-store';

const ONBOARDING_KEY = 'dokpamine.onboardingSeen';

export const onboardingStorage = {
    hasSeen: async (): Promise<boolean> => await SecureStore.getItemAsync(ONBOARDING_KEY) === 'true',
    complete: (): Promise<void> => SecureStore.setItemAsync(ONBOARDING_KEY, 'true'),
};
