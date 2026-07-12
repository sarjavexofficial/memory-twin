import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { GlowBackground, GradientButton, TitleAccent } from '@/components/futuristic';
import { AppPalette } from '@/constants/app-colors';
import { AiConfigError, generateMonthlyNarrative } from '@/lib/ai';
import { getAiProfile } from '@/lib/ai-profile';
import { useTodayLocal } from '@/lib/date';
import { useStrings } from '@/lib/i18n';
import { MOOD_EMOJIS } from '@/lib/journal-data';
import {
  computeMonthlyStats,
  getSavedNarrative,
  previousMonth,
  SavedNarrative,
  saveNarrative,
} from '@/lib/monthly-report';
import { makeThemed, useTheme } from '@/lib/theme';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { useSettings } from '@/store/settings-context';

export default function MonthlyReportScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { entries } = useJournal();
  const { people } = usePeople();
  const { settings } = useSettings();

  // 「今月/先月」は住んでいる国の日付基準。useTodayLocalなので
  // 画面を開いたまま月をまたいでも30秒以内に新しい月へ切り替わる
  const today = useTodayLocal();
  const thisMonth = today.slice(0, 7);
  const lastMonth = previousMonth(today);
  const [selected, setSelected] = useState<'this' | 'last'>('this');
  const month = selected === 'this' ? thisMonth : lastMonth;

  const stats = useMemo(() => computeMonthlyStats(month, entries, people), [month, entries, people]);

  // AIまとめは端末に保存されているものを読む（読み返しは無料）。生成・更新時だけAIを呼ぶ
  const [narrative, setNarrative] = useState<SavedNarrative | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFreePlan = settings.currentPlan === 'free';

  useEffect(() => {
    let active = true;
    getSavedNarrative(month).then((saved) => {
      if (active) setNarrative(saved);
    });
    return () => {
      active = false;
    };
  }, [month]);

  function monthLabel(m: string): string {
    return L.reportMonthLabel(Number(m.slice(0, 4)), Number(m.slice(5, 7)));
  }

  function statsLine(): string {
    const parts = [
      `${L.reportStatDays}=${L.reportDaysValue(stats.daysRecorded)}`,
      `${L.reportStatRecords}=${L.reportRecordsValue(stats.totalRecords)}`,
    ];
    if (stats.avgSleep !== null) parts.push(`${L.reportStatSleep}=${L.reportSleepValue(stats.avgSleep)}`);
    if (stats.avgMood !== null) parts.push(`${L.reportStatMood}=${stats.avgMood}/5`);
    if (stats.topPeople.length > 0)
      parts.push(`${L.reportTopPeople}=${stats.topPeople.map((p) => p.name).join('、')}`);
    return parts.join(', ');
  }

  async function handleGenerate() {
    setError(null);
    setIsGenerating(true);
    try {
      // AIの理解ノート（あれば）を添えて、まとめを本人向けに個人化する
      const profile = await getAiProfile();
      const text = await generateMonthlyNarrative(
        monthLabel(month),
        statsLine(),
        stats.excerpts,
        settings.language,
        profile?.summary,
      );
      // 端末に保存して、次からは無料で読み返せるようにする
      setNarrative(await saveNarrative(month, text, stats.totalRecords));
    } catch (e) {
      setError(e instanceof AiConfigError ? e.message : (e as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleShare() {
    // 共有はテキスト形式（統計＋AIまとめがあればそれも）。将来は画像カード化したい
    const lines = [
      `Memory Twin — ${monthLabel(month)}`,
      `${L.reportStatDays}: ${L.reportDaysValue(stats.daysRecorded)}`,
      `${L.reportStatRecords}: ${L.reportRecordsValue(stats.totalRecords)}`,
    ];
    if (stats.avgSleep !== null) lines.push(`${L.reportStatSleep}: ${L.reportSleepValue(stats.avgSleep)}`);
    if (stats.avgMood !== null)
      lines.push(`${L.reportStatMood}: ${MOOD_EMOJIS[Math.round(stats.avgMood) - 1]} ${stats.avgMood}/5`);
    if (narrative) lines.push('', narrative.text);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // 共有シートが使えない環境（Web等）では静かに何もしない
    }
  }

  const hasData = stats.totalRecords > 0;

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
        <Text style={styles.title}>{L.reportTitle}</Text>
        <TitleAccent />
        <Text style={styles.desc}>{L.reportDesc}</Text>

        <View style={styles.monthRow}>
          {(
            [
              { key: 'this', label: L.reportThisMonth },
              { key: 'last', label: L.reportLastMonth },
            ] as const
          ).map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.monthChip, selected === opt.key && styles.monthChipSelected]}
              onPress={() => {
                setSelected(opt.key);
                setError(null);
              }}>
              <Text style={[styles.monthChipText, selected === opt.key && styles.monthChipTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.monthTitle}>{monthLabel(month)}</Text>

        {!hasData ? (
          <Text style={styles.empty}>{L.reportNoData}</Text>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{L.reportStatDays}</Text>
                <Text style={styles.statValue}>{L.reportDaysValue(stats.daysRecorded)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{L.reportStatRecords}</Text>
                <Text style={styles.statValue}>{L.reportRecordsValue(stats.totalRecords)}</Text>
              </View>
              {stats.avgSleep !== null && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>{L.reportStatSleep}</Text>
                  <Text style={styles.statValue}>{L.reportSleepValue(stats.avgSleep)}</Text>
                </View>
              )}
              {stats.avgMood !== null && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>{L.reportStatMood}</Text>
                  <Text style={styles.statValue}>
                    {MOOD_EMOJIS[Math.round(stats.avgMood) - 1]} {stats.avgMood}/5
                  </Text>
                </View>
              )}
              {stats.topPeople.length > 0 && (
                <View>
                  <Text style={styles.statLabel}>{L.reportTopPeople}</Text>
                  <View style={styles.peopleRow}>
                    {stats.topPeople.map((p) => (
                      <View key={p.name} style={styles.personChip}>
                        <Text style={styles.personChipText}>
                          {p.name} ×{p.count}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.narrativeLabel}>{L.reportNarrativeLabel}</Text>
              {narrative ? (
                <>
                  <Text style={styles.narrativeText}>{narrative.text}</Text>
                  {/* 生成時より記録が増えたときだけ、更新（再生成）を提案する */}
                  {!isFreePlan && narrative.recordCount !== stats.totalRecords && (
                    <GradientButton
                      label={L.reportRegenerateButton}
                      iconName="refresh-outline"
                      onPress={handleGenerate}
                      loading={isGenerating}
                    />
                  )}
                </>
              ) : isFreePlan ? (
                <>
                  <Text style={styles.upgradeText}>{L.reportUpgradeNote}</Text>
                  <Pressable style={styles.planButton} onPress={() => router.push('/plans')}>
                    <Ionicons name="pricetags-outline" size={16} color={AppColors.primary} />
                    <Text style={styles.planButtonText}>{L.planLink}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <AiSendNote text={L.reportAiSendNote} />
                  <GradientButton
                    label={L.reportAiButton}
                    iconName="sparkles-outline"
                    onPress={handleGenerate}
                    loading={isGenerating}
                  />
                </>
              )}
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <Pressable style={styles.shareButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={16} color={AppColors.primary} />
              <Text style={styles.shareButtonText}>{L.reportShareButton}</Text>
            </Pressable>
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
    monthRow: { flexDirection: 'row', gap: 10 },
    monthChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 11,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: AppColors.line,
    },
    monthChipSelected: { borderColor: AppColors.primary, backgroundColor: AppColors.primarySoft },
    monthChipText: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
    monthChipTextSelected: { color: AppColors.primary, fontWeight: '800' },
    monthTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text },
    empty: { textAlign: 'center', color: AppColors.muted, fontSize: 14, marginTop: 30, lineHeight: 21 },
    card: {
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
      gap: 12,
    },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statLabel: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
    statValue: { fontSize: 15, color: AppColors.text, fontWeight: '800' },
    peopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    personChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: AppColors.line,
      backgroundColor: AppColors.background,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    personChipText: { fontSize: 12, color: AppColors.text, fontWeight: '700' },
    narrativeLabel: { fontSize: 12, fontWeight: '800', color: AppColors.accent },
    narrativeText: { fontSize: 14, color: AppColors.text, lineHeight: 22 },
    upgradeText: { fontSize: 13, color: AppColors.muted, lineHeight: 19 },
    planButton: {
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
    planButtonText: { color: AppColors.primary, fontWeight: '700', fontSize: 14 },
    errorText: { color: AppColors.danger, fontSize: 13, lineHeight: 19 },
    shareButton: {
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
    shareButtonText: { color: AppColors.primary, fontWeight: '700', fontSize: 14 },
  });

const themed = makeThemed(makeStyles);
