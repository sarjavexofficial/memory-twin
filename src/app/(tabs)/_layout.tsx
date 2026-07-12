import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { DarkColors, glow, LightColors } from '@/constants/app-colors';
import { useStrings } from '@/lib/i18n';
import { useThemeName } from '@/lib/theme';

export default function TabLayout() {
  const L = useStrings();
  const isLight = useThemeName() === 'light';
  const AppColors = isLight ? LightColors : DarkColors;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: AppColors.accent,
        tabBarInactiveTintColor: AppColors.muted,
        // 画面下に浮かぶ丸型タブバー（近未来感の演出）
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 10,
          height: 62,
          borderRadius: 24,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: AppColors.line,
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(14, 22, 48, 0.94)',
          paddingTop: 6,
          paddingBottom: 8,
          ...glow(AppColors.accent, 18, isLight ? 0.15 : 0.25),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: L.tabToday,
          tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          title: L.tabMemory,
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: L.tabTimeline,
          tabBarIcon: ({ color, size }) => <Ionicons name="git-commit-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: L.tabSettings,
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
