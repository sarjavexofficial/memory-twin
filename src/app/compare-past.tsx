import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { GlowBackground, GradientButton } from '@/components/futuristic';
import { AppPalette } from '@/constants/app-colors';
import { AiConfigError, generatePastComparison, PastComparisonResult } from '@/lib/ai';
import { buildAliasMap } from '@/lib/alias';
import { daysAgoLocal, todayLocal } from '@/lib/date';
import { FEATURES } from '@/lib/feature-flags';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { buildMemoryRecords } from '@/lib/retrieval';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { useSettings } from '@/store/settings-context';

// 「過去のあなたと比べる」: 半年前/1年前ごろの記録と直近30日をAIが読み比べる（Standard/Pro機能）
type Span = 'half' | 'year';

// 過去側の対象日数（半年=183日、1年=365日）。その前後45日を「あの頃」として拾う
// （ぴったりの月に記録がなくても比較できるように幅を持たせる）
const SPAN_DAYS: Record<Span, number> = { half: 183, year: 365 };
const WINDOW_DAYS = 45;

export default function ComparePastScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { entries, addEntry } = useJournal();
  const { people } = usePeople();
  const { settings } = useSettings();
  const [span, setSpan] = useState<Span>('half');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<PastComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Proだけの目玉機能。Standard以下にはアップグレード導線を出す
  const isPaid = settings.currentPlan === 'pro';

  const spanLabel = span === 'half' ? L.pastCompareHalfLabel : L.pastCompareYearLabel;

  const allRecords = useMemo(() => buildMemoryRecords(entries, people), [entries, people]);

  const pastRecords = useMemo(() => {
    const days = SPAN_DAYS[span];
    const from = daysAgoLocal(days + WINDOW_DAYS);
    const to = daysAgoLocal(days - WINDOW_DAYS);
    return allRecords.filter((r) => r.date >= from && r.date <= to);
  }, [allRecords, span]);

  const recentRecords = useMemo(() => {
    const from = daysAgoLocal(30);
    return allRecords.filter((r) => r.date >= from);
  }, [allRecords]);

  const canCompare = pastRecords.length > 0 && recentRecords.length > 0;

  function selectSpan(s: Span) {
    setSpan(s);
    setResult(null);
    setError(null);
    setSaved(false);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const comparison = await generatePastComparison(
        pastRecords,
        recentRecords,
        spanLabel,
        buildAliasMap(people),
      );
      setResult(comparison);
    } catch (e) {
      setError(e instanceof AiConfigError ? e.message : (e as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSaveResult() {
    if (!result) return;
    const body = [
      `【${L.pastCompareLinkTitle}（${spanLabel}）】`,
      result.summary,
      ...result.changes.map((c) => `・${c}`),
      ...(result.worries ? [`${L.pastCompareWorries}: ${result.worries}`] : []),
      ...(result.message ? [`${L.pastCompareMessage}: ${result.message}`] : []),
    ].join('\n');
    addEntry({
      date: todayLocal(),
      text: body,
      tags: ['振り返り'],
      source: '振り返り',
    });
    setSaved(true);
  }

  // 過去比較はPro専用機能。無料先行リリース中は入口を隠しているが、
  // deep link 等で直接開かれてもホームへ戻す（paidPlans を true に戻せば復活）。
  if (!FEATURES.paidPlans) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <GlowBackground />
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
        <Text style={styles.title}>{L.pastCompareLinkTitle}</Text>
        <Text style={styles.desc}>{L.pastCompareDesc}</Text>

        {!isPaid ? (
          <View style={styles.upsellCard}>
            <Ionicons name="lock-closed-outline" size={22} color={AppColors.accent} />
            <Text style={styles.upsellText}>{L.pastCompareUpsell}</Text>
            <Pressable style={styles.upsellButton} onPress={() => router.push('/plans')}>
              <Ionicons name="pricetags-outline" size={15} color={AppColors.background} />
              <Text style={styles.upsellButtonText}>{L.planLink}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.spanRow}>
              {(
                [
                  { key: 'half' as Span, label: L.pastCompareHalf },
                  { key: 'year' as Span, label: L.pastCompareYear },
                ]
              ).map((s) => (
                <Pressable
                  key={s.key}
                  style={[styles.spanChip, span === s.key && styles.spanChipSelected]}
                  onPress={() => selectSpan(s.key)}>
                  <Text style={[styles.spanChipText, span === s.key && styles.spanChipTextSelected]}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.recordCount}>
              {L.pastCompareRecords(pastRecords.length, recentRecords.length)}
            </Text>

            {!canCompare ? (
              <Text style={styles.empty}>{L.pastCompareEmpty}</Text>
            ) : (
              <>
                <GradientButton
                  label={L.pastCompareButton}
                  iconName="hourglass-outline"
                  onPress={handleGenerate}
                  loading={isGenerating}
                />
                <AiSendNote text={L.reviewSendNote} />
              </>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            {result && (
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>Sarjavex AI ・ {spanLabel} → {L.tabToday}</Text>
                <Text style={styles.resultSummary}>{result.summary}</Text>

                {result.changes.length > 0 && (
                  <View style={styles.changesBox}>
                    <Text style={styles.sectionLabel}>{L.pastCompareChanges}</Text>
                    {result.changes.map((c, i) => (
                      <View key={i} style={styles.changeRow}>
                        <Ionicons name="trending-up-outline" size={14} color={AppColors.success} />
                        <Text style={styles.changeText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {result.worries.length > 0 && (
                  <View style={styles.worriesBox}>
                    <Text style={styles.sectionLabel}>{L.pastCompareWorries}</Text>
                    <Text style={styles.worriesText}>{result.worries}</Text>
                  </View>
                )}

                {result.message.length > 0 && (
                  <View style={styles.messageBox}>
                    <Text style={styles.messageLabel}>{L.pastCompareMessage}</Text>
                    <Text style={styles.messageText}>{result.message}</Text>
                  </View>
                )}

                {saved ? (
                  <View style={styles.savedRow}>
                    <Ionicons name="checkmark-circle" size={15} color={AppColors.success} />
                    <Text style={styles.savedText}>{L.aiAnswerSaved}</Text>
                  </View>
                ) : (
                  <Pressable style={styles.saveButton} onPress={handleSaveResult}>
                    <Ionicons name="bookmark-outline" size={14} color={AppColors.primary} />
                    <Text style={styles.saveButtonText}>{L.aiAnswerSave}</Text>
                  </Pressable>
                )}
              </View>
            )}
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
    upsellCard: {
      backgroundColor: AppColors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 20,
      gap: 12,
      alignItems: 'center',
    },
    upsellText: { fontSize: 14, color: AppColors.text, lineHeight: 20, textAlign: 'center' },
    upsellButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: AppColors.accent,
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
      minHeight: 44,
    },
    upsellButtonText: { color: AppColors.background, fontWeight: '800', fontSize: 14 },
    spanRow: { flexDirection: 'row', gap: 10 },
    spanChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: AppColors.line,
    },
    spanChipSelected: { borderColor: AppColors.accent, backgroundColor: AppColors.accentSoft },
    spanChipText: { fontSize: 14, color: AppColors.muted, fontWeight: '600' },
    spanChipTextSelected: { color: AppColors.accent, fontWeight: '800' },
    recordCount: { fontSize: 13, color: AppColors.accent, fontWeight: '700' },
    empty: { textAlign: 'center', color: AppColors.muted, fontSize: 14, marginTop: 20, lineHeight: 21 },
    errorText: { fontSize: 13, color: AppColors.danger, lineHeight: 18 },
    resultCard: {
      backgroundColor: AppColors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
      gap: 12,
    },
    resultLabel: { fontSize: 11, fontWeight: '800', color: AppColors.primary },
    resultSummary: { fontSize: 14, color: AppColors.text, lineHeight: 21 },
    sectionLabel: { fontSize: 12, fontWeight: '800', color: AppColors.accent },
    changesBox: { gap: 6 },
    changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    changeText: { flex: 1, fontSize: 13, color: AppColors.text, lineHeight: 19 },
    worriesBox: { gap: 6 },
    worriesText: { fontSize: 13, color: AppColors.text, lineHeight: 19 },
    // 「今のあなたへ」はこの画面の感情的なハイライトなので、目立つ枠で囲む
    messageBox: {
      backgroundColor: AppColors.primarySoft,
      borderRadius: 12,
      padding: 14,
      gap: 6,
    },
    messageLabel: { fontSize: 12, fontWeight: '800', color: AppColors.primary },
    messageText: { fontSize: 14, color: AppColors.text, lineHeight: 21, fontWeight: '600' },
    saveButton: {
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
    saveButtonText: { color: AppColors.primary, fontWeight: '700', fontSize: 13 },
    savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
    savedText: { fontSize: 13, color: AppColors.success, fontWeight: '600' },
  });

const themed = makeThemed(makeStyles);
