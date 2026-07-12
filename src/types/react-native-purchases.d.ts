// react-native-purchases の仮の型定義(billing-revenuecat.ts の型チェックを通すためだけのもの)。
// ⚠️ `npx expo install react-native-purchases` で本物のSDKを入れたら、このファイルは必ず削除すること
// (本物の型定義と二重になり衝突するため)。
declare module 'react-native-purchases' {
  export type CustomerInfo = {
    entitlements: {
      active: Record<string, { productIdentifier: string } | undefined>;
    };
  };
  export type PurchasesPackage = {
    identifier: string;
    product: { identifier: string };
  };
  export type PurchasesOffering = { availablePackages: PurchasesPackage[] };
  export type PurchasesOfferings = { current: PurchasesOffering | null };

  const Purchases: {
    configure(options: { apiKey: string }): void;
    getOfferings(): Promise<PurchasesOfferings>;
    purchasePackage(pkg: PurchasesPackage): Promise<{ customerInfo: CustomerInfo }>;
    restorePurchases(): Promise<CustomerInfo>;
    getCustomerInfo(): Promise<CustomerInfo>;
  };
  export default Purchases;
}
