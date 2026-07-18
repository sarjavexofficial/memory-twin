import { Platform } from 'react-native';

import type { BillingCycle, PlanKey } from '@/store/settings-context';

// App内課金（IAP）の窓口。アプリ内で課金に触る場所はこのファイルだけにする。
//
// 実体は RevenueCat 実装（billing-revenuecat.ts）。2026-07-17 に接続済み。
// セットアップ全体は docs/iap-setup-guide.md を参照。
//
// 安全ガード:
// - Web ではネイティブ課金が存在しないため、常に「利用不可」を返す
// - react-native-purchases 未搭載の旧バイナリ（ビルド7以前）が新しいJSを受け取った場合も、
//   require が失敗するだけでアプリ本体は壊れない（課金だけが「利用不可」になる）

// App Store Connect に登録する商品ID。先に決めておき、登録時にこのIDを使う。
// 命名規則: <アプリ略称>_<プラン>_<サイクル>（後から変更できないため慎重に）
export const PRODUCT_IDS: Record<Exclude<PlanKey, 'free'>, Record<BillingCycle, string>> = {
  standard: { monthly: 'mt_standard_monthly', yearly: 'mt_standard_yearly' },
  pro: { monthly: 'mt_pro_monthly', yearly: 'mt_pro_yearly' },
};

// サブスクリプショングループ内のランク（小さいほど上位）。
// Apple はこの上下関係から「アップグレード=即時・日割り返金 / ダウングレード=期間満了後」を自動適用する。
export const PLAN_LEVELS: Record<Exclude<PlanKey, 'free'>, number> = {
  pro: 1,
  standard: 2,
};

export type PurchaseResult =
  | { success: true }
  // cancelled: ユーザーが購入シートを自分で閉じた場合true。
  // それ以外の失敗理由(error)は内部向けの生メッセージなので、画面にはそのまま出さないこと
  | { success: false; error: string; cancelled?: boolean };

// App Storeから取得した実際の販売価格（国・通貨はユーザーのストア設定に従う）
export type StorePrice = { priceString: string; price: number; currencyCode: string };
export type StorePrices = Record<Exclude<PlanKey, 'free'>, Record<BillingCycle, StorePrice>>;

const UNAVAILABLE_ERROR =
  'この環境ではApp内課金を利用できません。App Storeの最新版アプリからお試しください。';

type RevenueCatModule = typeof import('@/lib/billing-revenuecat');

// ネイティブ課金モジュールを遅延読み込みする。読み込めない環境では null。
function loadRevenueCat(): RevenueCatModule | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('@/lib/billing-revenuecat') as RevenueCatModule;
  } catch {
    return null;
  }
}

// 起動時に1回呼ぶ（設定コンテキストのロード完了後）。失敗しても静かに無視
export function initBillingOnLaunch(): void {
  try {
    loadRevenueCat()?.initBilling();
  } catch {
    // キー未設定・旧バイナリ等。課金機能だけが無効になる
  }
}

// 起動時にストア側の契約状態を取得する（解約・期限切れ・再インストールの反映用）。
// 戻り値の意味を厳密に分ける:
//   - {plan, cycle} = 有効な契約あり / null = 照会に成功し「契約なし」と確定
//   - throw = 判定不能（Web・旧バイナリ・通信不調）→ 呼び出し側は現状維持すること
export async function getCurrentPlanFromStore(): Promise<{
  plan: Exclude<PlanKey, 'free'>;
  cycle: BillingCycle;
} | null> {
  const rc = loadRevenueCat();
  if (!rc) throw new Error('billing unavailable');
  return rc.getCurrentPlanFromStore();
}

// プラン購入（またはプラン/サイクル変更）。Appleの購入シートが表示される
export async function purchasePlan(
  plan: Exclude<PlanKey, 'free'>,
  cycle: BillingCycle,
): Promise<PurchaseResult> {
  const rc = loadRevenueCat();
  if (!rc) return { success: false, error: UNAVAILABLE_ERROR };
  return rc.purchasePlan(plan, cycle);
}

// 機種変更・再インストール時の購入復元
export async function restorePurchases(): Promise<{ plan: PlanKey; cycle: BillingCycle } | null> {
  const rc = loadRevenueCat();
  if (!rc) return null;
  return rc.restorePurchases();
}

// App Storeの実売価格（4商品すべて取得できたときだけ返す。それ以外はnull=取得失敗扱い）。
// プラン画面はこれが取れるまで購入ボタンを無効化し、取れたら固定表記の代わりに実価格を表示する
export async function getStorePrices(): Promise<StorePrices | null> {
  const rc = loadRevenueCat();
  if (!rc) return null;
  try {
    return await rc.getStorePrices();
  } catch (e) {
    // 詳細は開発者ログにのみ残す（画面には出さない）
    console.warn('[billing] getStorePrices failed:', (e as Error).message);
    return null;
  }
}
