import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette } from '@/constants/app-colors';
import { getStorePrices, purchasePlan, restorePurchases, StorePrices } from '@/lib/billing';
import { FEATURES } from '@/lib/feature-flags';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { BillingCycle, PlanKey, useSettings } from '@/store/settings-context';

const PLAN_NAMES: Record<PlanKey, string> = { free: 'Free', standard: 'Standard', pro: 'Pro' };
// 表示価格の一覧。年額は「月額×10」（=2か月分お得）で統一する。
// 実際の請求額はApp Store Connectの商品設定が正（このIDと価格を一致させること）
const PLAN_PRICES: Record<'standard' | 'pro', { monthly: string; yearly: string }> = {
  standard: { monthly: '980', yearly: '9,800' },
  pro: { monthly: '1,980', yearly: '19,800' },
};

// iOSのサブスクリプション管理画面（プラン変更・解約はAppleの標準画面で行う）
const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

// 1日あたりの金額（月払い=30日、年払い=365日換算）。「1日66円」の実感で価格の心理的ハードルを下げる
function perDayYen(prices: { monthly: string; yearly: string }, cycle: BillingCycle): string {
  const total = Number((cycle === 'monthly' ? prices.monthly : prices.yearly).replace(/,/g, ''));
  return String(Math.round(total / (cycle === 'monthly' ? 30 : 365)));
}

// 通貨つきの金額表示（例: ¥1,650 / US$1.99）。国ごとの通貨・表記はストア取得値に従う
function fmtCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${Math.round(amount * 100) / 100} ${currency}`;
  }
}

export default function PlansScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { settings, setCurrentPlan } = useSettings();
  const [changeResult, setChangeResult] = useState<string | null>(null);

  const currentPlan = settings.currentPlan;
  const currentCycle: BillingCycle = settings.billingCycle ?? 'monthly';
  // Pro無料体験の残り日数（体験中でなければnull）
  const trialDaysLeft = settings.trialEndsAt
    ? Math.max(1, Math.ceil((new Date(settings.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;
  // 画面上で選択中の支払いサイクル（購入するまでは保存しない）
  const [cycle, setCycle] = useState<BillingCycle>(currentCycle);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  // 購入処理中のプラン（Appleの購入シートが出ている間、ボタンを無効化する）
  const [purchasingPlan, setPurchasingPlan] = useState<PlanKey | null>(null);

  // App Storeの実売価格。取得できるまで購入ボタンは無効（表示価格と請求額のズレを防ぐ）
  const [priceState, setPriceState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [storePrices, setStorePrices] = useState<StorePrices | null>(null);

  async function loadPrices() {
    setPriceState('loading');
    const prices = await getStorePrices();
    setStorePrices(prices);
    setPriceState(prices ? 'ready' : 'failed');
  }

  useEffect(() => {
    loadPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 有料プランの購入・変更。Appleの購入シートがそのまま表示される（確認や認証はApple側が行う）。
  // 無料への変更（解約）はアプリからはできず、Appleのサブスクリプション管理画面で行う
  async function handleSelectPlan(planKey: 'standard' | 'pro') {
    setPurchaseError(null);
    setChangeResult(null);
    setRestoreMsg(null);
    setPurchasingPlan(planKey);
    try {
      const result = await purchasePlan(planKey, cycle);
      if (result.success) {
        setCurrentPlan(planKey, cycle);
        setChangeResult(L.planChanged(PLAN_NAMES[planKey]));
      } else if (result.cancelled) {
        setPurchaseError(result.error);
      } else {
        // 内部エラーの生文言（英語のSDKメッセージ等）は画面に出さず、開発者ログにのみ残す
        console.warn('[plans] purchase failed:', result.error);
        setPurchaseError(L.purchaseFailedGeneric);
      }
    } finally {
      setPurchasingPlan(null);
    }
  }

  // 購入の復元(機種変更・再インストール時)。App Store審査で必須のUI
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

  // 有料プランの表示価格を組み立てる。ストアから実価格が取れていればそれを優先し
  // （国・通貨に自動追従）、取れるまでは日本向けの定価をプレースホルダーとして見せる
  function paidPlanDisplay(key: 'standard' | 'pro') {
    const sp = storePrices?.[key];
    const price =
      cycle === 'monthly'
        ? sp
          ? L.planPriceMonthly(sp.monthly.priceString)
          : L.planPerMonth(PLAN_PRICES[key].monthly)
        : sp
          ? L.planPriceYearlyMain(sp.yearly.priceString)
          : L.planPerYear(PLAN_PRICES[key].yearly);
    const yearly =
      cycle === 'monthly'
        ? sp
          ? L.planPriceYearlySub(sp.yearly.priceString)
          : L.planYearly(PLAN_PRICES[key].yearly)
        : L.billingYearlySave;
    // 「1日あたり◯円」は円建てのときだけ（他通貨では実価格の月換算を出す）
    const isJpy = !sp || sp.monthly.currencyCode === 'JPY';
    const perDay = isJpy
      ? sp
        ? String(Math.round((cycle === 'monthly' ? sp.monthly.price : sp.yearly.price) / (cycle === 'monthly' ? 30 : 365)))
        : perDayYen(PLAN_PRICES[key], cycle)
      : null;
    // 年払い選択中は「1か月あたり」の換算も見せて、月額との比較を分かりやすくする
    const perMonthEquiv =
      cycle === 'yearly'
        ? fmtCurrency(
            sp ? sp.yearly.price / 12 : Number(PLAN_PRICES[key].yearly.replace(/,/g, '')) / 12,
            sp ? sp.yearly.currencyCode : 'JPY',
          )
        : null;
    return { price, yearly, perDay, perMonthEquiv };
  }

  const plans = [
    {
      key: 'free' as PlanKey,
      emoji: '🌱',
      name: 'Free',
      price: L.planFree,
      yearly: null as string | null,
      perDay: null as string | null,
      perMonthEquiv: null as string | null,
      tag: L.planFreeTag,
      features: L.planFreeFeatures,
      accent: AppColors.success,
      accentSoft: AppColors.successSoft,
    },
    {
      key: 'standard' as PlanKey,
      emoji: '⭐',
      name: 'Standard',
      ...paidPlanDisplay('standard'),
      tag: L.planStandardTag,
      features: L.planStandardFeatures,
      accent: AppColors.accent,
      accentSoft: AppColors.accentSoft,
    },
    {
      key: 'pro' as PlanKey,
      emoji: '⚡',
      name: 'Pro',
      ...paidPlanDisplay('pro'),
      tag: L.planProTag,
      features: L.planProFeatures,
      accent: AppColors.primary,
      accentSoft: AppColors.primarySoft,
    },
  ].map((p) => ({ ...p, current: p.key === currentPlan }));

  // 課金を提供していないビルドでは課金画面を出荷しない（deep link等で開かれてもホームへ）
  if (!FEATURES.paidPlans) {
    return <Redirect href="/" />;
  }

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

        {/* 価格取得の状態表示。失敗時は内部エラーではなく分かりやすい日本語＋再試行導線を出す */}
        {priceState === 'loading' && (
          <View style={styles.priceStateRow}>
            <ActivityIndicator size="small" color={AppColors.muted} />
            <Text style={styles.priceStateText}>{L.plansPriceLoading}</Text>
          </View>
        )}
        {priceState === 'failed' && (
          <View style={styles.priceErrorBox}>
            <Ionicons name="cloud-offline-outline" size={16} color={AppColors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.priceErrorText}>{L.plansPriceError}</Text>
              <Pressable onPress={loadPrices} hitSlop={8}>
                <Text style={styles.priceReloadText}>{L.plansReload}</Text>
              </Pressable>
            </View>
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
            {plan.perMonthEquiv && (
              <Text style={styles.perDayText}>{L.planPerMonthEquiv(plan.perMonthEquiv)}</Text>
            )}
            <View style={styles.featureList}>
              {plan.features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={15} color={plan.accent} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
            {/* 購入ボタンは有料プランのみ（無料へ戻す=解約はAppleのサブスクリプション管理から）。
                同じプランでも支払いサイクルが違えば変更ボタンを出す（月払い→年払いの乗り換え） */}
            {plan.key !== 'free' && (!plan.current || cycle !== currentCycle) && (
              <Pressable
                style={[
                  styles.selectButton,
                  { backgroundColor: plan.accent },
                  (purchasingPlan !== null || priceState !== 'ready') && { opacity: 0.55 },
                ]}
                disabled={purchasingPlan !== null || priceState !== 'ready'}
                onPress={() => handleSelectPlan(plan.key as 'standard' | 'pro')}>
                {purchasingPlan === plan.key ? (
                  <ActivityIndicator size="small" color={AppColors.background} />
                ) : (
                  <Text style={styles.selectButtonText}>
                    {priceState === 'failed'
                      ? L.planUnavailableBtn
                      : currentPlan === 'standard' && plan.key === 'pro'
                        ? L.upgradeToPro
                        : L.selectPlan}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        ))}

        {purchaseError && <Text style={styles.purchaseErrorText}>{purchaseError}</Text>}
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
          {/* 非公開中の機能（feature-flags.ts参照）の行は比較表から隠す */}
          {L.compareRows
            .filter((row) => !row.feature || FEATURES[row.feature])
            .map((row) => (
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
          {/* 自動更新の条件（App Store審査で求められる定型の開示） */}
          <View style={styles.paymentRow}>
            <Ionicons name="repeat-outline" size={16} color={AppColors.text} style={styles.paymentIcon} />
            <Text style={styles.paymentText}>{L.autoRenewNote}</Text>
          </View>
          {/* 規約類へのリンク（サブスク画面内にも設置：審査要件3.1.2） */}
          <View style={styles.legalLinkRow}>
            <Pressable
              hitSlop={8}
              onPress={() =>
                Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/').catch(() => {})
              }>
              <Text style={styles.footerLinkText}>{L.termsLink}</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => Linking.openURL('https://sarjavexofficial.github.io/privacy.html').catch(() => {})}>
              <Text style={styles.footerLinkText}>{L.privacyPolicyLink}</Text>
            </Pressable>
          </View>
          {/* 機種変更・再インストール時の復元窓口(App Store審査で必須のUI) */}
          <Pressable style={styles.footerLink} onPress={handleRestore} disabled={restoring}>
            <Ionicons name="refresh-outline" size={14} color={AppColors.muted} />
            <Text style={styles.footerLinkText}>{restoring ? '…' : L.restoreButton}</Text>
          </Pressable>
          {restoreMsg && <Text style={styles.footerResult}>{restoreMsg}</Text>}
          {/* プラン変更・解約はAppleの標準管理画面で行う */}
          {currentPlan !== 'free' && (
            <Pressable
              style={styles.footerLink}
              onPress={() => Linking.openURL(MANAGE_SUBSCRIPTIONS_URL).catch(() => {})}>
              <Ionicons name="settings-outline" size={14} color={AppColors.muted} />
              <Text style={styles.footerLinkText}>{L.cancelDemoLink}</Text>
            </Pressable>
          )}
        </View>
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
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    minHeight: 40,
  },
  footerLinkText: { fontSize: 12, color: AppColors.muted, textDecorationLine: 'underline' },
  footerResult: { fontSize: 12, color: AppColors.success, lineHeight: 17, textAlign: 'center' },
  selectButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 44,
  },
  selectButtonText: { color: AppColors.background, fontWeight: '800', fontSize: 14 },
  changeResult: { fontSize: 13, color: AppColors.success, textAlign: 'center', lineHeight: 18 },
  purchaseErrorText: { fontSize: 12, color: AppColors.danger, textAlign: 'center', lineHeight: 17 },
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
  compareNote: { fontSize: 11, color: AppColors.muted, lineHeight: 16, marginTop: 12 },
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
  priceStateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  priceStateText: { fontSize: 12, color: AppColors.muted },
  priceErrorBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: AppColors.dangerSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.danger,
    padding: 12,
  },
  priceErrorText: { fontSize: 12, color: AppColors.text, lineHeight: 17 },
  priceReloadText: {
    fontSize: 12,
    color: AppColors.primary,
    fontWeight: '800',
    marginTop: 6,
    textDecorationLine: 'underline',
  },
  legalLinkRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, flexWrap: 'wrap' },
});

const themed = makeThemed(makeStyles);
