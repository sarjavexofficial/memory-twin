import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppPalette } from '@/constants/app-colors';
import { makeThemed, useTheme } from '@/lib/theme';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';

export function SaveErrorBanner() {
  const { styles } = useTheme(themed);
  const people = usePeople();
  const journal = useJournal();
  const insets = useSafeAreaInsets();

  const saveError = people.saveError ?? journal.saveError;
  const dismissSaveError = people.saveError ? people.dismissSaveError : journal.dismissSaveError;

  if (!saveError) return null;

  return (
    <View style={[styles.banner, { top: insets.top + 8 }]}>
      <Ionicons name="warning-outline" size={16} color="#fff" />
      <Text style={styles.text}>{saveError}</Text>
      <Pressable onPress={dismissSaveError} hitSlop={10}>
        <Ionicons name="close" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    banner: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: AppColors.danger,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    text: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 18 },
  });

const themed = makeThemed(makeStyles);
