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
- **残: ゆずが Issuer ID を貼る → スクリプト実行**（次セッション最初のタスク）

## 現在の残タスク（クリティカルパス順）

1. 【ゆず】**Issuer ID** をチャットに貼る（appstoreconnect.apple.com/access/integrations/api の上部）
2. 【Claude】`node scripts/asc-iap.mjs <ISSUER_ID>` で4商品登録
3. 【ゆず＋Claude】RevenueCat設定（アカウント作成→ASC接続→Entitlements standard/pro→iOS Public API Key取得）
4. 【Claude】キーを .env と EAS production env に登録 → **ビルド9** → TestFlight
5. 【ゆず＋Claude】Sandboxテスト（購入・復元・アップグレード）・審査用スクショ撮影
6. 【ゆず＋Claude】審査提出（ビルド9添付・IAP同時提出・Review Notes=app-store-kit §8）

## 状態スナップショット

- 有料App契約: **有効** / 銀行・税務: 完了
- TestFlight: ビルド7（旧）、**ビルド8（最新・課金UI入り/購入は不可）**
- サブスク商品: 未登録（スクリプト準備済み・Issuer ID待ち）
- RevenueCat: 未着手
- Gemini/Supabase/Render/キープウォーム: 正常稼働
