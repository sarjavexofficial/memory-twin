import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { GlowBackground, GradientButton, TitleAccent } from '@/components/futuristic';
import { AppPalette } from '@/constants/app-colors';
import { AiConfigError, polishEcho } from '@/lib/ai';
import { confirmAsync } from '@/lib/confirm';
import {
  checkCanShare,
  CommunityConfigError,
  deleteMyEcho,
  Echo,
  fetchEchoes,
  getEchoShareStatus,
  getMyEchoIds,
  hasAcceptedKodamaTerms,
  markKodamaTermsAccepted,
  hasReacted,
  reactToEcho,
  reportEcho,
  ShareBlockCode,
  ShareBlockedError,
  shareEcho,
  unreactToEcho,
} from '@/lib/community';
import { useTodayLocal } from '@/lib/date';
import { FEATURES } from '@/lib/feature-flags';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { useSettings } from '@/store/settings-context';

export default function EchoesScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { settings } = useSettings();

  // 機能を非公開にしている間は、直リンクで開かれてもホームへ戻す
  useEffect(() => {
    if (!FEATURES.kodama) router.replace('/');
  }, []);
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [reactedIds, setReactedIds] = useState<Set<string>>(new Set());
  const [myIds, setMyIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 投稿フォーム: 一言→AIが匿名化・整文→本人確認のうえ共有、の3段階
  const [draft, setDraft] = useState('');
  const [polished, setPolished] = useState<string | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [sharedMsg, setSharedMsg] = useState(false);
  // プランごとの1日の共有回数（残数をフォームに表示する）
  const [shareStatus, setShareStatus] = useState<{ used: number; limit: number } | null>(null);

  function shareBlockMessage(code: ShareBlockCode, limit: number): string {
    switch (code) {
      case 'unsafe':
        return L.echoShareUnsafe;
      case 'daily-limit':
        return L.echoShareDailyLimit(limit);
      case 'empty':
        return '';
    }
  }

  // showSpinner=false は「引っ張って更新」用。一覧を消さずに裏で読み直す
  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    setError(null);
    try {
      const list = await fetchEchoes();
      setEchoes(list);
      const flags = await Promise.all(list.map((e) => hasReacted(e.id)));
      setReactedIds(new Set(list.filter((_, i) => flags[i]).map((e) => e.id)));
      setMyIds(await getMyEchoIds());
      setShareStatus(await getEchoShareStatus());
    } catch (e) {
      setError(e instanceof CommunityConfigError ? L.echoesNotConfigured : (e as Error).message);
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  // 「住んでいる国」の日付が変わった瞬間に、残り共有回数の表示もリセットする
  // （useTodayLocalは国設定のタイムゾーン基準で日付変化を監視する）
  const today = useTodayLocal();
  useEffect(() => {
    load();
  }, [load, today]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await load(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [load]);

  async function handlePolish() {
    const raw = draft.trim();
    if (!raw) return;
    setComposeError(null);
    setSharedMsg(false);
    // 危険な内容やプランごとの回数制限は、AIに送る前にローカルで先に確認する
    const check = await checkCanShare(raw);
    if (!check.ok) {
      setComposeError(shareBlockMessage(check.code, check.limit));
      return;
    }
    setIsPolishing(true);
    try {
      const result = await polishEcho(raw, settings.language);
      if (!result) throw new Error(L.twinError(''));
      setPolished(result);
    } catch (e) {
      setComposeError(e instanceof AiConfigError ? e.message : (e as Error).message);
    } finally {
      setIsPolishing(false);
    }
  }

  async function handleShare() {
    if (!polished) return;
    // 初回だけ利用ルールへの同意を確認する（App StoreのUGC要件・以後は表示しない）
    if (!(await hasAcceptedKodamaTerms())) {
      const agreed = await confirmAsync(L.kodamaTermsTitle, L.kodamaTermsMessage);
      if (!agreed) return;
      await markKodamaTermsAccepted();
    }
    setIsSharing(true);
    setComposeError(null);
    try {
      await shareEcho(polished);
      setDraft('');
      setPolished(null);
      setSharedMsg(true);
      await load(); // 自分の投稿と残り回数を一覧に反映
    } catch (e) {
      setComposeError(
        e instanceof ShareBlockedError ? shareBlockMessage(e.code, e.limit) : (e as Error).message,
      );
    } finally {
      setIsSharing(false);
    }
  }

  async function handleReact(id: string) {
    const isRemoving = reactedIds.has(id);
    // 反応した見た目を即時反映し、通信は裏で行う（連打してもローカルの反応記録で1回に制限される）
    setReactedIds((prev) => {
      const next = new Set(prev);
      if (isRemoving) next.delete(id);
      else next.add(id);
      return next;
    });
    setEchoes((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, reaction_count: Math.max(0, e.reaction_count + (isRemoving ? -1 : 1)) }
          : e,
      ),
    );
    try {
      if (isRemoving) await unreactToEcho(id);
      else await reactToEcho(id);
    } catch {
      // 反応の送信失敗は致命的ではないため、静かに無視する（次回読み込みで実際の件数に揃う）
    }
  }

  async function handleDeleteMine(id: string) {
    const proceed = await confirmAsync(L.echoDeleteTitle, L.echoDeleteMessage);
    if (!proceed) return;
    try {
      await deleteMyEcho(id);
      setEchoes((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleReport(id: string) {
    const proceed = await confirmAsync(L.echoesReportTitle, L.echoesReportMessage);
    if (!proceed) return;
    setEchoes((prev) => prev.filter((e) => e.id !== id));
    try {
      await reportEcho(id);
    } catch {
      // 通報の送信に失敗しても、この端末の一覧からは既に消しているため体験は保たれる
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

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={AppColors.accent}
            colors={[AppColors.accent]}
          />
        }>
        <Text style={styles.title}>{L.echoesTitle}</Text>
        <TitleAccent />
        <Text style={styles.desc}>{L.echoesDesc}</Text>
        <AiSendNote text={L.echoesSendNote} />

        <View style={styles.composeCard}>
          {polished === null ? (
            <>
              <TextInput
                style={styles.composeInput}
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  setSharedMsg(false);
                }}
                placeholder={L.echoComposePlaceholder}
                placeholderTextColor={AppColors.muted}
                maxLength={100}
                multiline
              />
              <AiSendNote text={L.echoComposeNote} />
              <GradientButton
                label={L.echoPolishButton}
                iconName="sparkles-outline"
                onPress={handlePolish}
                loading={isPolishing}
                disabled={!draft.trim()}
              />
              {shareStatus && shareStatus.limit - shareStatus.used > 0 && (
                <Text style={styles.remainingText}>
                  {L.echoShareRemaining(shareStatus.limit - shareStatus.used)}
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.previewLabel}>{L.echoPreviewLabel}</Text>
              <Text style={styles.previewText}>{polished}</Text>
              <View style={styles.composeActionRow}>
                <Pressable style={styles.rewriteButton} onPress={() => setPolished(null)} disabled={isSharing}>
                  <Ionicons name="create-outline" size={14} color={AppColors.muted} />
                  <Text style={styles.rewriteButtonText}>{L.echoRewriteButton}</Text>
                </Pressable>
                <GradientButton
                  label={L.echoShareThisButton}
                  iconName="paper-plane-outline"
                  onPress={handleShare}
                  loading={isSharing}
                  style={styles.shareButton}
                />
              </View>
            </>
          )}
          {sharedMsg && (
            <View style={styles.sharedRow}>
              <Ionicons name="checkmark-circle" size={15} color={AppColors.success} />
              <Text style={styles.sharedText}>{L.echoSharedMsg}</Text>
            </View>
          )}
          {composeError && <Text style={styles.errorText}>{composeError}</Text>}
        </View>

        {isLoading ? (
          <ActivityIndicator color={AppColors.accent} style={styles.loading} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : echoes.length === 0 ? (
          <Text style={styles.empty}>{L.echoesEmpty}</Text>
        ) : (
          echoes.map((echo) => (
            <View key={echo.id} style={styles.card}>
              <Text style={styles.cardText}>{echo.text}</Text>
              <View style={styles.cardFooter}>
                <Pressable
                  style={[styles.reactButton, reactedIds.has(echo.id) && styles.reactButtonActive]}
                  onPress={() => handleReact(echo.id)}
                  hitSlop={8}>
                  <Ionicons
                    name={reactedIds.has(echo.id) ? 'heart' : 'heart-outline'}
                    size={15}
                    color={reactedIds.has(echo.id) ? AppColors.danger : AppColors.muted}
                  />
                  <Text style={[styles.reactCount, reactedIds.has(echo.id) && styles.reactCountActive]}>
                    {echo.reaction_count}
                  </Text>
                </Pressable>
                {myIds.has(echo.id) ? (
                  <View style={styles.mineRow}>
                    <Text style={styles.mineBadge}>{L.echoMine}</Text>
                    <Pressable
                      style={styles.reportButton}
                      onPress={() => handleDeleteMine(echo.id)}
                      hitSlop={8}>
                      <Ionicons name="trash-outline" size={14} color={AppColors.muted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.reportButton} onPress={() => handleReport(echo.id)} hitSlop={8}>
                    <Ionicons name="flag-outline" size={13} color={AppColors.muted} />
                  </Pressable>
                )}
              </View>
            </View>
          ))
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
    loading: { marginTop: 30 },
    empty: { textAlign: 'center', color: AppColors.muted, fontSize: 14, marginTop: 30, lineHeight: 21 },
    errorText: { color: AppColors.danger, fontSize: 13, lineHeight: 19 },
    composeCard: {
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
      gap: 12,
    },
    composeInput: {
      minHeight: 70,
      borderWidth: 1,
      borderColor: AppColors.line,
      borderRadius: 12,
      padding: 12,
      color: AppColors.text,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top',
      backgroundColor: AppColors.background,
    },
    previewLabel: { fontSize: 12, fontWeight: '800', color: AppColors.accent },
    previewText: { fontSize: 14, color: AppColors.text, lineHeight: 21 },
    composeActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rewriteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: AppColors.line,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    rewriteButtonText: { fontSize: 13, fontWeight: '700', color: AppColors.muted },
    shareButton: { flex: 1 },
    sharedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sharedText: { fontSize: 13, color: AppColors.success, fontWeight: '600' },
    remainingText: { fontSize: 11, color: AppColors.muted, textAlign: 'center' },
    card: {
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
      gap: 12,
    },
    cardText: { fontSize: 14, color: AppColors.text, lineHeight: 21 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reactButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: AppColors.background,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: AppColors.line,
    },
    reactButtonActive: { borderColor: AppColors.dangerSoft, backgroundColor: AppColors.dangerSoft },
    reactCount: { fontSize: 12, fontWeight: '700', color: AppColors.muted },
    reactCountActive: { color: AppColors.danger },
    reportButton: { padding: 6 },
    mineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    mineBadge: { fontSize: 10, color: AppColors.muted, fontWeight: '700' },
  });

const themed = makeThemed(makeStyles);
