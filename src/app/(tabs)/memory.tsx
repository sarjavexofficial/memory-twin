import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { GlowBackground, GradientButton, TitleAccent } from '@/components/futuristic';
import { VoiceInputButton } from '@/components/voice-input-button';
import { AppPalette, glow } from '@/constants/app-colors';
import { AiConfigError, MemorySearchResult, searchMemory } from '@/lib/ai';
import { getAiProfile } from '@/lib/ai-profile';
import { todayLocal } from '@/lib/date';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { Person, STALE_THRESHOLD_DAYS } from '@/lib/mock-data';
import { buildMemoryRecords, retrieveRelevant } from '@/lib/retrieval';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function PersonCard({ person }: { person: Person }) {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const latestMemo = person.memos[0];
  const days = daysSince(person.lastContact);
  const isStale = days >= STALE_THRESHOLD_DAYS;

  return (
    <Pressable
      onPress={() => router.push(`/person/${person.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {person.photoUri ? (
        <Image source={{ uri: person.photoUri }} style={styles.avatarPhoto} />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>{person.avatarEmoji}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.name}>{person.name}</Text>
          <Text
            style={[
              styles.relationTag,
              person.color ? { color: person.color, backgroundColor: `${person.color}26` } : null,
            ]}>
            {person.relation}
          </Text>
        </View>
        {latestMemo && (
          <Text style={styles.memoPreview} numberOfLines={1}>
            {latestMemo.text}
          </Text>
        )}
        <View style={styles.lastContactRow}>
          <Ionicons
            name={isStale ? 'alert-circle-outline' : 'time-outline'}
            size={12}
            color={isStale ? AppColors.danger : AppColors.accent}
          />
          <Text style={[styles.lastContact, isStale && styles.lastContactStale]}>
            {days === 0 ? L.contactToday : isStale ? L.contactStale(days) : L.contactDaysAgo(days)}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={AppColors.muted} />
    </Pressable>
  );
}

export default function MemoryScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { people, isLoaded } = usePeople();
  const { entries, addEntry } = useJournal();
  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [aiResult, setAiResult] = useState<MemorySearchResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [answerSaved, setAnswerSaved] = useState(false);
  // 保存時に検索語も残すため、回答を得たときの質問文を保持する
  const [askedQuestion, setAskedQuestion] = useState('');

  function handleSaveAnswer() {
    if (!aiResult) return;
    addEntry({
      date: todayLocal(),
      text: `Q: ${askedQuestion}\nA: ${aiResult.answer}`,
      tags: ['AI検索'],
      source: 'AI検索',
    });
    setAnswerSaved(true);
  }

  async function handleAiSearch() {
    if (!query.trim()) return;
    setIsAsking(true);
    setAiError(null);
    setAiResult(null);
    setAnswerSaved(false);
    setAskedQuestion(query.trim());
    try {
      // 検索エンジン: 全記録ではなく、質問に関連する記録だけを選別してAIへ渡す
      const records = buildMemoryRecords(entries, people);
      const relevant = retrieveRelevant(records, query.trim());
      // AIの理解ノート（あれば）を添えて、回答を本人向けに個人化する
      const profile = await getAiProfile();
      const result = await searchMemory(query.trim(), relevant, profile?.summary);
      setAiResult(result);
    } catch (e) {
      setAiError(e instanceof AiConfigError ? e.message : (e as Error).message);
    } finally {
      setIsAsking(false);
    }
  }

  const filteredPeople = useMemo(() => {
    if (!query.trim()) return people;
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      const haystack = [p.name, p.relation, ...p.likes, ...p.memos.map((m) => m.text)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, people]);

  const matchedEntries = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return entries.filter((e) => [e.text, ...(e.tags ?? [])].join(' ').toLowerCase().includes(q));
  }, [query, entries]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <GlowBackground />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{L.tabMemory}</Text>
          <TitleAccent />
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/add-person')}>
          <Ionicons name="add" size={16} color={AppColors.background} />
          <Text style={styles.addButtonText}>{L.addPerson}</Text>
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={AppColors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={L.searchPlaceholder}
          placeholderTextColor={AppColors.muted}
          style={styles.input}
        />
        <VoiceInputButton
          compact
          onText={(t) => setQuery((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))}
          onError={setAiError}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={AppColors.muted} />
          </Pressable>
        )}
      </View>
      {aiError && !query.trim() && <Text style={styles.searchVoiceError}>{aiError}</Text>}

      {!isLoaded ? (
        <ActivityIndicator style={styles.loading} color={AppColors.primary} />
      ) : (
        <FlatList
          data={filteredPeople}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PersonCard person={item} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            query.trim() ? (
              <View style={styles.aiSearchBlock}>
                <GradientButton
                  label={L.aiSearchButton}
                  iconName="sparkles-outline"
                  onPress={handleAiSearch}
                  loading={isAsking}
                />
                <AiSendNote text={L.aiSearchSendNote} />
                {aiError && <Text style={styles.aiSearchError}>{aiError}</Text>}
                {aiResult && (
                  <View style={styles.aiAnswerCard}>
                    <Text style={styles.aiAnswerLabel}>Sarjavex AI</Text>
                    <Text style={styles.aiAnswerText}>{aiResult.answer}</Text>
                    {aiResult.sources.length > 0 && (
                      <View style={styles.aiSourceBox}>
                        <Text style={styles.aiSourceLabel}>{L.aiSearchSources}</Text>
                        {aiResult.sources.map((s, i) => (
                          <Text key={i} style={styles.aiSourceText}>
                            ・{s}
                          </Text>
                        ))}
                      </View>
                    )}
                    {answerSaved ? (
                      <View style={styles.aiSavedRow}>
                        <Ionicons name="checkmark-circle" size={15} color={AppColors.success} />
                        <Text style={styles.aiSavedText}>{L.aiAnswerSaved}</Text>
                      </View>
                    ) : (
                      <Pressable style={styles.aiSaveButton} onPress={handleSaveAnswer}>
                        <Ionicons name="bookmark-outline" size={14} color={AppColors.primary} />
                        <Text style={styles.aiSaveButtonText}>{L.aiAnswerSave}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{query.trim() ? L.emptySearch(query) : L.emptyPeople}</Text>
          }
          ListFooterComponent={
            matchedEntries.length > 0 ? (
              <View style={styles.entrySection}>
                <Text style={styles.sectionLabel}>{L.journalHits(matchedEntries.length)}</Text>
                {matchedEntries.map((e) => (
                  <View key={e.id} style={styles.entryCard}>
                    <Text style={styles.entryDate}>{e.date}</Text>
                    <Text style={styles.entryText}>{e.text}</Text>
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: AppColors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
    },
    title: { fontSize: 26, fontWeight: '800', color: AppColors.text, letterSpacing: -0.5 },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: AppColors.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 44,
      borderRadius: 999,
    },
    addButtonText: { color: AppColors.background, fontWeight: '700', fontSize: 14 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: AppColors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: AppColors.line,
      paddingHorizontal: 14,
      height: 48,
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    input: { flex: 1, fontSize: 15, color: AppColors.text },
    searchVoiceError: {
      fontSize: 12,
      color: AppColors.danger,
      lineHeight: 17,
      marginHorizontal: 16,
      marginBottom: 10,
    },
    list: { paddingHorizontal: 16, paddingBottom: 100, gap: 12 },
    loading: { marginTop: 40 },
    empty: { textAlign: 'center', color: AppColors.muted, fontSize: 15, marginTop: 40, lineHeight: 22 },
    entrySection: { gap: 10, marginTop: 16 },
    sectionLabel: { fontSize: 13, fontWeight: '800', color: AppColors.accent },
    entryCard: {
      backgroundColor: AppColors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 14,
      gap: 4,
    },
    entryDate: { fontSize: 12, color: AppColors.muted, fontWeight: '700' },
    entryText: { fontSize: 14, color: AppColors.text, lineHeight: 20 },
    card: {
      flexDirection: 'row',
      backgroundColor: AppColors.card,
      borderRadius: 18,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: AppColors.line,
      alignItems: 'center',
      minHeight: 44,
    },
    cardPressed: { opacity: 0.6 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: AppColors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPhoto: { width: 56, height: 56, borderRadius: 28 },
    avatarEmoji: { fontSize: 28 },
    cardBody: { flex: 1, gap: 5 },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { fontSize: 17, fontWeight: '700', color: AppColors.text },
    relationTag: {
      fontSize: 12,
      fontWeight: '700',
      color: AppColors.primary,
      backgroundColor: AppColors.primarySoft,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    memoPreview: { fontSize: 14, color: AppColors.muted, lineHeight: 19 },
    lastContactRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    lastContact: { fontSize: 13, color: AppColors.accent, fontWeight: '600' },
    lastContactStale: { color: AppColors.danger },
    aiSearchBlock: { gap: 10, marginBottom: 12 },
    aiSearchButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      backgroundColor: AppColors.primary,
      borderRadius: 14,
      paddingVertical: 13,
      minHeight: 44,
      ...glow(AppColors.primary),
    },
    aiSearchButtonText: { color: AppColors.background, fontWeight: '800', fontSize: 14 },
    aiSearchError: { fontSize: 13, color: AppColors.danger, lineHeight: 18 },
    aiAnswerCard: {
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 14,
      gap: 8,
    },
    aiAnswerLabel: { fontSize: 11, fontWeight: '800', color: AppColors.primary },
    aiAnswerText: { fontSize: 14, color: AppColors.text, lineHeight: 21 },
    aiSourceBox: { backgroundColor: AppColors.primarySoft, borderRadius: 10, padding: 10, gap: 4 },
    aiSourceLabel: { fontSize: 11, fontWeight: '800', color: AppColors.primary },
    aiSourceText: { fontSize: 12, color: AppColors.muted, lineHeight: 17 },
    aiSaveButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: AppColors.primary,
      borderRadius: 10,
      paddingVertical: 10,
      minHeight: 40,
    },
    aiSaveButtonText: { color: AppColors.primary, fontWeight: '700', fontSize: 13 },
    aiSavedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
    aiSavedText: { fontSize: 13, color: AppColors.success, fontWeight: '600' },
  });

const themed = makeThemed(makeStyles);
