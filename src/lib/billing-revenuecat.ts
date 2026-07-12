import Purchases, { CustomerInfo } from 'react-native-purchases';

import { PRODUCT_IDS, PurchaseResult } from '@/lib/billing';
import { BillingCycle, PlanKey } from '@/store/settings-context';

// RevenueCat による本物の課金実装(2026-07-12作成・接続待ち)。
//
// ⚠️ このファイルはまだどこからも import されていない = アプリに含まれていない。
// 有効化の手順(docs/iap-setup-guide.md のStep 0〜2が済んでから):
//   1. devサーバーを全て停止 → `npx expo install react-native-purchases`
//   2. src/types/react-native-purchases.d.ts(仮の型定義)を削除
//   3. .env に EXPO_PUBLIC_REVENUECAT_IOS_KEY を設定
//   4. billing.ts の3関数の中身を、このファイルからの再エクスポートに差し替え
//   5. _layout.tsx の起動時処理で initBilling() と syncPlanFromStore() を呼ぶ
// react-native-purchases はネイティブモジュールのため、以降は Expo Go では動かない
// (EAS開発ビルドを使う)。

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

let configured = false;

// 起動時に1回呼ぶ。キー未設定(開発中)なら何もしない
export function initBilling(): void {
  if (configured || !API_KEY) return;
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
}

// RevenueCatの「今このユーザーが持っている権利」から現在のプランを割り出す。
// Entitlement名はRevenueCat側で 'pro' / 'standard' として設定する(手順書Step 2)
function planFromCustomerInfo(
  info: CustomerInfo,
): { plan: Exclude<PlanKey, 'free'>; cycle: BillingCycle } | null {
  for (const plan of ['pro', 'standard'] as const) {
    const entitlement = info.entitlements.active[plan];
    if (entitlement) {
      const cycle: BillingCycle = entitlement.productIdentifier.endsWith('_yearly')
        ? 'yearly'
        : 'monthly';
      return { plan, cycle };
    }
  }
  return null;
}

export async function purchasePlan(
  plan: Exclude<PlanKey, 'free'>,
  cycle: BillingCycle,
): Promise<PurchaseResult> {
  try {
    initBilling();
    const offerings = await Purchases.getOfferings();
    const productId = PRODUCT_IDS[plan][cycle];
    const pkg = offerings.current?.availablePackages.find(
      (p) => p.product.identifier === productId,
    );
    if (!pkg) {
      return { success: false, error: '商品情報を取得できませんでした。時間をおいてお試しください。' };
    }
    await Purchases.purchasePackage(pkg);
    return { success: true };
  } catch (e) {
    // ユーザーが購入シートを閉じただけの場合はエラー扱いにしない文言にする
    if ((e as { userCancelled?: boolean })?.userCancelled) {
      return { success: false, error: '購入をキャンセルしました。' };
    }
    return { success: false, error: (e as Error).message || '購入に失敗しました。' };
  }
}

// 機種変更・再インストール時の「購入を復元」
export async function restorePurchases(): Promise<{
  plan: Exclude<PlanKey, 'free'>;
  cycle: BillingCycle;
} | null> {
  initBilling();
  const info = await Purchases.restorePurchases();
  return planFromCustomerInfo(info);
}

// 起動時にストア側の契約状態をアプリへ同期する(解約・期限切れの反映)
export async function getCurrentPlanFromStore(): Promise<{
  plan: Exclude<PlanKey, 'free'>;
  cycle: BillingCycle;
} | null> {
  initBilling();
  const info = await Purchases.getCustomerInfo();
  return planFromCustomerInfo(info);
}
