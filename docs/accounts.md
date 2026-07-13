# Sarjavex アカウント台帳

事業で使っているサービス・アカウントの一覧。**パスワードはここに書かない**（各サービスとも2段階認証ON・2026-07-12確認済み）。
新しいサービスを契約したら必ずこの表に1行足すこと。

## 現在使用中（5つ）

| サービス | 何に使っているか | ログインID | 備考 |
|---|---|---|---|
| **Google** (Gmail) | サポート窓口メール。下記ほぼ全サービスの登録メールもこれ | sarjavex.official@gmail.com | 事業の土台。毎朝8時にClaudeがメール下書き対応 |
| **GitHub** (sarjavexofficial) | コードの保管庫3つ（memory-twin / sarjavex-api / 会社サイト）＋会社サイトとプライバシーポリシーの公開（GitHub Pages）＋毎朝のサーバー起こし（Actions） | sarjavex.official@gmail.com | 無料枠 |
| **Supabase** (プロジェクト名 sarjavex) | 暗号化クラウドバックアップの保管庫。こだま用のテーブルもあるが現在非公開 | sarjavex.official@gmail.com | 無料枠。1週間無アクセスで止まるがGitHub Actionsが毎朝起こしている |
| **Render** (sarjavex-ai-api) | AIの中継サーバー（アプリ→Render→Gemini）。アプリにAIの鍵を持たせないための壁 | sarjavex.official@gmail.com | 無料枠。無通信でスリープし初回応答が遅いことがある |
| **Google AI Studio** (Gemini APIキー) | AIの本体。キーはRenderの管理画面にだけ保存 | sarjavex.official@gmail.com（Googleアカウント配下） | 無料枠（データ利用条件は要検討事項） |

## 準サービス（アカウントというほどではない）

| サービス | 何に使っているか | 備考 |
|---|---|---|
| formsubmit.co | 会社サイトの問い合わせフォームの送信先 | メール認証のみ・管理画面なし |
| Apple ID（ゆず個人） | iPhoneのExpo Goインストール | 将来Apple Developer登録（年99ドル）に使う予定 |

## 今後増える予定（増えるのはこの2つだけ）

| サービス | いつ・何のため | 費用 |
|---|---|---|
| Expo | アプリ更新を「開いたら反映」にする（EAS Update）。開発体験の改善 | 無料 |
| Apple Developer | App Store公開・TestFlight配信。これが最終形 | 年99ドル |

## 覚え方

**メールは1つ（sarjavex.official@gmail.com）に全部ぶら下がっている**ので、実質管理するのはGoogleアカウント1つ＋各サービスの2段階認証。パスワード管理はiPhoneのパスワードアプリ等に集約するのを推奨。
