import { BillingCycle, PlanKey } from '@/store/settings-context';

// App内課金（IAP）の窓口。アプリ内で課金に触る場所はこのファイルだけにする。
//
// 現在: デモ実装（常に成功を返す）。実際のお金は動かない。
// 本物のRevenueCat実装は billing-revenuecat.ts に作成済み（未接続）。
// 有効化するときは、下の purchasePlan / restorePurchases の中身を
// billing-revenuecat.ts からの再エクスポートに差し替えるだけ。呼び出し側は変更不要。
// 手順: docs/iap-setup-guide.md 参照。
//
// 注意: react-native-purchases はネイティブモジュールのため Expo Go では動かない。
//       導入時は EAS の開発ビルド（dev client）へ移行が必要。

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
  | { success: false; error: string };

// プラン購入（またはプラン/サイクル変更）。
// デモ実装では常に成功。RevenueCat導入後は該当商品の purchase 呼び出しに差し替える。
export async function purchasePlan(
  _plan: Exclude<PlanKey, 'free'>,
  _cycle: BillingCycle,
): Promise<PurchaseResult> {
  return { success: true };
}

// 機種変更・再インストール時の購入復元。
// デモ実装では何も購入していない扱い。RevenueCat導入後は restorePurchases() に差し替える。
export async function restorePurchases(): Promise<{ plan: PlanKey; cycle: BillingCycle } | null> {
  return null;
}
