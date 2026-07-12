import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppPalette } from '@/constants/app-colors';
import { subscribeAiWaking } from '@/lib/ai-status';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';

// AI呼び出しが長引いているとき（＝無料サーバーの起床待ち）に全画面共通で出す案内バナー。
// 「壊れた」と誤解されないよう、待ち時間の目安を添える。表示の判断は ai-status.ts が行う
export function AiWakingBanner() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const insets = useSafeAreaInsets();
  const [waking, setWaking] = useState(false);

  useEffect(() => subscribeAiWaking(setWaking), []);

  if (!waking) return null;

  return (
    <View style={[styles.banner, { top: insets.top + 8 }]}>
      <ActivityIndicator size="small" color={AppColors.accent} />
      <Text style={styles.text}>{L.aiWakingNote}</Text>
    </View>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    banner: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 40, // 保存エラーバナー(50)の方が重要なので、重なった場合はそちらを上に
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: AppColors.card,
      borderWidth: 1,
      borderColor: AppColors.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    text: { flex: 1, color: AppColors.text, fontSize: 13, lineHeight: 18 },
  });

const themed = makeThemed(makeStyles);
