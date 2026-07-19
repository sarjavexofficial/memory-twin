# 開発ログ 2026-07-19（価格取得エラーの診断・原因確定）

前日までに設定側は全項目検証済み。今日は実機で失敗箇所を特定した。

## 1. 診断コード表示を追加（EAS Update配信済み）

プラン画面の価格取得エラーに、失敗段階を示す診断コードを小さく併記するようにした
（commit a373344・EAS Update「価格エラーの診断コード表示」）。

- `NO_KEY` = 課金キー未搭載ビルド（ビルド8以前）
- `NO_CURRENT_OFFERING` = RevenueCatのオファリング空
- `MISSING n/4` = 一部商品だけAppleから取得不可
- `ERR code=NN` = RevenueCat例外（underlyingErrorMessageがあれば併記）

## 2. 実機の結果: `ERR code=23`（ConfigurationError）で確定

ゆずのiPhone（ビルド9・1.0.0 (9)確認済み）で:
`ERR code=23: There is an issue with your configuration. Check the underlying error for more details.`

**意味**: RevenueCatはオファリング定義を正常に受信できているが、その後の
**StoreKit（Apple）への商品照会が0件**を返している。つまり残る原因は
「Appleの商品カタログが端末にまだ配られていない」のみ。

### 検証済み（すべてシロ）の項目
- ASC: 4商品 READY_TO_SUBMIT / 販売地域175 / JPN価格¥980（7/19朝に再確認）
- RevenueCat: 公開キーでの /v1/subscribers/offerings 応答が完璧（default + 4パッケージ）
- ビルド9であること（TestFlightで 1.0.0 (9) 表示を確認）
- 端末側: iPhone再起動・メディアと購入サインイン・Wi-Fi/モバイル切替 → 変化なし

### 結論と方針
- 商品作成完了: 7/18 11時ごろ / 有料App契約有効化: 7/18午前
- Appleの公称「最大24時間」は目安。**初のIAP商品＋契約有効化直後は48時間かかる報告が多数**
- → **7/20（月）朝まで待つ**。数時間おきに「再読み込み」のみ。
  7/20朝も code=23 なら下記の問い合わせを送る

## 3. Apple問い合わせ文（7/20朝にcode=23のままなら使う）

送り先: https://developer.apple.com/contact/ → App Store Connect → In-App Purchases

```text
Subject: Subscription products not fetchable via StoreKit 48h after creation

Hello,

Our newly created auto-renewable subscription products cannot be fetched
via StoreKit on TestFlight builds, more than 48 hours after creation.

- App: Memory Twin (Apple ID: 6791472591, bundle ID: com.sarjavex.memorytwin)
- Subscription group: 22245465 ("Memory Twin Plans")
- Product IDs: mt_standard_monthly, mt_standard_yearly, mt_pro_monthly, mt_pro_yearly
- All four products show "Ready to Submit" in App Store Connect,
  with localizations, review screenshots, prices for 175 territories
  (JPY 980 for mt_standard_monthly in Japan), and availability configured.
- The Paid Applications Agreement was accepted and shows "Active"
  (accepted July 18, 2026, JST). Banking and tax information are complete.
- Products were created July 18, 2026, around 11:00 JST via the
  App Store Connect API.
- On a TestFlight build (version 1.0.0, build 9), an SKProductsRequest /
  StoreKit 2 products query for these IDs returns zero products
  (observed via the RevenueCat SDK, which reports its ConfigurationError
  code 23 / "None of the products could be fetched").
- Verified on device: App Store signed in (Japan storefront), device
  restarted, both Wi-Fi and cellular tested.

Could you confirm whether these products have finished propagating to the
App Store catalog, and investigate why they are not yet returned by
StoreKit? Please let us know if any additional configuration is required.

Thank you,
Kyosuke Harada (Sarjavex)
```

## 4. 学び

- RevenueCat `ERR code=23` は名前こそConfigurationErrorだが、設定検証が済んでいる場合の実態は
  「StoreKitが商品0件を返した」= Apple反映待ちの表れ
- 診断コードをエラーUIに小さく出す仕組みは原因切り分けに非常に有効（今後も残す価値あり。
  文言は技術コードのみで、ユーザー向けメッセージは従来どおりなので審査上も問題ない）
