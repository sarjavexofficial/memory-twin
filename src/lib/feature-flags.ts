// 機能の公開スイッチ。コードを消さずに入口だけを閉じるための一元管理。
export const FEATURES = {
  // こだま（匿名共有掲示板）: 2026-07-13 ゆずの判断で初期リリースでは非公開。
  // 理由: ①ユーザーが少ないうちは掲示板が過疎に見えて逆効果 ②通報対応などの運営負担
  // ③「データは端末だけ」というプライバシー訴求と混線 ④UGC非搭載ならApp Store審査も軽い。
  // サーバー側（Supabaseのechoesテーブル・RPC・不正対策）は温存してあり、
  // ユーザーが増えてコミュニティを解禁するときは true に戻すだけでよい。
  kodama: false,
  // 自動クラウド同期: 2026-07-16追加。手動でバックアップ/復元を1回行うと合言葉を
  // 端末のSecure Storageにキャッシュし、以後はサインイン時の自動復元・変更時の自動バックアップを行う。
  // 問題が出た場合はここをfalseにすれば手動操作のみの旧挙動に戻せる。
  autoCloudSync: true,

  // App内課金（有料プラン）: 2026-07-17 ゆずの決定で初回リリースから本物の課金を提供する
  // （無料 / Standard ¥980 / Pro ¥1,980）。billing.ts は RevenueCat 実装に接続済み。
  // デモ購入UIは撤去済みで、購入はAppleの標準購入シート・解約はAppleのサブスク管理画面。
  // 動作条件: EXPO_PUBLIC_REVENUECAT_IOS_KEY（.env/EAS環境変数）と、
  // App Store Connect の4商品 + RevenueCat の Entitlements（docs/iap-setup-guide.md）。
  // キー未設定・Web・課金モジュール無しの旧バイナリでは、課金だけが安全に「利用不可」になる。
  paidPlans: true,

  // 7日間のPro無料体験: 2026-07-17 ゆずの判断で初回リリースでは提供しない。
  // 仕組み（サインイン必須・Supabaseのclaim_trialで1アカウント1回を厳格記録）は
  // 実装・検証済みのまま温存してある。有料プラン解禁時に true へ戻せば、
  // 「サインインで7日間Pro体験」がそのまま復活する（src/lib/trial.ts / docs/trial-claims-setup.sql）。
  // false の間: 体験の照会・付与・案内文を一切行わず、既存端末の体験状態も起動時に解除する。
  proTrial: false,
} as const;
