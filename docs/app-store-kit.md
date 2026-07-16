# App Store 提出セット(2026-07-12作成 / 2026-07-16 無料先行リリース版に改訂)

Apple Developer Program登録後、App Store Connectにコピペしていくための素材集。

> **初回リリース方針(2026-07-16決定): App内課金なしの「無料アプリ」として提出する。**
> RevenueCat未接続のデモ課金UIのまま出すと審査でリジェクトされるため、`feature-flags.ts` の
> `paidPlans = false` で課金画面・アップグレード導線・有料専用機能(週次レビュー/過去比較/自動学習)を
> すべて非表示にした。無料枠の上限(AI月20回・履歴インポート3回・月次レポート通算1回)はそのまま。
> 課金は後続アップデートで `paidPlans = true` にして解禁する(iap-setup-guide.md 参照)。
> **有料プランを解禁するときは、この§1〜§9の価格・課金まわりも元に戻すこと。**

機能や価格を変えたら、このファイルも直すこと。

---

## 1. 基本情報

| 項目 | 内容 |
|---|---|
| アプリ名(30字以内) | Memory Twin：AI時代の記憶ノート |
| サブタイトル(30字以内) | AIを変えても、記憶は残る |
| カテゴリ(プライマリ) | ライフスタイル |
| カテゴリ(セカンダリ) | 仕事効率化 |
| 価格 | 無料(App内課金なし) |
| App内課金 | **なし**(初回リリース。paidPlans=false。課金は後続アップデートで解禁) |
| 年齢制限 | 4+(質問票は全項目「なし」でOK。UGCなし=こだまは本リリースで無効) |
| プライバシーポリシーURL | https://sarjavexofficial.github.io/privacy.html |
| サポートURL | https://sarjavexofficial.github.io |
| サポート連絡先 | sarjavex.official@gmail.com |
| Bundle ID | com.sarjavex.memorytwin(app.json設定済み) |
| App Store Connect App ID | 6791472591(2026-07-16 eas submit時に自動作成) |
| TestFlight | https://appstoreconnect.apple.com/apps/6791472591/testflight/ios |

---

## 2. 説明文(日本語)

```
ChatGPTやClaudeと話した大事なこと、覚えていますか？

Memory Twinは、AIとの会話・日々の決定・人との約束を「長期記憶」に変える、あなた専用の記憶ノートです。AIアプリを乗り換えても、あなたの記憶はここに残り続けます。

■ 他のAIアプリの履歴が、資産になる
ChatGPTやClaudeの公式エクスポート(conversations.json)を読み込むと、過去の会話が日付どおりにタイムラインへ。忘れていた「決めたこと」「約束」「やり残し」をAIが自動で発見します。

■ 聞けば、根拠つきで思い出せる
「あの時なんて決めたっけ？」と自然な言葉で質問すると、AIが根拠となる記録を添えて答えます。質問に関係する記録だけを選んで送るので、速くて正確です。

■ 必要な日に、向こうから届く
Today Recallが「期限が近い約束」「しばらく連絡していない人」など、今日思い出すべきことを届けます。検索する前に、思い出せる。

■ 記録するほど、あなた専用のAIに
記録から「AIの理解ノート」が育ち、回答があなたの文脈に寄り添っていきます。月次レポートで1か月の自分をAIがまとめてくれます。

■ プライバシーが設計の中心
・記録は主に端末内に保存。外部へ出るのはAI利用時と、任意の暗号化バックアップのときだけ
・AIへは操作に必要な抜粋だけを送信。人物の実名は別名化して送り、広告目的の利用・販売は一切なし
・クラウドバックアップは端末上で暗号化してから保管(運営にも読めません)
・アカウント削除・全データ削除にアプリ内から対応
・Face IDによるアプリロック対応。AI学習へのデータ提供は初期設定OFF

すべての機能を無料でご利用いただけます。会員登録も、クレジットカードの入力も不要です。

プライバシーポリシー: https://sarjavexofficial.github.io/privacy.html
```

## 3. プロモーションテキスト(170字以内・審査なしで随時変更可)

```
AIとの会話、日々の決定、人との約束を「長期記憶」に。聞けば根拠つきで思い出せて、必要な日には向こうから届く。記録は端末内・バックアップは暗号化。AIを変えても、あなたの記憶は残る。
```

## 4. キーワード(日本語・100字以内・カンマ区切り)

```
日記,記憶,メモ,AI,人生記録,振り返り,人間関係,約束,チャット履歴,ノート,バックアップ,プライバシー,習慣
```

---

## 5. English(グローバル配信用)

**Name**: Memory Twin: AI Memory Journal
**Subtitle**: Switch AIs. Keep your memory.

**Description**:
```
Do you remember the important things you discussed with ChatGPT or Claude?

Memory Twin turns your AI conversations, daily decisions, and promises into long-term memory. Switch AI apps as often as you like — your memory stays here.

■ Your AI history becomes an asset
Import the official conversations.json export from ChatGPT or Claude. Past conversations join your timeline with their original dates, and AI uncovers forgotten decisions, promises, and unfinished tasks.

■ Ask, and recall with sources
Ask in natural language — "What did we decide back then?" — and the AI answers with the records it drew from. Only the records related to your question are sent, keeping answers fast and accurate.

■ The right memory finds you
Today Recall delivers just what you need today: promises coming due, people you haven't talked to in a while. Remember before you even search.

■ An AI that grows with your records
Your records build an "understanding note" that makes answers increasingly personal. Monthly reports let AI sum up your month.

■ Privacy at the core
- Your records stay mainly on your device; they leave it only for AI features and optional encrypted backups
- Only the excerpts needed for an action are sent to AI, with names replaced by aliases. Never used or sold for ads
- Cloud backup is encrypted on your device first (we cannot read it)
- In-app account deletion and full data deletion
- App Lock with Face ID. Data contribution for AI improvement is OFF by default

Everything is free to use. No account and no credit card required.

Privacy Policy: https://sarjavexofficial.github.io/privacy.html
```

**Keywords**: `diary,journal,memory,ai,notes,chatgpt,claude,export,recall,privacy,backup,life log`

---

## 6. App Privacyラベル(申告一覧) — この通りに答える

質問票「データの収集」で **「はい、収集します」** を選び、以下だけチェック:

| データの種類 | 具体的内容 | 用途 | ユーザーとの紐付け | トラッキング |
|---|---|---|---|---|
| 識別子 > デバイスID | アプリが生成する匿名ID(利用回数制限用) | App機能 | いいえ | いいえ |
| 使用状況データ > 製品の操作 | AI利用回数・共有回数(悪用防止のためのカウントのみ) | App機能 | いいえ | いいえ |
| ユーザーコンテンツ > その他のユーザーコンテンツ | 暗号化済みバックアップ（本人のみ復号可） | App機能 | いいえ | いいえ |

**収集しない**と答えるもの: 位置情報 / 連絡先 / 健康とフィットネス / 財務情報 / 閲覧・検索履歴 / 診断(クラッシュレポート未導入のため)

**トラッキング**: 「いいえ」(ATTダイアログ不要。広告SDKなし)

根拠メモ:
- 日記・人物メモは端末内保存。AI処理時の抜粋送信は「リクエスト処理のためだけに使い、保存しない」(サーバーは回数のみ記録)ためAppleの定義では「収集」に該当しないが、外部AI基盤(Gemini)の扱いはポリシー§2で開示済み
- Apple/Googleサインインの情報は端末内にのみ保存。サーバーへはアカウントIDのハッシュ(復元不能)だけがバックアップ保管先の識別に使われる

---

## 7. スクリーンショット計画(5枚・6.7インチ 1290×2796)

TestFlightビルドを実機に入れてから撮るのが最も綺麗(Expo Goの開発表示が写り込まない)。
撮影→無料のデバイスフレームツール(Figma/AppMockUp等)で見出し文字を載せる。

| # | 画面 | 見出し案 |
|---|---|---|
| 1 | 今日タブ(Today Recall+記録欄) | 今日必要な記憶だけ、向こうから届く |
| 2 | AI検索(根拠つき回答) | 聞けば、根拠つきで思い出せる |
| 3 | AI履歴インポート(抽出結果) | ChatGPT・Claudeの履歴が資産になる |
| 4 | 月次レポート | 1か月のあなたを、AIがまとめる |
| 5 | 設定(プライバシーカード+アプリロック) | 端末内保存・暗号化・Face ID |

---

## 8. 審査メモ(Review Notesに貼る英文)と注意点

```
Memory Twin is a private journal with AI recall. Notes for review:

1. Sign-in (Apple/Google) is OPTIONAL and only used to separate encrypted
   cloud-backup storage per user. All core features work without an account.
2. The first AI request after a period of inactivity may take up to 60
   seconds while our server wakes (a banner explains this in-app).
   Subsequent requests are fast.
3. Account deletion: Settings > Account > "Delete account" signs out,
   deletes all on-device data, and (with the user's passphrase) deletes the
   encrypted cloud backup. Full local data deletion is also available under
   Settings > Data. (Guideline 5.1.1(v).)
4. Cloud backup is end-to-end encrypted on device; we cannot read the data.
5. AI requests go through our relay to Google Gemini. Personal names are
   replaced with aliases before any AI request; email, credentials, and
   passwords are never sent. Provider-side data handling is disclosed in
   our privacy policy (Section 2).
6. "Echoes" (anonymous community sharing) is DISABLED in this release via a
   feature flag, so there is no user-generated content in the app.
7. This release is a FREE app with NO in-app purchases. Subscription code
   exists in the codebase but is fully disabled behind a feature flag
   (paidPlans=false): no purchase UI, pricing, or upgrade prompt is reachable.
8. Signing in (optional) grants a one-time 7-day "Pro" trial that only raises
   in-app usage limits. No payment, subscription, or purchase is involved;
   after 7 days the app simply returns to the free limits.
```

**審査リスクと事前対策**:
- **UGC(ガイドライン1.2)**: 本リリースではこだま(共有掲示板)を無効化しているため非該当。将来オンにする際は、通報・自動非表示・規約同意・本人削除(実装済み)に加え「この投稿を非表示」ボタンを用意する
- **コールドスタート**: 審査員の初回AI操作が遅いと「壊れている」と判定されかねない。**審査提出中はUptimeRobot等で5分おきにRender /healthをpingして常時ウォームに保つ**(無料)
- **課金(対応済み)**: 「①課金UIを隠して無料アプリとして出す」を選択済み。`paidPlans=false` で
  デモ購入ボタン・価格表示・アップグレード導線・有料専用機能をすべて非表示にし、`/plans` は開いても
  ホームへリダイレクトするようにした(2026-07-16, web実機で確認済み)。App Store Connect側でも
  「App内課金」を作成せず、価格は「無料」で登録する。課金解禁は後続アップデートで(iap-setup-guide.md)
- **輸出コンプライアンス(暗号化)**: 標準アルゴリズム(HTTPS/AES)のみ使用=適用除外。app.jsonに `usesNonExemptEncryption: false` 設定済み(毎ビルドの質問をスキップできる)

---

## 9. 提出チェックリスト(上から順)

- [x] Apple Developer Program登録(¥15,800/年) — 2026-07-16 完了
- [x] 課金の扱いを決める → **無料先行リリース**(paidPlans=false でコード対応済み)
- [ ] プライバシーポリシーURLが公開されているか確認(https://sarjavexofficial.github.io/privacy.html)
- [x] App Store Connectでアプリ作成 — 2026-07-16 eas submit時に自動作成(App ID: 6791472591)
- [x] EAS Buildで本番ビルド(build 6 / v1.0.0)→TestFlightへアップロード完了(2026-07-16、Apple処理中)
- [ ] 実機(iPhone)にTestFlightでインストールして動作確認
- [ ] スクリーンショット5枚撮影(§7。TestFlightで実機に入れてから撮る)
- [ ] 本ファイル§1〜6をApp Store Connectへコピペ(価格「無料」・App内課金なしで申告)
- [ ] Renderのキープウォーム設定(§8。審査提出中だけでOK)
- [ ] 審査提出(Review Notesに§8の英文を貼る)
