# App Store 提出セット(2026-07-12作成)

Apple Developer Program登録後、App Store Connectにコピペしていくための素材集。
価格・機能の記述はこの日時点のアプリ実装(plans画面・i18n)と一致させている。
機能や価格を変えたら、このファイルも直すこと。

---

## 1. 基本情報

| 項目 | 内容 |
|---|---|
| アプリ名(30字以内) | Memory Twin：AI時代の記憶ノート |
| サブタイトル(30字以内) | AIを変えても、記憶は残る |
| カテゴリ(プライマリ) | ライフスタイル |
| カテゴリ(セカンダリ) | 仕事効率化 |
| 価格 | 無料(App内課金あり) |
| App内課金 | Standard ¥980/月・¥9,800/年、Pro ¥1,980/月・¥19,800/年(自動更新サブスクリプション) |
| 年齢制限 | 4+(質問票は全項目「なし」でOK。こだまはUGCだが対策済み→§6) |
| プライバシーポリシーURL | https://sarjavexofficial.github.io/privacy.html |
| サポートURL | https://sarjavexofficial.github.io |
| サポート連絡先 | sarjavex.official@gmail.com |
| Bundle ID | com.sarjavex.memorytwin(app.json設定済み) |

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
Today Recallが「今日会う人との前回の話題」「期限が近い約束」など、今日必要な記憶だけを届けます。検索する前に、思い出せる。

■ 記録するほど、あなた専用のAIに
記録から「AIの理解ノート」が育ち、回答があなたの文脈に寄り添っていきます。月次レポートで1か月の自分をAIがまとめてくれます。

■ プライバシーが設計の中心
・記録はすべて端末内に保存。自動でどこかに送られることはありません
・AIへは質問に関係する抜粋だけを送信。広告目的の利用・販売は一切なし
・クラウドバックアップは端末上で暗号化してから保管(運営にも読めません)
・Face IDによるアプリロック対応
・AI学習へのデータ提供は初期設定OFF

■ こだま — 名前のない共感
日記の一言をAIが匿名化して共有できる掲示板。「同じ気持ちの人がいる」とそっと分かる場所です。

■ 料金
基本機能は無料。もっと使いたくなったら:
・Standard(¥980/月): AI質問 月500回、履歴取り込み無制限、週次・月次のAI振り返り
・Pro(¥1,980/月): AI質問 月1,500回、Today Recall最大10件、長文・大量履歴の解析
年払いなら2か月分お得です。

解約はいつでも、iPhoneの設定から。クレジットカード情報がこのアプリや運営者に渡ることはありません。

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
Today Recall delivers just what you need today: the last topic with someone you're meeting, a promise coming due. Remember before you even search.

■ An AI that grows with your records
Your records build an "understanding note" that makes answers increasingly personal. Monthly reports let AI sum up your month.

■ Privacy at the core
- All records stay on your device. Nothing is uploaded automatically
- Only question-related excerpts are sent to AI. Never used or sold for ads
- Cloud backup is encrypted on your device first (we cannot read it)
- App Lock with Face ID
- Data contribution for AI improvement is OFF by default

■ Pricing
Core features are free. Standard ($/mo) and Pro plans unlock more AI questions, unlimited history imports, and AI-written weekly/monthly reviews. Cancel anytime from iPhone Settings.

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
| ユーザーコンテンツ > その他のユーザーコンテンツ | こだまへの匿名投稿・暗号化済みバックアップ | App機能 | いいえ | いいえ |

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
3. "Echoes" (anonymous sharing) moderation: every post is AI-anonymized
   before posting, users must accept community rules on first use, any user
   can report a post, and posts reported by 3 devices are hidden
   automatically. Users can delete their own posts.
4. Cloud backup is end-to-end encrypted on device; we cannot read the data.
```

**審査リスクと事前対策**:
- **UGC(ガイドライン1.2)**: 通報・自動非表示・規約同意・本人削除は実装済み。「特定ユーザーのブロック」は匿名掲示板のため非該当と説明できるが、指摘されたら「この投稿を非表示」ボタンを追加する(30分で実装可能)
- **コールドスタート**: 審査員の初回AI操作が遅いと「壊れている」と判定されかねない。**審査提出中はUptimeRobot等で5分おきにRender /healthをpingして常時ウォームに保つ**(無料)
- **課金**: RevenueCat実装前に提出するなら、plans画面の購入ボタンが「デモ購入」のままだと**確実にリジェクト**される。①課金UIを隠して無料アプリとして出す、②RevenueCat実装後に出す、のどちらかに決めてから提出
- **輸出コンプライアンス(暗号化)**: 標準アルゴリズム(HTTPS/AES)のみ使用=適用除外。app.jsonに `usesNonExemptEncryption: false` 設定済み(毎ビルドの質問をスキップできる)

---

## 9. 提出チェックリスト(上から順)

- [ ] Apple Developer Program登録(¥15,800/年)→承認待ち1〜2日
- [ ] App Store Connectでアプリ作成(Bundle ID: com.sarjavex.memorytwin)
- [ ] 課金の扱いを決める(§8参照): 無料で先行リリース or RevenueCat実装後
- [ ] EAS Buildで本番ビルド→TestFlightで実機確認
- [ ] スクリーンショット5枚撮影(§7)
- [ ] 本ファイル§1〜6をApp Store Connectへコピペ
- [ ] Renderのキープウォーム設定(§8)
- [ ] 審査提出
