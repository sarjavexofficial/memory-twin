import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppPalette } from '@/constants/app-colors';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';

export function AiPredictionNotice() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  return (
    <View style={styles.box}>
      <Ionicons name="information-circle-outline" size={14} color={AppColors.muted} />
      <Text style={styles.text}>{L.aiPredictionNote}</Text>
    </View>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: AppColors.card,
      borderWidth: 1,
      borderColor: AppColors.line,
      borderRadius: 10,
      padding: 10,
      alignSelf: 'stretch',
    },
    text: { flex: 1, fontSize: 12, color: AppColors.muted, lineHeight: 17 },
  });

const themed = makeThemed(makeStyles);
