import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AiWakingBanner } from '@/components/ai-waking-banner';
import { AppLockGate } from '@/components/app-lock-gate';
import { ErrorBoundary } from '@/components/error-boundary';
import { SaveErrorBanner } from '@/components/save-error-banner';
import { warmUpSarjavex } from '@/lib/ai';
import { AuthProvider } from '@/store/auth-context';
import { JournalProvider } from '@/store/journal-context';
import { PeopleProvider } from '@/store/people-context';
import { SettingsProvider } from '@/store/settings-context';
import { TasksProvider } from '@/store/tasks-context';

SplashScreen.preventAutoHideAsync();
SplashScreen.hideAsync();

export default function RootLayout() {
  // 起動直後に裏でAIサーバーを起こしておく（無料サーバーのスリープ対策）
  useEffect(() => {
    warmUpSarjavex();
  }, []);

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
        <PeopleProvider>
          <JournalProvider>
          <TasksProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="person/[id]" options={{ presentation: 'card' }} />
              <Stack.Screen name="add-person" options={{ presentation: 'card' }} />
              <Stack.Screen name="edit-person/[id]" options={{ presentation: 'card' }} />
              <Stack.Screen name="import-history" options={{ presentation: 'card' }} />
              <Stack.Screen name="plans" options={{ presentation: 'card' }} />
              <Stack.Screen name="review" options={{ presentation: 'card' }} />
              <Stack.Screen name="insights" options={{ presentation: 'card' }} />
              <Stack.Screen name="monthly-report" options={{ presentation: 'card' }} />
              <Stack.Screen name="onboarding" options={{ presentation: 'card', gestureEnabled: false }} />
            </Stack>
            <SaveErrorBanner />
            <AiWakingBanner />
            <AppLockGate />
          </TasksProvider>
          </JournalProvider>
        </PeopleProvider>
        </AuthProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
