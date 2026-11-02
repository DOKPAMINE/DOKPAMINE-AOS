import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, sizes, spacing, typography } from '../../src/theme';

export const unstable_settings = { initialRouteName: 'index' };

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; title: string; icon: IconName; selectedIcon: IconName }[] = [
    { name: 'shelf', title: '책장', icon: 'library-outline', selectedIcon: 'library' },
    { name: 'calendar', title: '캘린더', icon: 'calendar-outline', selectedIcon: 'calendar' },
    { name: 'index', title: '홈', icon: 'home-outline', selectedIcon: 'home' },
    { name: 'lounge', title: '라운지', icon: 'chatbubbles-outline', selectedIcon: 'chatbubbles' },
    { name: 'my', title: '마이', icon: 'person-outline', selectedIcon: 'person' },
];

export default function TabLayout() {
    const insets = useSafeAreaInsets();

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.brand.camel,
                tabBarInactiveTintColor: colors.surface.paper,
                tabBarStyle: [styles.bar, { height: sizes.tabBar + insets.bottom, paddingBottom: insets.bottom }],
                tabBarItemStyle: styles.item,
            }}
        >
            {tabs.map(({ name, title, icon, selectedIcon }) => (
                <Tabs.Screen
                    key={name}
                    name={name}
                    options={{
                        title,
                        tabBarAccessibilityLabel: title,
                        tabBarIcon: ({ focused }) => (
                            <Ionicons accessible={false} name={focused ? selectedIcon : icon} size={sizes.icon} color={focused ? colors.brand.camel : colors.surface.paper} />
                        ),
                        tabBarLabel: ({ focused }) => (
                            <Text style={[styles.label, focused && styles.selectedLabel]}>{title}</Text>
                        ),
                    }}
                />
            ))}
        </Tabs>
    );
}

const styles = StyleSheet.create({
    bar: { backgroundColor: colors.brand.espresso, borderTopColor: colors.line.border, paddingTop: spacing.xs },
    item: { minHeight: sizes.minTouch, minWidth: sizes.minTouch },
    label: { ...typography.footnote, color: colors.surface.paper },
    selectedLabel: { fontFamily: fontFamilies.bold, color: colors.brand.camel },
});
