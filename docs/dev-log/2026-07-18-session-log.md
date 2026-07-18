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

## 5. App内課金キー（In-App Purchase Key）✅

Chrome拡張（Claude in Chrome）でClaudeがブラウザを代行操作して完了:
- ASC「統合→アプリ内購入」でキー生成（名前 RevenueCat・**Key ID ZLVZ3Q863W**）
  → DL済み `C:\Sarjavex\apple store\SubscriptionKey_ZLVZ3Q863W.p8`
- **ハマり①**: RevenueCatのアップロード欄は `AuthKey_～.p8` という名前しか
  受け付けない → `AuthKey_ZLVZ3Q863W.p8` にリネームで解決
- **ハマり②**: UIの保存時検証が「Credentials need attention」で通らない
  （作りたてキーの伝播遅延と思われる）→ **v2 APIの隠しフィールドで直接設定**:
  `POST /v2/projects/{pid}/apps/{app_id}` の
  `app_store.subscription_private_key / subscription_key_id / subscription_key_issuer`
  → 200で **subscription_key_configured: true** を確認
- ログイン・ファイル選択のみゆず操作（パスワードはClaude不関与）

## 6. 購入エラー→原因特定→4商品READY_TO_SUBMITへ ✅

ゆずの初回購入テストがエラー。診断:
- RevenueCatに端末のアクセス記録あり＝**配信は届きSDKは動いている**
- 真因: **商品がMISSING_METADATA**のままだった。不足は2つ:
  1. 審査用スクリーンショット → 仮画像を生成し**API添付**（scripts/asc-review-screenshot.mjs。
     審査提出前に本物のプラン画面スクショへ差し替えること！）
  2. **価格が日本(JPN)にしか無かった**。APIで基準価格を入れても他地域は
     自動生成されない → equalizations（均等換算）から**174地域分をAPI一括登録**
     （scripts/asc-prices-all.mjs。散発的な500は再実行で解消）
- 結果: **4商品すべて READY_TO_SUBMIT**
- 学び: UIと違いAPIの価格設定は1地域ずつ。「基準価格→自動で全世界」はUIだけの挙動

## 7. 改善バックログ2〜9を一括実装（「改善点はすべて改善して」）✅

commit 4e8264c・EAS Update配信済み（update group 3a2dbb97）。内容は
docs/improvement-backlog.md の「対応済み(2026-07-18)」参照。要点:
- 全削除の2段階化（「削除」タイプ必須・6言語のキーワード）
- バックアップ最終日時の常時表示＋復元前スナップショット（lib/backup-meta.ts）
- AI回答の根拠「参照した記録」表示（振り返り80件/過去比較60件の送信仕様と一致）
- 月次レポートの匿名化共有（表示ごと別名化＝プレビュー兼用）
- 人物ごとの疎遠お知らせ制御（Person.muteStale・「最後の記録」を今日に）
- ライトモードのコントラストAA達成・無効ボタンの非色表現・全タブ下端余白120pt
- 新規キー16個×6言語（自動照合で全495キー一致を確認）・tscクリーン
- **①Share Extensionのみv1.0.1へ延期**（審査直前のネイティブ追加はリスク大）

検証メモ: ZIP解凍はNode上でChatGPT形式の実証済み。6言語はキー照合で穴ゼロ確認。
実機での再確認ポイント: 全削除フロー・バックアップ表示・匿名化共有の見た目。

## 8. Web実機巡回（「操作して改善点を見つけて」）✅

Expo Webをブラウザペインで起動し、全画面を実操作で巡回
（オンボ→4タブ→プラン→インポート→月次→人物→振り返り/過去比較→英語切替）。
commit fe07821・EAS Update配信済み。

**発見と修正（3件）**:
1. 【バグ・重要】サンプル人物への編集（最後の記録・ミュート等）が**次回起動時に
   巻き戻る**。markLegacySamplePeopleの「未編集」判定が名前とメモしか見ておらず、
   編集済み人物を再サンプル化→テンプレートで上書きしていた
   → 判定条件を全編集項目（lastContact/muteStale/relation/birthday/likes/tags）に拡大。
   **リロード後も変更が残ることをWebで実証済み**
2. サンプル日記にプロジェクト「写真教室」（6言語）を追加
   → タイムラインのプロジェクト絞り込みが新規ユーザーにも見えるように
   （ゆずの「プロジェクトを検索できる場所は？」の根本原因への対処）
3. 匿名化共有の説明文が「Aさん」だが実際は役割名（例: 職場の先輩）に変わる
   → 説明を実挙動に一致（6言語）

**動作確認できたもの**: オンボ同意フロー・横断検索＋AIに聞くボタン・プラン表示・
匿名化共有の実効果（綿雲ぽんた→サークルの後輩）・⑨の両ボタン・
英語モード翻訳漏れゼロ（8画面自動スキャン）・Free向けアップグレード導線。

**v1.0.1へ持ち越し（未対応の気づき）**:
- アクセシビリティ: ボタン類にaccessibilityRole/labelが無く、支援技術から「generic」に
  見える。主要ボタンへの付与を推奨
- 「最後の記録を今日にする」後も場所（例: オフィス）が古いまま残る（軽微）

## 現在の残タスク（クリティカルパス順）

1. 【ゆず】RevenueCatの**メール確認リンク**をクリック（ダッシュボードに青帯が出ている）
2. 【ゆず＋Claude】**Sandboxテスト**: ビルド8＋配信済みUpdateで購入・復元を実測
   （TestFlight経由なので実請求なし）・審査用スクショ撮影→4商品に添付
3. 【Claude】**ビルド9**（キー焼き込み済みの審査用バイナリ）→ TestFlight
4. 【ゆず＋Claude】審査提出（ビルド9添付・IAP同時提出・Review Notes=app-store-kit §8）
5. 【ゆず】RevenueCatの claude-setup (sk_) キー削除（全部終わってから）

## 状態スナップショット

- 有料App契約: **有効** / 銀行・税務: 完了
- TestFlight: ビルド7（旧）、**ビルド8（最新・課金UI入り/購入は不可）**
- サブスク商品: **4商品登録済み**（審査用スクショのみ未添付）
- RevenueCat: 未着手 ← いまここ
- Gemini/Supabase/Render/キープウォーム: 正常稼働

## 9. App Storeレビュー依頼（ゆず指示「1をやって」）✅

- expo-store-review導入（commit 90f10e1・EAS Update配信済み）
- 自分の記録が5/20/50件に達した保存直後にAppleの評価ポップアップ（各節目1回。
  lib/store-review.ts・部品未搭載のビルド8/Webでは何もしない安全設計）
- 設定「このアプリについて」に「レビューで応援する」（App Storeレビュー画面へのリンク）
- **無料トライアル（Appleイントロオファー）はゆず判断で見送り**（AI利用コスト増を懸念）
- ネイティブ部品が増えたため**ビルド9に同梱される**（審査用ビルドの作成は従来計画どおり）
