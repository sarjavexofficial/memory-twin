import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { GlowBackground, GradientButton } from '@/components/futuristic';
import { AppPalette, glow } from '@/constants/app-colors';
import { AiConfigError, generateReview, ReviewResult } from '@/lib/ai';
import {
  CommunityConfigError,
  hasAcceptedKodamaTerms,
  markKodamaTermsAccepted,
  ShareBlockedError,
  shareEcho,
} from '@/lib/community';
import { confirmAsync } from '@/lib/confirm';
import { daysAgoLocal, todayLocal } from '@/lib/date';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { buildMemoryRecords } from '@/lib/retrieval';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { useSettings } from '@/store/settings-context';

// 振り返りの対象期間: 直近（7日/30日）に加えて、過去の特定の月・年も選べる
type Period =
  | { kind: 'recent'; days: 7 | 30 }
  | { kind: 'month'; ym: string } // 'YYYY-MM'
  | { kind: 'year'; year: string }; // 'YYYY'

// チップに出す過去月が増えすぎないよう、記録のある直近18か月までにする
const MAX_PAST_MONTHS = 18;

export default function ReviewScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { entries, addEntry } = useJournal();
  const { people } = usePeople();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<Period>({ kind: 'recent', days: 7 });
  const [pastOpen, setPastOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // 企画書どおりStandard/Pro限定。Freeにはアップグレード導線を出す
  const isPaid = settings.currentPlan !== 'free';

  const periodLabel =
    period.kind === 'recent'
      ? period.days === 7
        ? L.reviewWeekly
        : L.reviewMonthly
      : period.kind === 'month'
        ? L.monthLabel(Number(period.ym.slice(0, 4)), Number(period.ym.slice(5, 7)))
        : L.yearLabel(Number(period.year));

  const allRecords = useMemo(() => buildMemoryRecords(entries, people), [entries, people]);

  const periodRecords = useMemo(() => {
    if (period.kind === 'recent') {
      const from = daysAgoLocal(period.days);
      return allRecords.filter((r) => r.date >= from);
    }
    const prefix = period.kind === 'month' ? period.ym : period.year;
    return allRecords.filter((r) => r.date.startsWith(prefix));
  }, [allRecords, period]);

  // 記録が存在する月・年だけをチップとして出す（空の期間を選べても意味がないため）
  const pastMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRecords) if (r.date.length >= 7) set.add(r.date.slice(0, 7));
    return Array.from(set).sort().reverse().slice(0, MAX_PAST_MONTHS);
  }, [allRecords]);

  const pastYears = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRecords) if (r.date.length >= 4) set.add(r.date.slice(0, 4));
    return Array.from(set).sort().reverse();
  }, [allRecords]);

  // 期間を切り替えたら前回の生成結果はリセットする
  function selectPeriod(p: Period) {
    setPeriod(p);
    setResult(null);
    setError(null);
    setSaved(false);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setShared(false);
    setShareError(null);
    try {
      const review = await generateReview(periodRecords, periodLabel);
      setResult(review);
    } catch (e) {
      setError(e instanceof AiConfigError ? e.message : (e as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSaveReview() {
    if (!result) return;
    const body = [
      `【${L.reviewTitle}（${periodLabel}）】`,
      result.summary,
      ...result.highlights.map((h) => `・${h}`),
      `${L.reviewNextStep}: ${result.nextStep}`,
    ].join('\n');
    addEntry({
      date: todayLocal(),
      text: body,
      tags: ['振り返り'],
      source: '振り返り',
    });
    setSaved(true);
  }

  async function handleShareReview() {
    if (!result) return;
    // 初回だけ利用ルールへの同意を確認する（App StoreのUGC要件・以後は表示しない）
    if (!(await hasAcceptedKodamaTerms())) {
      const agreed = await confirmAsync(L.kodamaTermsTitle, L.kodamaTermsMessage);
      if (!agreed) return;
      await markKodamaTermsAccepted();
    }
    const proceed = await confirmAsync(L.reviewShareConfirmTitle, L.reviewShareConfirmMessage);
    if (!proceed) return;
    setIsSharing(true);
    setShareError(null);
    try {
      await shareEcho(result.summary);
      setShared(true);
    } catch (e) {
      if (e instanceof ShareBlockedError) {
        setShareError(e.code === 'daily-limit' ? L.echoShareDailyLimit(e.limit) : L.echoShareUnsafe);
      } else if (e instanceof CommunityConfigError) {
        setShareError(L.echoesNotConfigured);
      } else {
        setShareError((e as Error).message);
      }
    } finally {
      setIsSharing(false);
    }
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
        <Text style={styles.title}>{L.reviewTitle}</Text>
        <Text style={styles.desc}>{L.reviewDesc}</Text>

        {!isPaid ? (
          <View style={styles.upsellCard}>
            <Ionicons name="lock-closed-outline" size={22} color={AppColors.accent} />
            <Text style={styles.upsellText}>{L.reviewUpsell}</Text>
            <Pressable style={styles.upsellButton} onPress={() => router.push('/plans')}>
              <Ionicons name="pricetags-outline" size={15} color={AppColors.background} />
              <Text style={styles.upsellButtonText}>{L.planLink}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.periodRow}>
              {([7, 30] as const).map((days) => {
                const selected = period.kind === 'recent' && period.days === days;
                return (
                  <Pressable
                    key={days}
                    style={[styles.periodChip, selected && styles.periodChipSelected]}
                    onPress={() => {
                      setPastOpen(false);
                      selectPeriod({ kind: 'recent', days });
                    }}>
                    <Text style={[styles.periodChipText, selected && styles.periodChipTextSelected]}>
                      {days === 7 ? L.reviewWeekly : L.reviewMonthly}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={[styles.periodChip, period.kind !== 'recent' && styles.periodChipSelected]}
                onPress={() => setPastOpen((v) => !v)}>
                <Text
                  style={[
                    styles.periodChipText,
                    period.kind !== 'recent' && styles.periodChipTextSelected,
                  ]}>
                  {L.reviewPast}
                </Text>
              </Pressable>
            </View>

            {/* 過去の年月チップ。記録がある年・月だけを表示する */}
            {pastOpen && (
              <View style={styles.pastWrap}>
                {pastYears.map((y) => {
                  const selected = period.kind === 'year' && period.year === y;
                  return (
                    <Pressable
                      key={y}
                      style={[styles.pastChip, selected && styles.periodChipSelected]}
                      onPress={() => selectPeriod({ kind: 'year', year: y })}>
                      <Text style={[styles.pastChipText, selected && styles.periodChipTextSelected]}>
                        {L.yearLabel(Number(y))}
                      </Text>
                    </Pressable>
                  );
                })}
                {pastMonths.map((ym) => {
                  const selected = period.kind === 'month' && period.ym === ym;
                  return (
                    <Pressable
                      key={ym}
                      style={[styles.pastChip, selected && styles.periodChipSelected]}
                      onPress={() => selectPeriod({ kind: 'month', ym })}>
                      <Text style={[styles.pastChipText, selected && styles.periodChipTextSelected]}>
                        {L.monthLabel(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={styles.recordCount}>{L.reviewPeriodRecords(periodRecords.length)}</Text>

            {periodRecords.length === 0 ? (
              <Text style={styles.empty}>{L.reviewEmpty}</Text>
            ) : (
              <>
                <GradientButton
                  label={L.reviewButton}
                  iconName="sparkles-outline"
                  onPress={handleGenerate}
                  loading={isGenerating}
                />
                <AiSendNote text={L.reviewSendNote} />
              </>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            {result && (
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>Sarjavex AI ・ {periodLabel}</Text>
                <Text style={styles.resultSummary}>{result.summary}</Text>

                {result.highlights.length > 0 && (
                  <View style={styles.highlightBox}>
                    <Text style={styles.sectionLabel}>{L.reviewHighlights}</Text>
                    {result.highlights.map((h, i) => (
                      <View key={i} style={styles.highlightRow}>
                        <Ionicons name="checkmark-circle" size={14} color={AppColors.success} />
                        <Text style={styles.highlightText}>{h}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {result.nextStep.length > 0 && (
                  <View style={styles.nextStepBox}>
                    <Text style={styles.sectionLabel}>{L.reviewNextStep}</Text>
                    <Text style={styles.nextStepText}>{result.nextStep}</Text>
                  </View>
                )}

                <View style={styles.actionRow}>
                  {saved ? (
                    <View style={styles.savedRow}>
                      <Ionicons name="checkmark-circle" size={15} color={AppColors.success} />
                      <Text style={styles.savedText}>{L.aiAnswerSaved}</Text>
                    </View>
                  ) : (
                    <Pressable style={styles.saveButton} onPress={handleSaveReview}>
                      <Ionicons name="bookmark-outline" size={14} color={AppColors.primary} />
                      <Text style={styles.saveButtonText}>{L.aiAnswerSave}</Text>
                    </Pressable>
                  )}

                  {shared ? (
                    <View style={styles.savedRow}>
                      <Ionicons name="checkmark-circle" size={15} color={AppColors.success} />
                      <Text style={styles.savedText}>{L.reviewShared}</Text>
                    </View>
                  ) : (
                    <Pressable style={styles.saveButton} onPress={handleShareReview} disabled={isSharing}>
                      {isSharing ? (
                        <ActivityIndicator size="small" color={AppColors.primary} />
                      ) : (
                        <Ionicons name="ear-outline" size={14} color={AppColors.primary} />
                      )}
                      <Text style={styles.saveButtonText}>{L.reviewShare}</Text>
                    </Pressable>
                  )}
                </View>
                {shareError && <Text style={styles.errorText}>{shareError}</Text>}
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
    periodRow: { flexDirection: 'row', gap: 10 },
    periodChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: AppColors.line,
    },
    periodChipSelected: { borderColor: AppColors.accent, backgroundColor: AppColors.accentSoft },
    periodChipText: { fontSize: 14, color: AppColors.muted, fontWeight: '600' },
    periodChipTextSelected: { color: AppColors.accent, fontWeight: '800' },
    pastWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pastChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 40,
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: AppColors.line,
    },
    pastChipText: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
    recordCount: { fontSize: 13, color: AppColors.accent, fontWeight: '700' },
    empty: { textAlign: 'center', color: AppColors.muted, fontSize: 14, marginTop: 20, lineHeight: 21 },
    generateButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      backgroundColor: AppColors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      minHeight: 44,
      ...glow(AppColors.primary),
    },
    generateButtonText: { color: AppColors.background, fontWeight: '800', fontSize: 14 },
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
    highlightBox: { gap: 6 },
    highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    highlightText: { flex: 1, fontSize: 13, color: AppColors.text, lineHeight: 19 },
    nextStepBox: { backgroundColor: AppColors.accentSoft, borderRadius: 12, padding: 12, gap: 6 },
    nextStepText: { fontSize: 13, color: AppColors.text, lineHeight: 19 },
    actionRow: { flexDirection: 'row', gap: 10 },
    saveButton: {
      flex: 1,
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
    savedRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
    savedText: { fontSize: 13, color: AppColors.success, fontWeight: '600' },
  });

const themed = makeThemed(makeStyles);
