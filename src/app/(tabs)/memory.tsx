import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { GlowBackground, GradientButton, TitleAccent } from '@/components/futuristic';
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

// 表記ゆれ対策の正規化: 空白を除き、カタカナ→ひらがな、全角英数→半角、小文字化。
// 「高橋さくら」で「高橋 さくら」（登録名に空白）もヒットさせるための下ごしらえ
function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// 2文字ずつの並び（バイグラム）の重なり率（Dice係数）。
// 完全一致しない入力でも「もしかしてこれ？」の近さを数値化する。1文字入力は包含で代用
function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.length < 2 || b.length < 2) return a.includes(b) || b.includes(a) ? 1 : 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return (2 * hit) / (ga.size + gb.size);
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
        {person.tags && person.tags.length > 0 && (
          <View style={styles.cardTagRow}>
            {person.tags.slice(0, 3).map((t) => (
              <View key={t} style={styles.cardTagChip}>
                <Text style={styles.cardTagChipText}>{t}</Text>
              </View>
            ))}
            {person.tags.length > 3 && (
              <Text style={styles.cardTagMore}>+{person.tags.length - 3}</Text>
            )}
          </View>
        )}
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
  // タグでの絞り込み（企画書の「同じ関係性や所属の人物をまとめて検索」）。同じタグを再タップで解除
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
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

  // 登録済みの人物タグを集めて絞り込みチップに出す（使用頻度の高い順）
  const allTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of people) for (const t of p.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
  }, [people]);

  // 選択タグが人物一覧から消えた（全員から外された等）場合は選択を解除する
  useEffect(() => {
    if (selectedTag && !allTags.includes(selectedTag)) setSelectedTag(null);
  }, [allTags, selectedTag]);

  const filteredPeople = useMemo(() => {
    let base = people;
    // まずタグで束ねる。企画書の「同じ所属の人物をまとめて」を担う一次フィルタ
    if (selectedTag) base = base.filter((p) => (p.tags ?? []).includes(selectedTag));
    if (!query.trim()) return base;
    const q = normalizeForMatch(query.trim());
    return base.filter((p) => {
      // 名前・関係・場所・人物タグ・好き嫌い・メモ本文/タグまで検索対象にする
      const haystack = normalizeForMatch(
        [
          p.name,
          p.relation,
          p.place ?? '',
          ...(p.tags ?? []),
          ...p.likes,
          ...p.dislikes,
          ...p.memos.flatMap((m) => [m.text, ...(m.tags ?? [])]),
        ].join(' '),
      );
      return haystack.includes(q);
    });
  }, [query, people, selectedTag]);

  // ヒット0件のとき、名前・関係・場所が「近い」人を最大3人まで提案する
  const suggestions = useMemo(() => {
    const raw = query.trim();
    if (!raw || filteredPeople.length > 0) return [];
    const q = normalizeForMatch(raw);
    return people
      .map((person) => ({
        person,
        score: Math.max(
          nameSimilarity(q, normalizeForMatch(person.name)),
          nameSimilarity(q, normalizeForMatch(person.relation ?? '')),
          nameSimilarity(q, normalizeForMatch(person.place ?? '')),
          ...(person.tags ?? []).map((t) => nameSimilarity(q, normalizeForMatch(t))),
        ),
      }))
      .filter((s) => s.score >= 0.25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [query, people, filteredPeople]);

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
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={AppColors.muted} />
          </Pressable>
        )}
      </View>

      {allTags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagFilterBar}
          contentContainerStyle={styles.tagFilterContent}>
          {allTags.map((t) => {
            const active = selectedTag === t;
            return (
              <Pressable
                key={t}
                style={[styles.tagFilterChip, active && styles.tagFilterChipActive]}
                onPress={() => setSelectedTag(active ? null : t)}>
                <Ionicons
                  name="pricetag"
                  size={11}
                  color={active ? AppColors.background : AppColors.muted}
                />
                <Text style={[styles.tagFilterChipText, active && styles.tagFilterChipTextActive]}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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
            <View>
              <Text style={styles.empty}>{query.trim() ? L.emptySearch(query) : L.emptyPeople}</Text>
              {suggestions.length > 0 && (
                <View style={styles.suggestBlock}>
                  <Text style={styles.suggestLabel}>{L.searchDidYouMean}</Text>
                  <View style={styles.suggestRow}>
                    {suggestions.map(({ person }) => (
                      <Pressable
                        key={person.id}
                        style={styles.suggestChip}
                        onPress={() => router.push(`/person/${person.id}`)}>
                        <Text style={styles.suggestChipText}>
                          {person.avatarEmoji} {person.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
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
    tagFilterBar: { flexGrow: 0, marginBottom: 12 },
    tagFilterContent: { paddingHorizontal: 16, gap: 8 },
    tagFilterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 7,
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: AppColors.line,
      backgroundColor: AppColors.card,
    },
    tagFilterChipActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
    tagFilterChipText: { fontSize: 13, color: AppColors.muted, fontWeight: '700' },
    tagFilterChipTextActive: { color: AppColors.background },
    list: { paddingHorizontal: 16, paddingBottom: 100, gap: 12 },
    loading: { marginTop: 40 },
    empty: { textAlign: 'center', color: AppColors.muted, fontSize: 15, marginTop: 40, lineHeight: 22 },
    suggestBlock: { marginTop: 18, alignItems: 'center', gap: 10 },
    suggestLabel: { fontSize: 13, color: AppColors.text, fontWeight: '700' },
    suggestRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
    suggestChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      minHeight: 38,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: AppColors.primary,
      backgroundColor: AppColors.primarySoft,
    },
    suggestChipText: { fontSize: 14, color: AppColors.primary, fontWeight: '700' },
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
    cardTagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    cardTagChip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: AppColors.primarySoft,
    },
    cardTagChipText: { fontSize: 11, color: AppColors.primary, fontWeight: '700' },
    cardTagMore: { fontSize: 11, color: AppColors.muted, fontWeight: '700' },
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
