import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette, RELATION_COLORS } from '@/constants/app-colors';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { Person } from '@/lib/mock-data';
import { usePeople } from '@/store/people-context';

export default function EditPersonScreen() {
  const { styles } = useTheme(themed);
  const L = useStrings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoaded, getPersonById } = usePeople();
  const person = getPersonById(id);

  // データ読み込み完了前にフォームを初期化すると空になるため、待ってからマウントする
  if (!isLoaded) return <SafeAreaView style={styles.safeArea} />;
  if (!person) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.notFound}>{L.personNotFound}</Text>
      </SafeAreaView>
    );
  }
  return <EditPersonForm person={person} />;
}

function EditPersonForm({ person }: { person: Person }) {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { updatePerson } = usePeople();

  const [name, setName] = useState(person.name);
  const [relation, setRelation] = useState(person.relation);
  const [birthday, setBirthday] = useState(person.birthday ?? '');
  const [likes, setLikes] = useState(person.likes.join('、'));
  const [photoUri, setPhotoUri] = useState<string | undefined>(person.photoUri);
  const [color, setColor] = useState<string | undefined>(person.color);
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

  function handleSave() {
    if (!name.trim()) return;
    updatePerson(person.id, {
      name: name.trim(),
      relation: relation.trim() || L.relationFallback,
      birthday: birthday.trim() || undefined,
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
      router.replace(`/person/${person.id}`);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/person/${person.id}`))}
          hitSlop={12}>
          <Text style={styles.cancel}>{L.personCancel}</Text>
        </Pressable>
        <Text style={styles.title}>{L.personEditTitle}</Text>
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
              <Text style={styles.avatarEmoji}>{person.avatarEmoji}</Text>
            </View>
          )}
          <Text style={styles.avatarHint}>{photoUri ? L.photoChange : L.photoAdd}</Text>
        </Pressable>
        {photoUri && (
          <Pressable style={styles.removePhotoRow} onPress={() => setPhotoUri(undefined)} hitSlop={8}>
            <Ionicons name="close-circle-outline" size={14} color={AppColors.danger} />
            <Text style={styles.removePhotoText}>{L.photoRemoveText}</Text>
          </Pressable>
        )}
        {photoError && <Text style={styles.photoError}>{photoError}</Text>}

        <View style={styles.field}>
          <Text style={styles.label}>{L.personNameLabel}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={L.personNameLabel}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: AppColors.background },
    notFound: { textAlign: 'center', marginTop: 60, color: AppColors.muted },
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
    avatarPicker: { alignItems: 'center', gap: 8 },
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
    avatarEmoji: { fontSize: 44 },
    avatarPhoto: { width: 88, height: 88, borderRadius: 44 },
    avatarHint: { fontSize: 13, color: AppColors.muted },
    removePhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center' },
    removePhotoText: { fontSize: 12, color: AppColors.danger },
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
  });

const themed = makeThemed(makeStyles);
