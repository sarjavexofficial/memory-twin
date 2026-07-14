import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { DatePickerField } from '@/components/date-picker-field';
import { AppPalette } from '@/constants/app-colors';
import { AiConfigError, organizeMemo, OrganizedMemo } from '@/lib/ai';
import { confirmAsync } from '@/lib/confirm';
import { todayLocal as today } from '@/lib/date';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { usePeople } from '@/store/people-context';

export default function PersonDetailScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getPersonById, addMemoToPerson, deleteMemo, deletePerson, togglePromiseDone } = usePeople();
  const person = getPersonById(id);
  const [draftMemo, setDraftMemo] = useState('');
  const [draftDate, setDraftDate] = useState(today());
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [aiResult, setAiResult] = useState<OrganizedMemo | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [includeAction, setIncludeAction] = useState(true);

  if (!person) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.notFound}>{L.personNotFound}</Text>
      </SafeAreaView>
    );
  }

  async function handleOrganize() {
    if (!draftMemo.trim()) return;
    setIsOrganizing(true);
    setAiError(null);
    setAiResult(null);
    setIncludeAction(true);
    try {
      const result = await organizeMemo(draftMemo);
      setAiResult(result);
    } catch (e) {
      setAiError(e instanceof AiConfigError ? e.message : L.memoOrganizeFailed((e as Error).message));
    } finally {
      setIsOrganizing(false);
    }
  }

  function handleConfirmAiResult() {
    if (!aiResult || !person) return;
    addMemoToPerson(person.id, {
      date: draftDate.trim() || today(),
      text: aiResult.cleanedText,
      tags: aiResult.tags,
      promise:
        includeAction && aiResult.suggestedAction
          ? { action: aiResult.suggestedAction, dueDate: aiResult.suggestedDueDate, done: false }
          : undefined,
    });
    setDraftMemo('');
    setAiResult(null);
  }

  function handleSaveAsIs() {
    if (!draftMemo.trim() || !person) return;
    addMemoToPerson(person.id, { date: draftDate.trim() || today(), text: draftMemo.trim() });
    setDraftMemo('');
    setAiResult(null);
    setAiError(null);
  }

  async function handleDeleteMemo(memoId: string) {
    if (!person) return;
    const proceed = await confirmAsync(L.memoDeleteTitle, L.deleteEntryMessage);
    if (proceed) deleteMemo(person.id, memoId);
  }

  async function handleDeletePerson() {
    if (!person) return;
    const proceed = await confirmAsync(L.personDeleteTitle(person.name), L.personDeleteMessage);
    if (proceed) {
      deletePerson(person.id);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backRow}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={18} color={AppColors.primary} />
          <Text style={styles.backButton}>{L.back}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.deletePersonButton}
            onPress={() => router.push({ pathname: '/edit-person/[id]', params: { id: person.id } })}
            hitSlop={12}>
            <Ionicons name="create-outline" size={18} color={AppColors.primary} />
          </Pressable>
          <Pressable style={styles.deletePersonButton} onPress={handleDeletePerson} hitSlop={12}>
            <Ionicons name="trash-outline" size={18} color={AppColors.danger} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileBlock}>
          {person.photoUri ? (
            <Image source={{ uri: person.photoUri }} style={styles.avatarPhoto} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarEmoji}>{person.avatarEmoji}</Text>
            </View>
          )}
          <Text style={styles.name}>{person.name}</Text>
          <Text
            style={[
              styles.relation,
              person.color ? { color: person.color, backgroundColor: `${person.color}26` } : null,
            ]}>
            {person.relation}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.personBasicInfo}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{L.birthdayLabel}</Text>
            <Text style={styles.infoValue}>{person.birthday ?? L.personUnset}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{L.personLastContact}</Text>
            <Text style={styles.infoValue}>
              {person.lastContact}
              {person.place ? `（${person.place}）` : ''}
            </Text>
          </View>
          {person.tags && person.tags.length > 0 && (
            <View style={styles.tagSection}>
              <Text style={styles.infoLabel}>{L.personTagsLabel}</Text>
              <View style={styles.tagRow}>
                {person.tags.map((t) => (
                  <View key={t} style={[styles.tag, styles.personTag]}>
                    <Text style={styles.personTagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={styles.tagSection}>
            <Text style={styles.infoLabel}>{L.likesLabel}</Text>
            <View style={styles.tagRow}>
              {person.likes.length === 0 ? (
                <Text style={styles.infoValue}>{L.personUnset}</Text>
              ) : (
                person.likes.map((l) => (
                  <View key={l} style={[styles.tag, styles.successTag]}>
                    <Text style={styles.successTagText}>{l}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
          {person.dislikes.length > 0 && (
            <View style={styles.tagSection}>
              <Text style={styles.infoLabel}>{L.personDislikes}</Text>
              <View style={styles.tagRow}>
                {person.dislikes.map((d) => (
                  <View key={d} style={[styles.tag, styles.dislikeTag]}>
                    <Text style={styles.dislikeTagText}>{d}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.memoAddTitle}</Text>
          <View style={styles.dateField}>
            <Text style={styles.infoLabel}>{L.memoDateLabel}</Text>
            <View style={{ flex: 1 }}>
              <DatePickerField value={draftDate} onChange={setDraftDate} disabled={isOrganizing} />
            </View>
          </View>
          <TextInput
            value={draftMemo}
            onChangeText={setDraftMemo}
            placeholder={L.personMemoPlaceholder}
            placeholderTextColor={AppColors.muted}
            style={styles.memoInput}
            multiline
            editable={!isOrganizing}
          />

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.outlineButton, !draftMemo.trim() && styles.saveButtonDisabled]}
              onPress={handleSaveAsIs}
              disabled={isOrganizing || !draftMemo.trim()}>
              <Text style={styles.outlineButtonText}>{L.memoSavePlain}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, (isOrganizing || !draftMemo.trim()) && styles.saveButtonDisabled]}
              onPress={handleOrganize}
              disabled={isOrganizing || !draftMemo.trim()}>
              {isOrganizing ? (
                <ActivityIndicator color={AppColors.background} size="small" />
              ) : (
                <Ionicons name="sparkles-outline" size={16} color={AppColors.background} />
              )}
              <Text style={styles.saveButtonText}>{isOrganizing ? L.memoOrganizing : L.memoOrganize}</Text>
            </Pressable>
          </View>
          <AiSendNote text={L.memoOrganizeNote} />

          {aiError && <Text style={styles.aiError}>{aiError}</Text>}

          {aiResult && (
            <View style={styles.aiResultBox}>
              <Text style={styles.aiResultLabel}>{L.memoAiProposal}</Text>
              <Text style={styles.aiResultText}>{aiResult.cleanedText}</Text>
              {aiResult.tags.length > 0 && (
                <View style={styles.tagRow}>
                  {aiResult.tags.map((t) => (
                    <View key={t} style={[styles.tag, styles.successTag]}>
                      <Text style={styles.successTagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              {aiResult.suggestedAction && (
                <Pressable style={styles.actionSuggestion} onPress={() => setIncludeAction((v) => !v)}>
                  <Ionicons
                    name={includeAction ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={AppColors.accent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionSuggestionLabel}>{L.memoNextAction}</Text>
                    <Text style={styles.actionSuggestionText}>{aiResult.suggestedAction}</Text>
                    {aiResult.suggestedDueDate && (
                      <Text style={styles.actionSuggestionDue}>{L.memoDueHint(aiResult.suggestedDueDate)}</Text>
                    )}
                  </View>
                </Pressable>
              )}
              <Pressable style={styles.confirmButton} onPress={handleConfirmAiResult}>
                <Ionicons name="checkmark" size={16} color={AppColors.background} />
                <Text style={styles.saveButtonText}>{L.memoAddToTimeline}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.memoTimelineTitle}</Text>
          {person.memos.length === 0 && <Text style={styles.infoValue}>{L.memoEmpty}</Text>}
          {person.memos.map((memo, i) => (
            <View key={memo.id} style={[styles.timelineItem, i === 0 && styles.timelineItemFirst]}>
              <View style={styles.timelineHeaderRow}>
                <Text style={styles.timelineDate}>{memo.date}</Text>
                <Pressable onPress={() => handleDeleteMemo(memo.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={15} color={AppColors.muted} />
                </Pressable>
              </View>
              <Text style={styles.timelineText}>{memo.text}</Text>
              {memo.tags && memo.tags.length > 0 && (
                <View style={styles.tagRow}>
                  {memo.tags.map((t) => (
                    <View key={t} style={[styles.tag, styles.successTag]}>
                      <Text style={styles.successTagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              {memo.promise && (
                <Pressable
                  style={[styles.promiseChip, memo.promise.done && styles.promiseChipDone]}
                  onPress={() => togglePromiseDone(person.id, memo.id)}>
                  <Ionicons
                    name={memo.promise.done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={memo.promise.done ? AppColors.success : AppColors.accent}
                  />
                  <Text
                    style={[styles.promiseChipText, memo.promise.done && styles.promiseChipTextDone]}>
                    {memo.promise.action}
                    {memo.promise.dueDate ? L.memoPromiseDue(memo.promise.dueDate) : ''}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
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
    minHeight: 44,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  backButton: { color: AppColors.primary, fontWeight: '700', fontSize: 16 },
  deletePersonButton: { padding: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  content: { padding: 20, paddingTop: 8, gap: 16, paddingBottom: 60 },
  profileBlock: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: AppColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarEmoji: { fontSize: 44 },
  avatarPhoto: { width: 88, height: 88, borderRadius: 44, marginBottom: 6 },
  name: { fontSize: 23, fontWeight: '800', color: AppColors.text },
  relation: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.primary,
    backgroundColor: AppColors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 18,
    gap: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: AppColors.text },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: 14, color: AppColors.muted, fontWeight: '600' },
  infoValue: { fontSize: 14, color: AppColors.text },
  tagSection: { gap: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  successTag: { backgroundColor: AppColors.successSoft },
  successTagText: { color: AppColors.success, fontSize: 13, fontWeight: '700' },
  personTag: { backgroundColor: AppColors.primarySoft },
  personTagText: { color: AppColors.primary, fontSize: 13, fontWeight: '700' },
  dislikeTag: { backgroundColor: AppColors.dangerSoft },
  dislikeTagText: { color: AppColors.danger, fontSize: 13, fontWeight: '700' },
  dateField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: AppColors.text,
  },
  dateInputError: { borderColor: AppColors.danger },
  memoInput: {
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    color: AppColors.text,
    textAlignVertical: 'top',
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  outlineButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: AppColors.primary,
    paddingVertical: 14,
    minHeight: 44,
  },
  outlineButtonText: { color: AppColors.primary, fontWeight: '700', fontSize: 15 },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 44,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: AppColors.background, fontWeight: '700', fontSize: 15 },
  aiError: { color: AppColors.danger, fontSize: 13, lineHeight: 18 },
  aiResultBox: {
    backgroundColor: AppColors.primarySoft,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  aiResultLabel: { fontSize: 12, fontWeight: '800', color: AppColors.primary },
  forecastDesc: { fontSize: 13, color: AppColors.muted, lineHeight: 19 },
  forecastHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confidenceBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  confidenceText: { fontSize: 11, fontWeight: '700' },
  aiResultText: { fontSize: 15, color: AppColors.text, lineHeight: 21 },
  actionSuggestion: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: AppColors.accentSoft,
    borderRadius: 10,
    padding: 12,
    alignItems: 'flex-start',
  },
  actionSuggestionLabel: { fontSize: 11, fontWeight: '800', color: AppColors.accent, marginBottom: 2 },
  actionSuggestionText: { fontSize: 14, color: AppColors.text, lineHeight: 19 },
  actionSuggestionDue: { fontSize: 12, color: AppColors.muted, marginTop: 2 },
  confirmButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.success,
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
  },
  timelineItem: {
    borderLeftWidth: 2,
    borderLeftColor: AppColors.line,
    paddingLeft: 14,
    paddingBottom: 6,
    gap: 3,
  },
  timelineItemFirst: { borderLeftColor: AppColors.primary },
  timelineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineDate: { fontSize: 12, color: AppColors.muted, fontWeight: '700' },
  timelineText: { fontSize: 15, color: AppColors.text, lineHeight: 21 },
  promiseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppColors.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  promiseChipDone: { backgroundColor: AppColors.successSoft },
  promiseChipText: { fontSize: 13, color: AppColors.accent, fontWeight: '700' },
  promiseChipTextDone: { color: AppColors.success, textDecorationLine: 'line-through' },
});

const themed = makeThemed(makeStyles);
