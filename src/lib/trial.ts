import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/ciphers/utils.js';

import { getDeviceId } from '@/lib/device-id';

// 7日間のPro無料体験の「1アカウント1回」照会。
// - 付与の記録はサーバー（Supabase）に置くため、再インストール・端末変更・
//   データ全削除をしても同じアカウントには二度と付与されない
// - サーバーへ送るのはアカウントIDの一方向ハッシュのみ（元のIDは復元不能。
//   プライバシーポリシー第5条で開示済み）
// - セットアップSQL: docs/trial-claims-setup.sql

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export type TrialClaim = {
  granted: boolean; // true=今回はじめて付与された / false=すでに請求済み（期限のみ返る）
  trialEndsAt: string; // ISO形式の体験終了日時
};

// アカウント（provider + userId）から一方向ハッシュを作る。バックアップIDとは別系統の固定ソルト
function accountHash(account: { provider: string; userId: string }): string {
  return bytesToHex(
    sha256(utf8ToBytes(`memory-twin:trial-v1|${account.provider}|${account.userId}`)),
  );
}

// 体験の付与/照会。失敗（未設定・通信断・サーバー未セットアップ）は null を返し、
// 呼び出し側は静かに何もしない（次のサインインや画面表示時に自然に再試行される）
export async function claimTrial(account: {
  provider: string;
  userId: string;
}): Promise<TrialClaim | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_trial`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ account_hash: accountHash(account), device: await getDeviceId() }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { granted?: boolean; trial_ends_at?: string };
    if (typeof data?.trial_ends_at !== 'string') return null;
    return { granted: Boolean(data.granted), trialEndsAt: data.trial_ends_at };
  } catch {
    return null;
  }
}
