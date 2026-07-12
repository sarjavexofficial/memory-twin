import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette } from '@/constants/app-colors';
import { daysAgoLocal } from '@/lib/date';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';

const DAY_MS = 24 * 60 * 60 * 1000;

// 「テーマ」ではないタグは除外する:
// - アプリが運用のために付ける識別タグ（AI検索/振り返り/抽出）
// - 記録の種類を表すタグ（決定/約束/未完了。抽出機能が付けるもので、内容のテーマではない）
const EXCLUDED_TAGS = new Set(['AI検索', '振り返り', '抽出', '決定', '約束', '未完了']);

// 本文からテーマ候補の語を取り出す簡易ルール（形態素解析なし・端末内処理）。
// 漢字・カタカナ・ハングルの2文字以上のまとまりと、3文字以上のラテン文字の単語を「語」として数える。
// 漢字1文字は「話す」「始める」等の動詞の断片が大量に混ざるため対象外にする
const WORD_REGEX = /[一-龯々]{2,}|[ァ-ヶー]{2,}|[가-힣]{2,}|[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/g;

// どの記録にも現れやすい一般語（言語別）。テーマとしては意味がないため除外する
const STOPWORDS = new Set([
  // 日本語
  '今日', '昨日', '明日', '最近', '自分', '時間', '今年', '去年', '今月', '来月', '先月',
  '予定', '本当', '一番', '今度', '気持',
  // 中国語
  '今天', '昨天', '明天', '时间', '自己', '开始', '已经', '没有', '觉得', '非常', '可以', '什么',
  // 한국어
  '오늘', '어제', '내일', '최근', '시간', '시작', '정말', '그리고', '하지만',
  // English
  'the', 'and', 'for', 'with', 'was', 'were', 'this', 'that', 'from', 'have', 'had', 'not', 'but',
  'you', 'are', 'they', 'she', 'him', 'her', 'his', 'get', 'got', 'out', 'about', 'just', 'into',
  'been', 'more', 'some', 'when', 'what', 'then', 'than', 'them', 'because', 'really', 'today', 'said',
  // Français
  'les', 'des', 'une', 'dans', 'pour', 'avec', 'est', 'était', 'cette', 'mais', 'aujourd', 'hui',
  'sur', 'pas', 'par', 'plus', 'tout', 'fait', 'mon', 'moi', 'nous', 'vous', 'ils', 'elle', 'sont',
  'ont', 'aux', 'qui', 'que', 'comme', 'être', 'avoir', 'très',
  // Português
  'com', 'para', 'uma', 'não', 'nao', 'mas', 'hoje', 'foi', 'estava', 'por', 'mais', 'tudo', 'isso',
  'meu', 'minha', 'ele', 'ela', 'são', 'sao', 'tem', 'estou', 'muito', 'como', 'quando', 'pela',
  'pelo', 'das', 'dos', 'pra', 'ser', 'ter',
]);

// タグ＋本文の頻出語からテーマ候補を数える。
// タグは明示的なテーマとしてそのまま数え、本文の語はノイズを避けるため2回以上登場したものだけ合算する
function collectTopics(records: { text: string; tags?: string[] }[]) {
  const counts = new Map<string, number>();
  const wordCounts = new Map<string, number>();
  for (const r of records) {
    for (const t of r.tags ?? []) {
      if (!EXCLUDED_TAGS.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const w of r.text.match(WORD_REGEX) ?? []) {
      if (w.length > 10) continue; // 長すぎる連結は語ではない可能性が高い
      const key = w.toLowerCase();
      if (STOPWORDS.has(key) || EXCLUDED_TAGS.has(w)) continue;
      wordCounts.set(key, (wordCounts.get(key) ?? 0) + 1);
    }
  }
  for (const [w, c] of wordCounts) {
    if (c >= 2) counts.set(w, (counts.get(w) ?? 0) + c);
  }
  return counts;
}

export default function InsightsScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { entries } = useJournal();
  const { people } = usePeople();

  const year = new Date().getFullYear();

  const stats = useMemo(() => {
    const yearPrefix = String(year);
    const yearEntries = entries.filter((e) => e.date.startsWith(yearPrefix));
    const yearMemos = people.flatMap((p) => p.memos.filter((m) => m.date.startsWith(yearPrefix)));

    const recordCount = yearEntries.length + yearMemos.length;
    const recordedDays = new Set([...yearEntries.map((e) => e.date), ...yearMemos.map((m) => m.date)]).size;
    const promisesDone = people.reduce(
      (sum, p) => sum + p.memos.filter((m) => m.promise?.done).length,
      0,
    );

    // よく登場するテーマ: タグ＋本文の頻出語の上位5件。
    // タグ付きの記録が少なくても、書いた内容そのものからテーマが浮かび上がるようにする
    const topicCounts = collectTopics([...yearEntries, ...yearMemos]);
    const topTags = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // 最近増えている言葉: 直近90日と、その前90日の頻出語（タグ＋本文）を比較
    const d90 = daysAgoLocal(90);
    const d180 = daysAgoLocal(180);
    const all = [
      ...entries.map((e) => ({ date: e.date, text: e.text, tags: e.tags })),
      ...people.flatMap((p) => p.memos.map((m) => ({ date: m.date, text: m.text, tags: m.tags }))),
    ];
    const recent = collectTopics(all.filter((r) => r.date >= d90));
    const prior = collectTopics(all.filter((r) => r.date >= d180 && r.date < d90));
    const trending = [...recent.entries()]
      .filter(([tag, count]) => count >= 2 && count > (prior.get(tag) ?? 0) * 1.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);

    return { recordCount, recordedDays, promisesDone, topTags, trending };
  }, [entries, people, year]);

  const statCards = [
    { icon: 'document-text-outline' as const, label: L.statRecords, value: stats.recordCount },
    { icon: 'calendar-number-outline' as const, label: L.statDays, value: stats.recordedDays },
    { icon: 'people-outline' as const, label: L.statPeople, value: people.length },
    { icon: 'checkmark-done-outline' as const, label: L.statPromisesDone, value: stats.promisesDone },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backRow}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/timeline'))}
          hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={AppColors.primary} />
          <Text style={styles.backButton}>{L.back}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{L.insightsTitle}</Text>
        <Text style={styles.desc}>{L.insightsDesc(year)}</Text>

        <Pressable style={styles.reportLinkButton} onPress={() => router.push('/monthly-report')}>
          <Ionicons name="calendar-outline" size={16} color={AppColors.primary} />
          <Text style={styles.reportLinkText}>{L.reportLink}</Text>
        </Pressable>

        {stats.recordCount === 0 ? (
          <Text style={styles.empty}>{L.insightsEmpty}</Text>
        ) : (
          <>
            <View style={styles.statGrid}>
              {statCards.map((s) => (
                <View key={s.label} style={styles.statCard}>
                  <Ionicons name={s.icon} size={18} color={AppColors.accent} />
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {stats.topTags.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{L.insightsTopTags}</Text>
                <View style={styles.tagWrap}>
                  {stats.topTags.map(([tag, count]) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{tag}</Text>
                      <Text style={styles.tagChipCount}>{count}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{L.insightsTrend}</Text>
              {stats.trending.length > 0 ? (
                stats.trending.map((word) => (
                  <View key={word} style={styles.trendRow}>
                    <Ionicons name="trending-up-outline" size={16} color={AppColors.success} />
                    <Text style={styles.trendText}>{L.insightsTrendItem(word)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noTrend}>{L.insightsNoTrend}</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: AppColors.background },
    header: { paddingHorizontal: 20, paddingTop: 8, minHeight: 44 },
    backRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    backButton: { color: AppColors.primary, fontWeight: '700', fontSize: 16 },
    content: { padding: 20, paddingTop: 8, gap: 14, paddingBottom: 60 },
    title: { fontSize: 26, fontWeight: '800', color: AppColors.text, letterSpacing: -0.5 },
    desc: { fontSize: 13, color: AppColors.muted, lineHeight: 19, marginTop: -6 },
    reportLinkButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: AppColors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      minHeight: 44,
    },
    reportLinkText: { color: AppColors.primary, fontWeight: '700', fontSize: 14 },
    empty: { textAlign: 'center', color: AppColors.muted, fontSize: 14, marginTop: 30, lineHeight: 21 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    statCard: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
      gap: 4,
    },
    statValue: { fontSize: 30, fontWeight: '900', color: AppColors.text, lineHeight: 34 },
    statLabel: { fontSize: 12, color: AppColors.muted, fontWeight: '700' },
    card: {
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
      gap: 10,
    },
    cardTitle: { fontSize: 14, fontWeight: '800', color: AppColors.accent },
    tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: AppColors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    tagChipText: { fontSize: 13, color: AppColors.primary, fontWeight: '700' },
    tagChipCount: { fontSize: 11, color: AppColors.muted, fontWeight: '800' },
    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    trendText: { flex: 1, fontSize: 13, color: AppColors.text, lineHeight: 19 },
    noTrend: { fontSize: 13, color: AppColors.muted, lineHeight: 19 },
  });

const themed = makeThemed(makeStyles);
