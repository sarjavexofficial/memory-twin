import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppPalette } from '@/constants/app-colors';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { useSettings } from '@/store/settings-context';

// アプリロック: 設定でONのとき、起動時とバックグラウンド復帰時に
// Face ID / Touch ID（未設定端末は端末パスコード）での本人確認を要求する。
// 中身を隠すのが目的なので、解除まで全画面を覆う（zIndexは最前面）。
// Webは生体認証が使えないためロックしない（設定画面側でも案内している）
export function AppLockGate() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { settings, isLoaded } = useSettings();
  const enabled = isLoaded && settings.appLock === true && Platform.OS !== 'web';

  const [locked, setLocked] = useState(false);
  const authInFlight = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (authInFlight.current) return;
    authInFlight.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: L.appLockPrompt,
      });
      if (result.success) setLocked(false);
    } catch {
      // 認証ダイアログ自体が出せない端末でも、ロック画面のボタンから再試行できる
    } finally {
      authInFlight.current = false;
    }
  }, [L.appLockPrompt]);

  // 起動時: 設定の読み込みが終わってロックONと分かったら施錠して認証を出す
  useEffect(() => {
    if (enabled) {
      setLocked(true);
      tryUnlock();
    }
  }, [enabled, tryUnlock]);

  // バックグラウンドへ行ったら施錠（復帰時に認証を出す）
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  if (!enabled || !locked) return null;

  return (
    <View style={styles.cover}>
      <Ionicons name="lock-closed" size={44} color={AppColors.accent} />
      <Text style={styles.title}>Memory Twin</Text>
      <Text style={styles.message}>{L.appLockLockedMessage}</Text>
      <Pressable style={styles.button} onPress={tryUnlock}>
        <Text style={styles.buttonText}>{L.appLockUnlockButton}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    cover: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100, // すべてのバナー・画面より上（中身を見せないためのロック）
      backgroundColor: AppColors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: 32,
    },
    title: { color: AppColors.text, fontSize: 22, fontWeight: '700' },
    message: { color: AppColors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    button: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: AppColors.accent,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    buttonText: { color: AppColors.accent, fontSize: 15, fontWeight: '600' },
  });

const themed = makeThemed(makeStyles);
