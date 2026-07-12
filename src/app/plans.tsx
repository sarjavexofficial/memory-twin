import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette } from '@/constants/app-colors';
import { purchasePlan, restorePurchases } from '@/lib/billing';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { BillingCycle, PlanKey, useSettings } from '@/store/settings-context';

const HALF_PRICE: Record<PlanKey, string> = { free: '0', standard: '490', pro: '990' };
const PLAN_NAMES: Record<PlanKey, string> = { free: 'Free', standard: 'Standard', pro: 'Pro' };
// 表示価格の一覧。年額は「月額×10」（=2か月分お得）で統一する
const PLAN_PRICES: Record<'standard' | 'pro', { monthly: string; yearly: string }> = {
  standard: { monthly: '980', yearly: '9,800' },
  pro: { monthly: '1,980', yearly: '19,800' },
};

// 解約時フィードバックは端末内に蓄積（サーバー送信は運用開始後に実装）
const CANCEL_FEEDBACK_KEY = 'memory-twin:cancel-feedback';

// 1日あたりの金額（月払い=30日、年払い=365日換算）。「1日66円」の実感で価格の心理的ハードルを下げる
function perDayYen(prices: { monthly: string; yearly: string }, cycle: BillingCycle): string {
  const total = Number((cycle === 'monthly' ? prices.monthly : prices.yearly).replace(/,/g, ''));
  return String(Math.round(total / (cycle === 'monthly' ? 30 : 365)));
}

export default function PlansScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { settings, markRetentionOfferUsed, setCurrentPlan } = useSettings();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelResult, setCancelResult] = useState<string | null>(null);
  const [changeResult, setChangeResult] = useState<string | null>(null);

  const currentPlan = settings.currentPlan;
  const currentCycle: BillingCycle = settings.billingCycle ?? 'monthly';
  // Pro無料体験の残り日数（体験中でなければnull）
  const trialDaysLeft = settings.trialEndsAt
    ? Math.max(1, Math.ceil((new Date(settings.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;
  const offerAvailable = !settings.retentionOfferUsed?.[currentPlan];
  // 画面上で選択中の支払いサイクル（購入するまでは保存しない）
  const [cycle, setCycle] = useState<BillingCycle>(currentCycle);
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  function handleSelectPlan(planKey: PlanKey) {
    setPurchaseError(null);
    if (planKey === 'free') {
      // 無料への変更（ダウングレード）は認証不要
      setCurrentPlan(planKey);
      setChangeResult(L.planChanged(PLAN_NAMES[planKey]));
      setCancelResult(null);
      return;
    }
    // 有料プランは実際のiOS課金と同じく、承認シート＋生体認証を経由する
    setPendingPlan(planKey);
  }

  async function handleApprovePurchase() {
    if (!pendingPlan) return;
    setIsAuthenticating(true);
    setPurchaseError(null);
    try {
      if (Platform.OS !== 'web') {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (hasHardware) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: L.purchasePrompt(PLAN_NAMES[pendingPlan]),
          });
          if (!result.success) {
            setPurchaseError(L.purchaseFailed);
            return;
          }
        }
      }
      // 課金処理は billing.ts に集約（現在はデモ。RevenueCat導入時もこの呼び出しのまま）
      const result = await purchasePlan(pendingPlan as 'standard' | 'pro', cycle);
      if (!result.success) {
        setPurchaseError(result.error);
        return;
      }
      setCurrentPlan(pendingPlan, cycle);
      setChangeResult(L.planChanged(PLAN_NAMES[pendingPlan]));
      setCancelResult(null);
      setPendingPlan(null);
    } finally {
      setIsAuthenticating(false);
    }
  }

  // 購入の復元(機種変更・再インストール時)。billing.ts 経由なのでRevenueCat導入後もこのまま動く
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  async function handleRestore() {
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setCurrentPlan(restored.plan, restored.cycle);
        setRestoreMsg(L.restoreDone(PLAN_NAMES[restored.plan]));
      } else {
        setRestoreMsg(L.restoreNone);
      }
    } catch {
      setRestoreMsg(L.restoreFailed);
    } finally {
      setRestoring(false);
    }
  }

  // 解約フィードバック（理由チップ＋自由記述）。解約確認→フィードバック→完了の2段階
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState('');

  function handleAcceptOffer() {
    markRetentionOfferUsed(currentPlan);
    closeCancelModal();
    setCancelResult(L.offerAccepted);
  }

  function closeCancelModal() {
    setCancelModalOpen(false);
    setFeedbackMode(false);
    setSelectedReasons([]);
    setFeedbackText('');
  }

  function toggleReason(reason: string) {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    );
  }

  async function finalizeCancel(sendFeedback: boolean) {
    const hasFeedback = sendFeedback && (selectedReasons.length > 0 || feedbackText.trim().length > 0);
    if (hasFeedback) {
      try {
        const raw = await AsyncStorage.getItem(CANCEL_FEEDBACK_KEY);
        const list = raw ? (JSON.parse(raw) as unknown[]) : [];
        list.push({
          date: new Date().toISOString(),
          plan: currentPlan,
          reasons: selectedReasons,
          comment: feedbackText.trim(),
        });
        await AsyncStorage.setItem(CANCEL_FEEDBACK_KEY, JSON.stringify(list));
      } catch {
        // フィードバック保存に失敗しても解約自体は続行する
      }
    }
    // 解約 = 無料プランへ戻る（デモ）
    setCurrentPlan('free');
    closeCancelModal();
    setCancelResult(hasFeedback ? `${L.cancelFeedbackThanks}\n${L.cancelProceeded}` : L.cancelProceeded);
    setChangeResult(null);
  }

  const plans = [
    {
      key: 'free' as PlanKey,
      emoji: '🌱',
      name: 'Free',
      price: L.planFree,
      yearly: null,
      perDay: null as string | null,
      tag: L.planFreeTag,
      features: L.planFreeFeatures,
      accent: AppColors.success,
      accentSoft: AppColors.successSoft,
    },
    {
      key: 'standard' as PlanKey,
      emoji: '⭐',
      name: 'Standard',
      price:
        cycle === 'monthly'
          ? L.planPerMonth(PLAN_PRICES.standard.monthly)
          : L.planPerYear(PLAN_PRICES.standard.yearly),
      yearly: cycle === 'monthly' ? L.planYearly(PLAN_PRICES.standard.yearly) : L.billingYearlySave,
      perDay: perDayYen(PLAN_PRICES.standard, cycle),
      tag: L.planStandardTag,
      features: L.planStandardFeatures,
      accent: AppColors.accent,
      accentSoft: AppColors.accentSoft,
    },
    {
      key: 'pro' as PlanKey,
      emoji: '⚡',
      name: 'Pro',
      price:
        cycle === 'monthly'
          ? L.planPerMonth(PLAN_PRICES.pro.monthly)
          : L.planPerYear(PLAN_PRICES.pro.yearly),
      yearly: cycle === 'monthly' ? L.planYearly(PLAN_PRICES.pro.yearly) : L.billingYearlySave,
      perDay: perDayYen(PLAN_PRICES.pro, cycle),
      tag: L.planProTag,
      features: L.planProFeatures,
      accent: AppColors.primary,
      accentSoft: AppColors.primarySoft,
    },
  ].map((p) => ({ ...p, current: p.key === currentPlan }));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backRow}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={AppColors.primary} />
          <Text style={styles.backButton}>{L.back}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{L.plansTitle}</Text>
        <Text style={styles.subtitle}>{L.plansSubtitle}</Text>

        {/* Pro無料体験中: 残り日数を見せて「続けるならPro」を意識してもらう */}
        {trialDaysLeft !== null && (
          <View style={styles.trialBanner}>
            <Ionicons name="flash" size={14} color={AppColors.primary} />
            <Text style={styles.trialBannerText}>{L.trialBadge(trialDaysLeft)}</Text>
          </View>
        )}

        {/* 月払い/年払いの切り替え。年払いは月額×10（2か月分お得） */}
        <View style={styles.cycleToggle}>
          <Pressable
            style={[styles.cycleOption, cycle === 'monthly' && styles.cycleOptionActive]}
            onPress={() => setCycle('monthly')}>
            <Text style={[styles.cycleText, cycle === 'monthly' && styles.cycleTextActive]}>
              {L.billingMonthly}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.cycleOption, cycle === 'yearly' && styles.cycleOptionActive]}
            onPress={() => setCycle('yearly')}>
            <Text style={[styles.cycleText, cycle === 'yearly' && styles.cycleTextActive]}>
              {L.billingYearly}
            </Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>{L.billingYearlySave}</Text>
            </View>
          </Pressable>
        </View>

        {plans.map((plan) => (
          <View key={plan.key} style={[styles.planCard, plan.current && { borderColor: plan.accent }]}>
            <View style={styles.planHeaderRow}>
              <Text style={styles.planEmoji}>{plan.emoji}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.planNameRow}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {/* Proを視覚的な主役にする（推奨の明示は選択率を大きく変える） */}
                  {plan.key === 'pro' && (
                    <View style={styles.recommendBadge}>
                      <Text style={styles.recommendBadgeText}>{L.planRecommended}</Text>
                    </View>
                  )}
                  {plan.current && (
                    <View style={[styles.currentBadge, { backgroundColor: plan.accentSoft }]}>
                      <Text style={[styles.currentBadgeText, { color: plan.accent }]}>
                        {plan.key === 'free'
                          ? L.planCurrentBadge
                          : `${L.planCurrentBadge}・${currentCycle === 'yearly' ? L.billingYearly : L.billingMonthly}`}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planTag}>{plan.tag}</Text>
              </View>
            </View>
            <View style={styles.priceRow}>
              <Text style={[styles.planPrice, { color: plan.accent }]}>{plan.price}</Text>
              {plan.yearly && <Text style={styles.planYearly}>{plan.yearly}</Text>}
            </View>
            {plan.perDay && <Text style={styles.perDayText}>{L.planPerDay(plan.perDay)}</Text>}
            <View style={styles.featureList}>
              {plan.features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={15} color={plan.accent} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
            {/* 同じプランでも支払いサイクルが違えば変更ボタンを出す（月払い→年払いの乗り換え） */}
            {(!plan.current || (plan.key !== 'free' && cycle !== currentCycle)) && (
              <Pressable
                style={[styles.selectButton, { backgroundColor: plan.accent }]}
                onPress={() => handleSelectPlan(plan.key)}>
                <Text style={styles.selectButtonText}>{L.selectPlan}</Text>
              </Pressable>
            )}
          </View>
        ))}

        {changeResult && <Text style={styles.changeResult}>{changeResult}</Text>}

        {/* どの機能がどのプランでどこまで使えるかを一覧できる比較表 */}
        <View style={styles.compareCard}>
          <Text style={styles.compareTitle}>{L.compareTitle}</Text>
          <View style={[styles.compareRow, styles.compareHeaderRow]}>
            <Text style={[styles.compareLabel, styles.compareHeaderText]}>{L.compareFeature}</Text>
            <Text style={[styles.compareCell, styles.compareHeaderText, { color: AppColors.success }]}>
              🌱 Free
            </Text>
            <Text style={[styles.compareCell, styles.compareHeaderText, { color: AppColors.accent }]}>
              ⭐ Std
            </Text>
            <Text style={[styles.compareCell, styles.compareHeaderText, { color: AppColors.primary }]}>
              ⚡ Pro
            </Text>
          </View>
          {L.compareRows.map((row) => (
            <View key={row.label} style={styles.compareRow}>
              <View style={styles.compareLabel}>
                <Text style={styles.compareLabelText}>{row.label}</Text>
                {row.planned && (
                  <View style={styles.plannedBadge}>
                    <Text style={styles.plannedBadgeText}>{L.comparePlanned}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.compareCell, row.free === '—' && styles.compareCellOff]}>
                {row.free}
              </Text>
              <Text style={[styles.compareCell, row.standard === '—' && styles.compareCellOff]}>
                {row.standard}
              </Text>
              <Text style={[styles.compareCell, row.pro === '—' && styles.compareCellOff]}>
                {row.pro}
              </Text>
            </View>
          ))}
          <Text style={styles.compareNote}>{L.compareNote}</Text>
        </View>

        <View style={styles.paymentCard}>
          <Text style={styles.paymentTitle}>{L.paymentSection}</Text>
          <View style={styles.paymentRow}>
            <Ionicons name="logo-apple" size={16} color={AppColors.text} style={styles.paymentIcon} />
            <Text style={styles.paymentText}>{L.paymentIap}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Ionicons name="exit-outline" size={16} color={AppColors.text} style={styles.paymentIcon} />
            <Text style={styles.paymentText}>{L.paymentCancel}</Text>
          </View>
          {/* 機種変更・再インストール時の復元窓口(App Store審査で必須のUI) */}
          <Pressable style={styles.cancelDemoLink} onPress={handleRestore} disabled={restoring}>
            <Ionicons name="refresh-outline" size={14} color={AppColors.muted} />
            <Text style={styles.cancelDemoText}>{restoring ? '…' : L.restoreButton}</Text>
          </Pressable>
          {restoreMsg && <Text style={styles.cancelResult}>{restoreMsg}</Text>}
          {currentPlan !== 'free' && (
            <Pressable style={styles.cancelDemoLink} onPress={() => setCancelModalOpen(true)}>
              <Ionicons name="exit-outline" size={14} color={AppColors.muted} />
              <Text style={styles.cancelDemoText}>{L.cancelDemoLink}</Text>
            </Pressable>
          )}
          {cancelResult && <Text style={styles.cancelResult}>{cancelResult}</Text>}
        </View>

        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={15} color={AppColors.muted} />
          <Text style={styles.noticeText}>{L.plansNotice}</Text>
        </View>
      </ScrollView>

      <Modal
        visible={cancelModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeCancelModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeCancelModal}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            {!feedbackMode ? (
              <>
                <Text style={styles.modalTitle}>{L.cancelModalTitle}</Text>

                {offerAvailable && (
                  <View style={styles.offerBox}>
                    <View style={styles.offerHeaderRow}>
                      <Ionicons name="gift-outline" size={15} color={AppColors.success} />
                      <Text style={styles.offerTitle}>{L.cancelOfferBadge}</Text>
                    </View>
                    <Text style={styles.offerText}>{L.cancelOfferText(HALF_PRICE[currentPlan])}</Text>
                  </View>
                )}

                {offerAvailable && (
                  <Pressable style={styles.offerButton} onPress={handleAcceptOffer}>
                    <Ionicons name="sparkles-outline" size={15} color={AppColors.background} />
                    <Text style={styles.offerButtonText}>{L.acceptOffer(HALF_PRICE[currentPlan])}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.cancelAnywayButton} onPress={() => setFeedbackMode(true)}>
                  <Text style={styles.cancelAnywayText}>{L.cancelAnyway}</Text>
                </Pressable>
                <Pressable style={styles.keepButton} onPress={closeCancelModal}>
                  <Text style={styles.keepButtonText}>{L.keepPlan}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>{L.cancelFeedbackTitle}</Text>
                <Text style={styles.feedbackDesc}>{L.cancelFeedbackDesc}</Text>

                <View style={styles.reasonWrap}>
                  {L.cancelReasons.map((reason) => {
                    const selected = selectedReasons.includes(reason);
                    return (
                      <Pressable
                        key={reason}
                        style={[styles.reasonChip, selected && styles.reasonChipSelected]}
                        onPress={() => toggleReason(reason)}>
                        <Text style={[styles.reasonChipText, selected && styles.reasonChipTextSelected]}>
                          {reason}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  placeholder={L.cancelFeedbackPlaceholder}
                  placeholderTextColor={AppColors.muted}
                  style={styles.feedbackInput}
                  multiline
                />

                <Pressable style={styles.offerButton} onPress={() => finalizeCancel(true)}>
                  <Ionicons name="paper-plane-outline" size={15} color={AppColors.background} />
                  <Text style={styles.offerButtonText}>{L.cancelSubmitAndCancel}</Text>
                </Pressable>
                <Pressable style={styles.cancelAnywayButton} onPress={() => finalizeCancel(false)}>
                  <Text style={styles.cancelAnywayText}>{L.cancelSkipFeedback}</Text>
                </Pressable>
                <Pressable style={styles.keepButton} onPress={closeCancelModal}>
                  <Text style={styles.keepButtonText}>{L.keepPlan}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={pendingPlan !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingPlan(null)}>
        <Pressable style={styles.purchaseBackdrop} onPress={() => setPendingPlan(null)}>
          <Pressable style={styles.purchaseSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.purchaseGrabber} />
            <View style={styles.purchaseHeaderRow}>
              <Ionicons name="bag-outline" size={18} color={AppColors.text} />
              <Text style={styles.purchaseTitle}>{L.purchaseSheetTitle}</Text>
            </View>

            {pendingPlan && (
              <View style={styles.purchaseInfo}>
                <View style={styles.purchaseInfoRow}>
                  <Text style={styles.purchaseInfoLabel}>{L.purchaseAppLabel}</Text>
                  <Text style={styles.purchaseInfoValue}>Memory Twin</Text>
                </View>
                <View style={styles.purchaseInfoRow}>
                  <Text style={styles.purchaseInfoLabel}>{L.purchasePlanLabel}</Text>
                  <Text style={styles.purchaseInfoValue}>
                    {pendingPlan === 'standard' ? '⭐ Standard' : '⚡ Pro'}
                  </Text>
                </View>
                <View style={styles.purchaseInfoRow}>
                  <Text style={styles.purchaseInfoLabel}>{L.purchasePriceLabel}</Text>
                  <Text style={styles.purchaseInfoValue}>
                    {(() => {
                      const prices = pendingPlan === 'standard' ? PLAN_PRICES.standard : PLAN_PRICES.pro;
                      return cycle === 'monthly'
                        ? L.planPerMonth(prices.monthly)
                        : `${L.planPerYear(prices.yearly)}（${L.billingYearlySave}）`;
                    })()}
                  </Text>
                </View>
              </View>
            )}

            {purchaseError && <Text style={styles.purchaseErrorText}>{purchaseError}</Text>}

            <Pressable
              style={[styles.purchaseAuthButton, isAuthenticating && { opacity: 0.6 }]}
              onPress={handleApprovePurchase}
              disabled={isAuthenticating}>
              <Ionicons
                name={Platform.OS === 'web' ? 'checkmark-circle-outline' : 'scan-outline'}
                size={18}
                color={AppColors.background}
              />
              <Text style={styles.purchaseAuthText}>
                {Platform.OS === 'web' ? L.purchaseWebFallbackButton : L.purchaseAuthButton}
              </Text>
            </Pressable>
            <Pressable style={styles.keepButton} onPress={() => setPendingPlan(null)}>
              <Text style={styles.keepButtonText}>{L.purchaseCancelButton}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  subtitle: { fontSize: 14, color: AppColors.muted, marginTop: -6, lineHeight: 20 },
  cycleToggle: {
    flexDirection: 'row',
    backgroundColor: AppColors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 4,
    gap: 4,
  },
  cycleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 8,
  },
  cycleOptionActive: { backgroundColor: AppColors.primarySoft },
  cycleText: { fontSize: 13, fontWeight: '700', color: AppColors.muted },
  cycleTextActive: { color: AppColors.primary },
  saveBadge: {
    backgroundColor: AppColors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  saveBadgeText: { fontSize: 10, fontWeight: '800', color: AppColors.success },
  planCard: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: AppColors.line,
    padding: 18,
    gap: 12,
  },
  planHeaderRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  planEmoji: { fontSize: 30 },
  planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontSize: 19, fontWeight: '800', color: AppColors.text },
  currentBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  currentBadgeText: { fontSize: 11, fontWeight: '800' },
  planTag: { fontSize: 12, color: AppColors.muted, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  planPrice: { fontSize: 26, fontWeight: '900' },
  planYearly: { fontSize: 12, color: AppColors.muted },
  featureList: { gap: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, color: AppColors.text, lineHeight: 18 },
  noticeBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: AppColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 12,
  },
  noticeText: { flex: 1, fontSize: 12, color: AppColors.muted, lineHeight: 17 },
  paymentCard: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 18,
    gap: 12,
  },
  paymentTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text },
  paymentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  paymentIcon: { marginTop: 2 },
  paymentText: { flex: 1, fontSize: 12, color: AppColors.muted, lineHeight: 18 },
  offerBox: {
    backgroundColor: AppColors.successSoft,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  offerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offerTitle: { fontSize: 13, fontWeight: '800', color: AppColors.success },
  offerText: { fontSize: 12, color: AppColors.text, lineHeight: 18 },
  cancelDemoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  cancelDemoText: { fontSize: 12, color: AppColors.muted, textDecorationLine: 'underline' },
  cancelResult: { fontSize: 12, color: AppColors.success, lineHeight: 17, textAlign: 'center' },
  selectButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 44,
  },
  selectButtonText: { color: AppColors.background, fontWeight: '800', fontSize: 14 },
  changeResult: { fontSize: 13, color: AppColors.success, textAlign: 'center', lineHeight: 18 },
  compareCard: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 18,
    gap: 0,
  },
  compareTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text, marginBottom: 10 },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.line,
    gap: 4,
  },
  compareHeaderRow: { borderBottomWidth: 1.5, paddingVertical: 6 },
  compareHeaderText: { fontWeight: '800', fontSize: 12 },
  compareLabel: { flex: 2.2, gap: 4 },
  compareLabelText: { fontSize: 12, color: AppColors.text, lineHeight: 16, fontWeight: '600' },
  compareCell: {
    flex: 1,
    fontSize: 11,
    color: AppColors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  compareCellOff: { color: AppColors.muted, fontWeight: '400' },
  plannedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: AppColors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  plannedBadgeText: { fontSize: 10, fontWeight: '800', color: AppColors.accent },
  recommendBadge: {
    backgroundColor: AppColors.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  recommendBadgeText: { fontSize: 10, fontWeight: '800', color: AppColors.background },
  perDayText: { fontSize: 12, color: AppColors.muted, marginTop: -6 },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.primarySoft,
    borderRadius: 12,
    paddingVertical: 9,
  },
  trialBannerText: { fontSize: 13, fontWeight: '800', color: AppColors.primary },
  compareNote: { fontSize: 11, color: AppColors.muted, lineHeight: 16, marginTop: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: AppColors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text, textAlign: 'center' },
  offerButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppColors.success,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 44,
  },
  offerButtonText: { color: AppColors.background, fontWeight: '800', fontSize: 14 },
  cancelAnywayButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.danger,
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 44,
  },
  cancelAnywayText: { color: AppColors.danger, fontWeight: '700', fontSize: 14 },
  feedbackDesc: { fontSize: 12, color: AppColors.muted, lineHeight: 17, textAlign: 'center' },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: AppColors.line,
  },
  reasonChipSelected: { borderColor: AppColors.primary, backgroundColor: AppColors.primarySoft },
  reasonChipText: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
  reasonChipTextSelected: { color: AppColors.primary, fontWeight: '800' },
  feedbackInput: {
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    fontSize: 14,
    color: AppColors.text,
    textAlignVertical: 'top',
  },
  keepButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, minHeight: 44 },
  keepButtonText: { color: AppColors.muted, fontWeight: '700', fontSize: 14 },
  purchaseBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  purchaseSheet: {
    backgroundColor: AppColors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 20,
    paddingBottom: 34,
    gap: 14,
  },
  purchaseGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: AppColors.line,
  },
  purchaseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  purchaseTitle: { fontSize: 16, fontWeight: '800', color: AppColors.text },
  purchaseInfo: {
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  purchaseInfoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  purchaseInfoLabel: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
  purchaseInfoValue: { fontSize: 13, color: AppColors.text, fontWeight: '700' },
  purchaseErrorText: { fontSize: 12, color: AppColors.danger, textAlign: 'center', lineHeight: 17 },
  purchaseAuthButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
  },
  purchaseAuthText: { color: AppColors.background, fontWeight: '800', fontSize: 13, flexShrink: 1 },
});

const themed = makeThemed(makeStyles);
