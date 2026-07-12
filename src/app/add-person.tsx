import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette, RELATION_COLORS } from '@/constants/app-colors';
import { confirmAsync } from '@/lib/confirm';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { usePeople } from '@/store/people-context';

export default function AddPersonScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { addPerson, isDuplicateName } = usePeople();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [birthday, setBirthday] = useState('');
  const [likes, setLikes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [color, setColor] = useState<string | undefined>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function handlePickPhoto() {
    setPhotoError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      // Webはdata URIがuriに入る。ネイティブはキャッシュのファイルURIのため、消えないようbase64で保持する
      const uri = asset.uri.startsWith('data:')
        ? asset.uri
        : asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
      setPhotoUri(uri);
    } catch {
      setPhotoError(L.photoLoadFailed);
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (isDuplicateName(trimmedName)) {
      const proceed = await confirmAsync(L.duplicateNameTitle, L.duplicateNameMessage(trimmedName));
      if (!proceed) return;
    }

    addPerson({
      name: trimmedName,
      relation: relation.trim() || L.relationFallback,
      birthday: birthday.trim(),
      likes: likes
        .split(/[,、]/)
        .map((s) => s.trim())
        .filter(Boolean),
      photoUri,
      color,
    });
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/memory');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/memory'))}
          hitSlop={12}>
          <Text style={styles.cancel}>{L.personCancel}</Text>
        </Pressable>
        <Text style={styles.title}>{L.personAddTitle}</Text>
        <Pressable onPress={handleSave} disabled={!name.trim()} hitSlop={12}>
          <Text style={[styles.save, !name.trim() && styles.saveDisabled]}>{L.personSave}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.avatarPicker} onPress={handlePickPhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarPhoto} />
          ) : (
            <View style={styles.avatarCircle}>
              <Ionicons name="camera-outline" size={28} color={AppColors.primary} />
            </View>
          )}
          <Text style={styles.avatarHint}>{photoUri ? L.photoChange : L.photoAdd}</Text>
        </Pressable>
        {photoError && <Text style={styles.photoError}>{photoError}</Text>}

        <View style={styles.field}>
          <Text style={styles.label}>{L.personNameLabel}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={L.namePlaceholder}
            placeholderTextColor={AppColors.muted}
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{L.relationLabel}</Text>
          <TextInput
            value={relation}
            onChangeText={setRelation}
            placeholder={L.relationPlaceholder}
            placeholderTextColor={AppColors.muted}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{L.relationColorLabel}</Text>
          <View style={styles.colorRow}>
            {RELATION_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchSelected]}
                onPress={() => setColor(color === c ? undefined : c)}>
                {color === c && <Ionicons name="checkmark" size={16} color="#fff" />}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{L.birthdayLabel}</Text>
          <TextInput
            value={birthday}
            onChangeText={setBirthday}
            placeholder={L.birthdayPlaceholder}
            placeholderTextColor={AppColors.muted}
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{L.likesLabel}</Text>
          <TextInput
            value={likes}
            onChangeText={setLikes}
            placeholder={L.likesPlaceholder}
            placeholderTextColor={AppColors.muted}
            style={styles.input}
          />
        </View>

        <Text style={styles.note}>{L.personSaveNote}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: AppColors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: AppColors.line,
    },
    cancel: { color: AppColors.muted, fontSize: 16, paddingVertical: 10 },
    title: { fontSize: 17, fontWeight: '800', color: AppColors.text },
    save: { color: AppColors.primary, fontWeight: '800', fontSize: 16, paddingVertical: 10 },
    saveDisabled: { color: AppColors.muted },
    content: { padding: 20, gap: 20 },
    avatarPicker: { alignItems: 'center', gap: 8, marginBottom: 8 },
    avatarCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: AppColors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: AppColors.primary,
      borderStyle: 'dashed',
    },
    avatarPhoto: { width: 88, height: 88, borderRadius: 44 },
    avatarHint: { fontSize: 13, color: AppColors.muted },
    photoError: { fontSize: 13, color: AppColors.danger, textAlign: 'center' },
    field: { gap: 8 },
    label: { fontSize: 14, fontWeight: '700', color: AppColors.text },
    input: {
      borderWidth: 1,
      borderColor: AppColors.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      minHeight: 48,
      fontSize: 15,
      color: AppColors.text,
      backgroundColor: AppColors.card,
    },
    colorRow: { flexDirection: 'row', gap: 12 },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorSwatchSelected: { borderWidth: 2.5, borderColor: AppColors.text },
    note: { fontSize: 13, color: AppColors.muted, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  });

const themed = makeThemed(makeStyles);
