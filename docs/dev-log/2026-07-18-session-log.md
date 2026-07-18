# 開発ログ 2026-07-18（有料App契約 完了・ビルド8・ASC API自動化）

前日(7/17)のIAP方針転換の続き。クリティカルパスだったApple側の契約が完了した日。

---

## 1. 有料App契約（Paid Apps Agreement）✅ 有効

ゆずがApp Store Connect「ビジネス」で完了。つまずきと解決:
- 「法人情報を更新」→ 個人開発者なので**自分の情報でOK**（法人不要）
- 住所・市区町村欄は**日本語NG** → ローマ字半角で解決
  （例: 住所1 `1-2 Yagicho` / 市区町村 `Hachioji-shi` / 都道府県 `Tokyo`）
- 銀行口座: 三菱UFJ銀行 **町田支店（0005-228）**を登録
  ※MUFGには「町田駅前支店(623)」もあるので支店コードで要確認だった
- 税務: W-8BEN（米国のみ必須）。米国市民/米国事業活動=いいえ、
  署名はローマ字タイプ。TIN系は空欄
- → **ステータス「有効」を確認（即日）**

## 2. ビルド8 作成・TestFlight提出 ✅

「修正したアプリを反映させて」の指示で作成。
- `eas build -p ios --profile production --auto-submit` で一括実行
- Build ID: fb7997ce-bb22-4dde-abcf-7d6f6271364d / buildNumber **8** /
  runtime 1.0.0 / commit 942f813 / ステータス finished・自動提出済み
- **注意: RevenueCatキー未搭載** → プラン購入ボタンだけ「この環境では
  App内課金を利用できません」表示になる（設計どおりの安全動作）。
  それ以外の修正（IAP画面・インポート改善・架空名・文言）は全部入り
- **審査に添付するのはこのビルドではない**。RevenueCatキー受領後に
  作り直す**ビルド9**を使う（審査員が課金を試せる必要があるため）。
  ASCの「ビルドを追加」は提出直前まで空のままでよい

## 3. サブスク4商品の登録 → ASC APIで自動化する方針に切替

画面操作での商品登録が難航（メニュー迷子・ユーザ招待画面に迷い込み等）
→ **App Store Connect APIでClaudeが登録する方式に変更**。

- チームキー「Sarjavex Automation」(App Manager) を作成・ダウンロード済み
  - 保存場所: `C:\Sarjavex\apple store\AuthKey_HF6PVDBP9B.p8`（リポジトリには入れない）
  - Key ID: `HF6PVDBP9B`
  - 教訓: .p8のダウンロードは一度きり。DL履歴はブラウザのCtrl+Jで確認
- 自動登録スクリプト: **`scripts/asc-iap.mjs`**（リポジトリ管理）
  - 内容: グループ「Memory Twin Plans」作成 → 日英ローカリゼーション →
    4商品作成（productId/期間/groupLevel: Pro=1, Standard=2）→
    日英の表示名・説明 → 価格（JPN基準: ¥980/¥9,800/¥1,980/¥19,800）→
    全地域で販売
  - 実行: `node scripts/asc-iap.mjs <ISSUER_ID>`（冪等・再実行安全）
- Issuer ID受領 → **実行完了 ✅（4商品すべて登録済み）**
  - グループ 22245465「Memory Twin Plans」（ja/en-USローカリゼーション済み）
  - mt_standard_monthly=6792165667 ¥980 / mt_standard_yearly=6792165904 ¥9,800 /
    mt_pro_monthly=6792166164 ¥1,980 / mt_pro_yearly=6792166200 ¥19,800
  - 全商品: 日英ローカリゼーション・販売175地域・JPN基準価格 設定済み
  - 状態は MISSING_METADATA（審査用スクショ未添付のみ。Sandboxテスト時に添付予定）
  - **APIの学び**: ①サブスク説明文は最大55文字 ②価格POSTは
    **販売地域(subscriptionAvailabilities)を先に設定しないと409**
    （ENTITY_ERROR.RELATIONSHIP.INVALID/pricingの謎エラーの正体）

## 4. RevenueCat設定 ✅（v2 APIで自動化）

ゆずがアカウント作成（sarjavex.official@gmail.com・プロジェクト Memory Twin）
＋使い捨てSecret API Key(claude-setup)を発行 → 残りはClaudeが
**`scripts/revenuecat-setup.mjs`** で自動設定:
- App Storeアプリ接続 app4843655563（bundle com.sarjavex.memorytwin）
- 4商品・Entitlements standard/pro（商品ひも付け済み）
- オファリング default（current・4パッケージ・商品ひも付け済み）
- **iOS Public API Key も API経由で自動取得**: `appl_gTEbvkXgXnjoNehYOGzuOxtlBpS`
  → .env と EAS production 環境変数に登録済み
- **EAS Update配信済み**（update group a9806544・runtime 1.0.0）→ ビルド8で
  課金UIが有効化。バンドルへの焼き込みをgrepで実測確認済み
- ⚠️ 残り: **App内課金キー（In-App Purchase Key）が未設定**
  （subscription_key_configured:false）。ASCの統合→App内課金でキー生成→
  .p8をRevenueCatにアップロード（ファイルアップロードのためUI操作・ゆず）。
  これが無いと購入のレシート検証が通らない
- 後始末: 検証完了後に claude-setup (sk_) キーをRevenueCatから削除する

## 現在の残タスク（クリティカルパス順）

1. 【ゆず】ASCで**App内課金キー**生成→.p8保存→RevenueCatへアップロード（Claudeが確認可能）
2. 【ゆず＋Claude】Sandboxテスト（ビルド8でOK。購入・復元・アップグレード）・審査用スクショ撮影→各商品に添付
3. 【Claude】**ビルド9**（キー焼き込み済みの審査用バイナリ）→ TestFlight
4. 【ゆず＋Claude】審査提出（ビルド9添付・IAP同時提出・Review Notes=app-store-kit §8）
5. 【ゆず】RevenueCatの claude-setup キー削除（全部終わってから）

## 状態スナップショット

- 有料App契約: **有効** / 銀行・税務: 完了
- TestFlight: ビルド7（旧）、**ビルド8（最新・課金UI入り/購入は不可）**
- サブスク商品: **4商品登録済み**（審査用スクショのみ未添付）
- RevenueCat: 未着手 ← いまここ
- Gemini/Supabase/Render/キープウォーム: 正常稼働
