import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppPalette } from '@/constants/app-colors';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';

export function AiSendNote({ text }: { text?: string }) {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  return (
    <View style={styles.row}>
      <Ionicons name="cloud-upload-outline" size={13} color={AppColors.muted} />
      <Text style={styles.text}>{text ?? L.aiSendDefault}</Text>
    </View>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    text: { flex: 1, fontSize: 11, color: AppColors.muted, lineHeight: 15 },
  });

const themed = makeThemed(makeStyles);
