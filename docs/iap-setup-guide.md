# App内課金（サブスクリプション）セットアップ手順書

Memory Twin に本物の課金を組み込むときの全手順。
アプリ側の窓口は `src/lib/billing.ts` に集約済みで、このファイルの中身を差し替えるだけで課金が有効になる。

## 全体像

```
ユーザー ── Apple（課金・日割り・返金を全部やる）
              │ レシート
              ▼
        RevenueCat（レシート検証・現在のプラン判定を代行）
              │ 「今この人はProの年払い」
              ▼
        アプリ（billing.ts が受け取り → currentPlan に反映）
```

差額計算・日割り返金・請求はすべてApple側の仕事。アプリは「今どのプランか」を受け取るだけ。

## Step 0. 前提（ゆず本人にしかできないこと）

1. **Apple Developer Program 登録** — https://developer.apple.com/programs/
   - 年額約15,000円（$99/年）。Apple IDで本人が契約する
2. **App Store 小規模事業者プログラム申請**（登録後すぐ）
   - 手数料が30%→**15%**になる（年商100万ドル以下なら対象）。App Store Connect から申請
3. **RevenueCat アカウント作成** — https://www.revenuecat.com/
   - 無料枠: 月の追跡売上 $2,500 まで無料。個人開発の定番

## Step 1. App Store Connect でサブスクリプション商品を登録

App Store Connect → 対象アプリ → 「サブスクリプション」

1. **サブスクリプショングループを1つ作成**（名前例: `Memory Twin Plans`）
2. グループ内に**4商品**を登録。商品IDは `billing.ts` の `PRODUCT_IDS` と一致させる：

| 商品ID | プラン | 価格 |
|---|---|---|
| `mt_standard_monthly` | Standard 月額 | ¥980 |
| `mt_standard_yearly` | Standard 年額 | ¥9,800 |
| `mt_pro_monthly` | Pro 月額 | ¥1,980 |
| `mt_pro_yearly` | Pro 年額 | ¥19,800 |

3. **ランク（レベル）を設定**: Pro をレベル1（上）、Standard をレベル2（下）に並べる
   - これで「Standard→Pro」は即時アップグレード＋日割り返金、「Pro→Standard」は期間満了後、をAppleが自動処理する
4. 各商品にローカライズ表示名・審査用メモを入力

## Step 2. RevenueCat の設定

1. RevenueCat でプロジェクト作成 → iOS アプリを追加（Bundle ID を合わせる）
2. App Store Connect の共有シークレット（App用共有秘密鍵）を RevenueCat に登録
3. 4商品を Products として取り込み、Entitlements を2つ作る:
   - `standard` ← mt_standard_monthly / mt_standard_yearly
   - `pro` ← mt_pro_monthly / mt_pro_yearly
4. **Public API Key (iOS)** を取得 → `ios-app/.env` に追加:
   ```
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=（キー）
   ```
   ※キーはチャットに貼らず、.env に直接貼ること

## Step 3. アプリ側の実装

⚠️ **npm install の前に必ず dev サーバー（トンネル含む）を停止すること**

```
npx expo install react-native-purchases
```

- react-native-purchases はネイティブモジュールのため **Expo Go では動かない**
- **EAS 開発ビルド（dev client）へ移行が必要**:
  ```
  npm install -g eas-cli
  eas build --profile development --platform ios
  ```
- **実装コードは作成済み**（2026-07-12）: `src/lib/billing-revenuecat.ts`
  - purchasePlan / restorePurchases / getCurrentPlanFromStore / initBilling を実装済み
  - 残り作業はつなぎ込みだけ:
    1. `src/types/react-native-purchases.d.ts`（仮の型定義）を**削除**
    2. `billing.ts` の purchasePlan / restorePurchases の中身を billing-revenuecat.ts からの再エクスポートに差し替え
    3. `_layout.tsx` 起動時に `initBilling()` + `getCurrentPlanFromStore()` → `setCurrentPlan()` で同期
- 呼び出し側（plans.tsx）は変更不要（すでに billing.ts 経由）

## Step 4. 審査前チェックリスト

- [x] 「購入を復元」ボタン（審査必須）— 2026-07-12実装済み。プラン画面の「お支払い・解約」カード内（6言語対応）
- [ ] プラン画面の「（デモ）」表記をすべて削除
- [ ] plansNotice（決済機能は準備中…）の文言を削除
- [x] 利用規約(EULA)とプライバシーポリシーのリンクをアプリ内に掲載 — 2026-07-13実装済み(設定タブ「このアプリについて」内・6言語。EULAはApple標準を使用)。App Store Connect側のURL欄への入力は提出時に行う
- [ ] 解約方法の案内（実装済み: 設定 > Apple ID > サブスクリプション）

## Step 5. テスト

1. App Store Connect → ユーザーとアクセス → **Sandboxテスター**を作成（本物のお金は動かない）
2. 開発ビルドを実機に入れ、Sandboxアカウントで購入・アップグレード・復元を確認
3. アップグレード時に即時切り替わること、ダウングレードが期間満了後になることを確認
