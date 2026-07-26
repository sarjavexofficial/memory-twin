# 2026-07-26 セッションログ — AI振り返り復旧＋Geminiモデル固定

## 背景
「AIでの振り返りがちゃんと機能しているか確認して」。前セッションで
`gemini-flash-lite-latest` が新世代(3.1)へ自動追従し、`thinkingBudget:0` を
`400 INVALID_ARGUMENT` で拒否 → 全AI機能停止。応急でフォールバック（400なら思考
指定を外して再試行）を入れて復旧させ、さらに「安定版に固定」する方針をゆずが選択。

## 今日やったこと（sarjavex-api リポジトリ）

### 1. 固定先候補の実測（一時診断エンドポイント）
- render.yaml の `GEMINI_MODEL` を暫定で `gemini-2.5-flash-lite` に固定 → 本番で
  **404「This model is no longer available to new users」**。ListModels には出るのに
  generateContent は新規ユーザーに閉じられていた。
- `/v1/models` 一時診断を追加し、安定版候補を実際に generateContent で疎通確認:
  | モデル | 結果 |
  |---|---|
  | gemini-2.0-flash-lite / -001 | ❌ 404（新規ユーザー不可） |
  | gemini-2.5-flash-lite | ❌ 404（新規ユーザー不可） |
  | gemini-3.1-flash-lite | ✅ OK |
  | gemini-3.5-flash-lite | ✅ OK |
  | gemini-flash-lite-latest | ✅ OK |

### 2. gemini-3.1-flash-lite に固定
- 使えるFlash Liteのうち最も安価・安定のGA版に固定（render.yaml）。
- **callProvider をモデル世代で送り分け**: `gemini-2.x` のみ `thinkingConfig:{thinkingBudget:0}`
  を送り、3.x以降は最初から外して `maxOutputTokens` を広げて1発で叩く。
  これで毎回「400→再試行」の無駄なラウンドトリップを排除。2.x系向けフォールバックは温存。
- 一時診断エンドポイント `/v1/models` は削除。
- commit: 3f3f37f（他 259f472/01a5c53 が診断の追加、9f3aa27 が最初の固定）。

### 3. 本番E2E検証
- `/v1/complete?diag=1` に月次レポート相当のプロンプトを投げて確認 →
  正常なJSON（summary/highlights/nextStep）を返却。身元漏れ（「SarjavexのAIです」）なし。
  **AI振り返りは正常動作。**

## 学び
- **モデル固定は ListModels を信じず generateContent で実測せよ**。一覧に出ても
  新規ユーザーには提供終了で使えないモデルがある（2.x系flash-lite）。
- 新世代(3.x)は `thinkingBudget:0` 非対応。コスト対策の思考オフはモデル世代で送り分ける。

## 残タスク（変更なし）
- ゆず: ストア用スクショ／審査提出／RevenueCat sk_キー削除・確認メールリンク。
