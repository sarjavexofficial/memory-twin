# 開発ログ 2026-07-16（0.1.9 → 自動クラウド同期）

## サインイン時の自動クラウド同期を実装

保留リストにあった「サインイン時の自動クラウド同期（ハイブリッド路線の次の一手）」に着手。

**設計判断**: 既存のクラウドバックアップは合言葉を一切保存しないゼロ知識設計（[cloud-backup-hardening.sql](../cloud-backup-hardening.sql)参照）。「自動で同期する」を実現するには合言葉をどこかにキャッシュする必要があり、これはセキュリティモデルの変更になるため、ゆずに実装方針を確認。

2択を提示:
1. 合言葉を端末のSecure Storage（Keychain/Keystore）にキャッシュ → 選択・採用
2. キャッシュなし・毎回手動入力のまま（サインイン直後にワンタップ復元導線だけ追加）

「1」を採用。サーバー側は今まで通り合言葉を一切受け取らない（ゼロ知識のまま）。変わるのは端末側だけ。

## 実装内容

- `expo-secure-store` を追加（`npx expo install`。app.jsonにconfig pluginが自動追加された）
- [src/lib/cloud-sync-cache.ts](../../src/lib/cloud-sync-cache.ts) 新設: アカウント（provider+userId）ごとにキーを分けて合言葉をSecureStoreに保存/取得/削除。**Web版はSecureStore非対応のため常にキャッシュなし（従来通り手動）にフォールバック**
- [src/lib/feature-flags.ts](../../src/lib/feature-flags.ts) に `autoCloudSync: true` を追加（killスイッチ）
- 手動バックアップ・復元が成功した時点で合言葉をキャッシュに保存（[settings.tsx](../../src/app/(tabs)/settings.tsx)）。設定画面に「この合言葉をこの端末に記憶し、以後は自動で同期します」の表示と「記憶を消す」リンクを追加
- サインイン直後（Apple/Google）、キャッシュ済みの合言葉があれば自動でクラウドから復元 → 既存データに追加マージ（[account-section.tsx](../../src/components/account-section.tsx)の`tryAutoSync`）。バックアップが存在しない・通信失敗などは静かに諦める（手動導線は引き続き使える）
- 記録（people/journal/tasks）の変更を検知し、8秒デバウンス後に自動アップロードする[CloudAutoSync](../../src/components/cloud-auto-sync.tsx)をルートレイアウトに常駐（`_layout.tsx`）
- サインアウト・アカウント削除時にキャッシュ済み合言葉を端末から削除
- 6言語の文言追加（`cloudSyncRemembered`, `cloudSyncForget`）
- プライバシーポリシー改訂（第3条に自動同期の記述を追加、最終更新日を7/16に更新）

## 既知の制約・次回への申し送り

- サーバー側の `put_backup` レート制限は **5回/日/端末**（[cloud-backup-hardening.sql](../cloud-backup-hardening.sql)）。1日に何度も編集セッションを挟むユーザーは自動アップロードが上限に達し、その日はそれ以降クラウドが古いまま静かに止まる可能性がある。エラーは握りつぶしている（UXを壊さないため）ので、当面は様子見。頻発するようならデバウンス時間を延ばすか、上限緩和をサーバー側で検討
- Web版（開発プレビュー）はSecureStore非対応のため自動同期の対象外。E2Eテストで自動同期の実機検証はできない。iPhone実機かExpo Goでの確認が必要
- 削除するのは「この端末のキャッシュ」のみ。他の端末に合言葉がキャッシュされたままなら、そちらは引き続き自動同期する（合言葉自体を変えない限り、当然の挙動）
