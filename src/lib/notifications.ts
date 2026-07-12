import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { nextOccurrenceAtHour } from '@/lib/date';

// AIからの能動メッセージを通知でも届ける（自律的に話しかける機能）
// 方針: 常時のリマインドではなく「次の1回」だけを予約する。
// 候補がない日は通知しない（話さない判断を通知にも適用し、通知疲れを防ぐ）

// フォアグラウンドでも通知を表示する
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotifyPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false; // Web版は非対応（iPhoneで利用）
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function cancelProactiveNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

// 次の通知時刻（住んでいる国の hour 時）に1件だけ予約する
export async function scheduleProactiveMessage(body: string, hour: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelProactiveNotifications();
  const fireAt = nextOccurrenceAtHour(hour);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sarjavex AI',
      body,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
  });
}
