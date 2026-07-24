import Purchases, { CustomerInfo, PurchasesStoreProduct } from 'react-native-purchases';

import { PRODUCT_IDS } from '@/lib/billing';
import type { PurchaseResult } from '@/lib/billing';
import type { BillingCycle, PlanKey } from '@/store/settings-context';

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

// オファリング（RevenueCatの商品リスト）を経由せず、StoreKitへ商品IDを直接問い合わせる代替経路。
// オファリング解決に問題がある場合の自動回復と、Apple側カタログ未反映の切り分け診断を兼ねる
async function fetchProductsDirect(): Promise<Map<string, PurchasesStoreProduct>> {
  const ids = (['standard', 'pro'] as const).flatMap((p) =>
    (['monthly', 'yearly'] as const).map((c) => PRODUCT_IDS[p][c]),
  );
  const products = await Purchases.getProducts(ids);
  return new Map(products.map((p) => [p.identifier, p]));
}

export async function purchasePlan(
  plan: Exclude<PlanKey, 'free'>,
  cycle: BillingCycle,
): Promise<PurchaseResult> {
  try {
    initBilling();
    const productId = PRODUCT_IDS[plan][cycle];
    const offerings = await Purchases.getOfferings().catch(() => null);
    const pkg = offerings?.current?.availablePackages.find(
      (p) => p.product.identifier === productId,
    );
    if (pkg) {
      await Purchases.purchasePackage(pkg);
      return { success: true };
    }
    // オファリングに無い場合はStoreKit直接照会で購入する（結果はどちらも同じApple購入シート）
    const product = (await fetchProductsDirect()).get(productId);
    if (!product) {
      return { success: false, error: '商品情報を取得できませんでした。時間をおいてお試しください。' };
    }
    await Purchases.purchaseStoreProduct(product);
    return { success: true };
  } catch (e) {
    // ユーザーが購入シートを閉じただけの場合はエラー扱いにしない文言にする
    if ((e as { userCancelled?: boolean })?.userCancelled) {
      return { success: false, error: '購入をキャンセルしました。', cancelled: true };
    }
    return { success: false, error: (e as Error).message || '購入に失敗しました。' };
  }
}

// 直近の価格取得失敗の理由（診断コード）。プラン画面のエラー欄に小さく添えて、
// 実機で「どの段階で失敗しているか」を特定するために使う
let lastPriceError: string | null = null;
export function getLastPriceError(): string | null {
  return lastPriceError;
}

// App Storeの実売価格を取得する。4商品すべて揃わない場合はnull（=まだ購入できない状態）。
// 表示価格と請求額の不一致を防ぐため、プラン画面はこの実価格を優先して表示する
export async function getStorePrices(): Promise<import('@/lib/billing').StorePrices | null> {
  initBilling();
  if (!configured) {
    lastPriceError = 'NO_KEY: このビルドに課金キーが入っていない（ビルド8以前）';
    return null;
  }
  // 1段目: オファリング経由で商品を集める（失敗しても2段目があるので診断メモだけ残す）
  const byId = new Map<string, PurchasesStoreProduct>();
  let offeringNote: string;
  try {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    for (const p of packages) byId.set(p.product.identifier, p.product);
    offeringNote = offerings.current
      ? `オファリング=${packages.length}件`
      : `NO_CURRENT_OFFERING: all=[${Object.keys(offerings.all ?? {}).join(',')}]`;
  } catch (e) {
    // RevenueCatのエラーは code / message に加え underlyingErrorMessage にStoreKit側の詳細が入ることがある
    const err = e as { code?: number | string; message?: string; underlyingErrorMessage?: string };
    const underlying = err.underlyingErrorMessage
      ? ` / ${String(err.underlyingErrorMessage).slice(0, 100)}`
      : '';
    offeringNote = `オファリングERR code=${err.code ?? '?'}: ${(err.message ?? String(e)).slice(0, 120)}${underlying}`;
  }

  // 2段目: 足りない分はStoreKitへの直接照会で補う（自動回復＋切り分け診断）
  let directNote = '';
  if (byId.size < 4) {
    try {
      const direct = await fetchProductsDirect();
      directNote = ` / 直接取得=${direct.size}/4`;
      for (const [id, p] of direct) if (!byId.has(id)) byId.set(id, p);
    } catch (e) {
      directNote = ` / 直接取得ERR: ${((e as Error).message ?? String(e)).slice(0, 80)}`;
    }
  }

  const result = {} as NonNullable<Awaited<ReturnType<typeof getStorePrices>>>;
  const missing: string[] = [];
  for (const plan of ['standard', 'pro'] as const) {
    for (const cycle of ['monthly', 'yearly'] as const) {
      const product = byId.get(PRODUCT_IDS[plan][cycle]);
      if (!product) {
        missing.push(PRODUCT_IDS[plan][cycle]);
        continue;
      }
      (result[plan] ??= {} as (typeof result)[typeof plan])[cycle] = {
        priceString: product.priceString,
        price: product.price,
        currencyCode: product.currencyCode,
      };
    }
  }
  if (missing.length > 0) {
    lastPriceError = `${offeringNote}${directNote} 欠け=[${missing.join(', ')}]`;
    return null;
  }
  lastPriceError = null;
  return result;
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
