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

## ビルド10を作成・TestFlight提出（審査用の最終ビルドを差し替え）

ビルド9に**焼き込まれているJSは修正前**だった。EAS Updateで配信済みでも取得は起動時なので、
**審査員の初回起動時だけ修正前の画面が見えるリスク**がある。そのため修正を焼き込んだビルド10を作成。

- Build ID `3a0b00db-e379-4a6b-8035-7931c3f80255` / buildNumber **10** / version 1.0.0 /
  runtimeVersion 1.0.0（変更なし＝EAS Update branch main と互換維持）/ commit 8a6ed44
- ネイティブ変更なし。焼き込まれた修正: 理解ノートの理由表示（6言語）・StoreKit直接照会の
  代替経路＋価格エラー診断・身元漏れスクラブ。
- `--auto-submit` でApp Store Connectへアップロード成功（Apple側の処理5〜10分）。
- **その後ビルド11を作成**（インポートの流し読み対応。fflateという新しい依存が入るため
  EAS Updateではなくビルドが必要）。buildNumber 11 / version・runtime 1.0.0 / status finished /
  App Store Connectへアップロード成功。**審査に添付するのはビルド11**（10・9・7は選ばない）。

## インポートが重い・止まる問題を解消（流し読み方式へ全面変更）

ゆずの報告: 「ChatGPTなどからのファイルを読み込むのに時間がかかりすぎたり、重くなって止まったりする」。

### 原因（実測で確認）
1. **サイズ制限が間違った数字を見ていた（バグ）**: `MAX_ZIP_MB = 100` は**圧縮後**の
   サイズ判定。実測で圧縮率は30〜88倍あり、**3MBのZIPが100MBのJSON、20MBなら600MB超**に
   膨らむ。「100MBまでOK」は実質数GBを許可していた。
2. **上限判定の順番が最悪**: 展開後30MBの判定は`conv.async('string')`で**全部展開し終えた後**。
   何分も待たせた末に「大きすぎます」と拒否していた。
3. **base64で丸読み**: `readAsStringAsync(Base64)`はNバイトを1.33N文字の文字列にし、
   JSZipがまたバイト列へ戻す。ピークで2.3倍以上。
4. **JSスレッドを一度も譲らない**: 解析が同期実行。小さいZIPでも「1回のpushで全解凍→
   全走査」が1tickで走り、UIが完全停止＋GCの隙もゼロ（Web実測でピーク234MB）。
5. 全件作ってからソートして1000件に切る／貼り付け欄が入力ごとにJSON.parse。

### 対策（src/lib/import-stream.ts を新設）
段構えで**使用メモリをファイルサイズに依存させない**:
ディスクから64KBずつ読む → fflateで逐次解凍 → 最上位配列の1要素（=1会話）ずつ切り出して
JSON.parse → `TopRecords`で新しい順に上限件数だけ保持。
- `File().open()`の`readBytes`で直接バイト列を読む（base64の巨大文字列を作らない）。
  終端の振る舞いの実装差に備え、サイズ到達・0バイト・例外の三重で停止。
- JSZip→fflate。**同梱の画像・chat.htmlは`start()`を呼ばず解凍自体しない**（実測0秒/0MB）。
- スキャナはバイト列のまま走査（UTF-8のマルチバイトにASCIIは現れないので
  チャンク境界が文字の途中でも壊れない＝TextDecoder不要）。
  **文字列の中身はindexOfでネイティブに飛ばす**（1バイトずつだと数千万回のループ）。
- 16msごとにUIへ制御を返し、そのタイミングだけ進捗を通知（％と発見件数・6言語）。
- 貼り付け欄は閉じ括弧で終わったときだけ400ms遅延で解析。
- ネイティブはサイズ上限を撤廃（Webのみ200MB＝全体をメモリに載せる必要があるため）。

### 実測
| 入力 | 所要 | ピークメモリ |
|---|---|---|
| 展開後535MB（30万会話） | 5.3秒 | 27MB（従来は処理不能） |
| 展開後214MB（12万会話） | 2.5秒 | 41MB |
| 展開後84MB（4万会話） | 0.9秒 | UI最大停止137ms |
| 展開後11.4MB（5千会話・現実的な規模） | **0.3秒** | 35MB |

メモリはサイズに比例しない（53MB→27MB / 535MB→27MB）。
自作テスト**31件すべて成功**（形式判定・要素境界・マルチバイト境界・壊れた要素のスキップ・
上限選別の総当たり一致・バックアップ優先・階層の奥のconversations.json）。
Web実機でバックアップZIPの検出と復元まで回帰なしを確認（人物2人・タスク1件を復元）。
commit e71ec86 / 03d9ab3。

## Googleサインインを有効化（ビルド13）

ゆずの要望「Googleアカウントでログインできるようにして」。実装自体は既に書かれており、
未設定だったのはOAuthクライアントIDだけ……のはずが、方式ごと変更が必要になった。

### 方式変更: expo-auth-session → @react-native-google-signin
SDK 57で `expo-auth-session/providers/google` は**非推奨**。さらにGoogle公式ドキュメントに
**「アプリのなりすましリスクのためカスタムURIスキームは今後サポートされない」**と明記があり、
旧方式は新規クライアントで最初から拒否される可能性があった。そのためGoogle自身のSDKを使う
`@react-native-google-signin/google-signin` へ移行（ゆずの判断で方式変更）。
- 標準のサインインシートが出る。本人情報は戻り値から取れるのでuserinfoを叩く通信が不要に
- サインアウトでGoogle側の記憶も消去、アカウント削除では `revokeAccess` で連携解除
- スコープは email/profile のみ＝Googleの審査不要
- 非推奨の expo-auth-session は撤去

### Google Cloud Console（プロジェクト sarjavex-ai-prod）
iOS用OAuthクライアントを作成。バンドルID `com.sarjavex.memorytwin`／
チームID `2B55HCJC7D`／App Store ID `6791472591`。公開ステータスは「本番」。
- **チームIDはASC APIから取得した**（`/v1/profiles` のprofileContentを復号して
  `TeamIdentifier` を読む。scripts流用。ゆずに探させずに済んだ）
- クライアントID `80213874089-0pc30go0sc645duv3m49e3i2r0b811of.apps.googleusercontent.com`
  は公開値なので app.json / .env / EAS本番環境変数に直接記載

### ビルド12の失敗と修正
Install podsで停止:
`[!] The Swift pod AppCheckCore depends upon GoogleUtilities and RecaptchaInterop,
which do not define modules.`
GoogleSignIn 9.xが連れてくるAppCheckCore(Swift)が、ObjC製の2つの依存を読めないため
静的ライブラリとして統合できない。CocoaPodsが示す2案のうち、
**影響範囲の小さい「対象Podだけ :modular_headers => true」**を
`plugins/with-google-signin-modular-headers.js` で実施（全体適用はRevenueCat等の
ビルド方法まで変わるため回避）。Windowsではprebuildできないので、実際のExpo標準Podfileを
再現して①挿入位置②冪等性③書式変更時に黙って素通りせず停止すること、を検証してからビルドした。
- **学び: プラグインに設定を渡さないとFirebase用の分岐に入り、存在しない
  GoogleService-Info.plistを要求してビルドが落ちる**（事前にプラグイン実装を読んで回避）
- **学び: EASのビルドログは `eas build:view --json` の logFiles から取得できる**
  （Webはログイン必須。curlは `--compressed` が必要）

**ビルド13が成功・ASCアップロード完了**（buildNumber 13・version/runtime 1.0.0）。
**審査に添付するのはビルド13**（12は失敗、11以前はGoogleログインなし）。

## 残タスク（変更なし）
- ゆず: ストア用スクショ／審査提出／RevenueCat sk_キー削除・確認メールリンク。

## 2026-07-31 コンプライアンス総監査（「完璧か」の問いへの回答）

ゆずの指示で法務・書類・審査要件を全数監査。**実ギャップ2件を発見・即日修正**。

### 発見→修正済み
1. **ポリシー§9にRevenueCat未記載**: ポリシー全面更新(7/16)の翌日に課金導入が決まった
   時系列のせいで、「第三者に提供しません」の断言と実態（購入情報がRevenueCatへ渡る）が
   不一致だった。→ §9を「第三者提供・処理の委託」に改題し、Google/Supabase/RevenueCat/
   Appleの4委託先を国名・用途つきで列挙（個情法27条5項1号の委託＋28条の外国委託）。
2. **ポリシー§2の「モデル改善に利用される場合がある」**: 無料キー時代の記述。現在は
   有料プランでGoogleは学習に使わない。実態に合わせ「学習・改善に利用されることは
   ありません」へ修正。日英とも改定し公開・本番URLで反映確認済み（site 3d93df7）。
3. **年齢区分「健康・ウェルネスの話題」false→true**（気分・睡眠記録＋AI振り返りがあるため
   安全側に。ゆず判断）。metadata:pushでASC反映済み（ios-app e366197）。

### 確認して問題なし（証跡つき）
- 有料App契約/W-8BEN/銀行=有効 ／ usesNonExemptEncryption:false設定済み
- サブスク法定表示（自動更新開示・標準EULA・ポリシーリンク）plans.tsx:404
- Appleサインイン同等提供(4.8)・アカウント削除(5.1.1(v))・復元ボタン
- UGC(kodama)=false＝1.2非該当。年齢区分申告とも一致 ／ トラッキングなし=ATT不要
- Googleログインの氏名・メールは端末内のみ＝プライバシー申告「連絡先情報」追加不要
- 特商法=Apple販売のため原則不要 ／ ChatGPT/Claude言及=指名的使用で低リスク

### 保留（次のASCブラウザ作業と同時にやる）
- **Appプライバシー申告に「健康とフィットネス」追加**（非リンク・アプリの機能。
  ゆず決定済み・Chrome拡張切断中のため未実施）。手順: ASC→App＞Appプライバシー→
  データタイプ編集→「健康とフィットネス」→アプリの機能・紐づけなし・トラッキングなし→公開
- 任意: Google OAuth同意画面にポリシーURL追加／OSSライセンス画面はv1.0.1

### 許容済みリスク（対応しない判断）
- GDPR27条のEU代理人未設置（収益前の個人開発の業界慣行・執行リスク極小）
