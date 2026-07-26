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

## 「AI成長が機能していない」の正体（ios-app リポジトリ）

ゆずの報告: 理解ノート（AI成長）の**ボタンが灰色で押せない**。

### 原因
`settings.tsx` の `disabled={learnableCount === 0}` の一点。
`countLearnableRecords` は **お試し（サンプル）データを意図的に除外**するため、
サンプルしか無い状態では 0 件 → ボタンが無効。**その理由がどこにも表示されず**、
一方でデータ管理欄には「記録 15 件」と出るため、機能が故障しているように見えていた。
（サンプル除外自体は正しい仕様。架空の人物・日記でAIの人物理解が汚染されるため。）

### 修正
- 0 件のときは理由と次の一手を必ず表示。6言語に `aiProfileNeedOwnRecords` を追加
  （「お試しデータは学習に使えません…日記を1件書く、または人物にメモを1件追加すると学習できます」）。
- commit 962808c → EAS Update(main) 配信済み（update group 78480313）。

### Web実機で検証（サンプルのみの新規状態＝ゆずと同条件）
1. ヒント表示・ボタン無効を確認（記録15件と表示されるがlearnable 0件）
2. 日記を1件追加 → 記録16件・ヒント消滅・ボタン有効化
3. 「記録から学習する」実行 → **理解ノートが正常生成**（5見出しの日本語要約）・
   AI利用回数がカウント。**アプリ側のAI経路も正常**と実証。

## 残タスク（変更なし）
- ゆず: ストア用スクショ／審査提出／RevenueCat sk_キー削除・確認メールリンク。
