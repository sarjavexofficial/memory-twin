import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCurrentPlanLimit } from '@/lib/ai-usage';
import { todayLocal } from '@/lib/date';
import { getDeviceId } from '@/lib/device-id';

// こだま: AIが生成した振り返り文だけを、名前を伏せてみんなの掲示板に共有する機能。
// 生の日記は対象外にする（送信できるのはAIが本人の記録から再構成した文章のみ）ことで、
// 個人情報混入とストア審査でのリスクを最小限にしている。
// バックエンドはSupabaseのREST API（PostgREST）を直接fetchで叩く。SDK依存を増やさないため。

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export class CommunityConfigError extends Error {}

const LAST_SHARE_KEY = 'memory-twin:kodama-last-share';
const TERMS_KEY = 'memory-twin:kodama-terms-accepted';
const REACTED_KEY = 'memory-twin:kodama-reacted';
const MY_POSTS_KEY = 'memory-twin:kodama-mine'; // 自分の投稿の { 投稿ID: 削除トークン }
const MAX_LEN = 200;

// 匿名掲示板でも「本人だけが消せる」ようにする仕組み:
// 投稿時にランダムな削除トークンを作って一緒に保存し、対応表はこの端末にだけ残す。
// トークンが一致した場合のみサーバー側のRPCが削除を実行する（他人の投稿は消せない）
function generateDeleteToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

async function getMyPosts(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(MY_POSTS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

export async function getMyEchoIds(): Promise<Set<string>> {
  return new Set(Object.keys(await getMyPosts()));
}

// こだまの利用ルールへの同意（初回共有時に1回だけ確認する。App StoreのUGC審査要件）
export async function hasAcceptedKodamaTerms(): Promise<boolean> {
  return (await AsyncStorage.getItem(TERMS_KEY).catch(() => null)) === '1';
}

export async function markKodamaTermsAccepted(): Promise<void> {
  await AsyncStorage.setItem(TERMS_KEY, '1').catch(() => {});
}

// 自傷・連絡先など、共有すべきでない内容の簡易フィルタ（完全な検知ではなく最初の防波堤）
const BLOCKED_PATTERNS = [
  /死にたい|消えたい|自殺|自傷/,
  /\d{2,4}-\d{3,4}-\d{4}/, // 電話番号らしき並び
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // メールアドレス
];

export function containsUnsafeContent(text: string): boolean {
  return BLOCKED_PATTERNS.some((re) => re.test(text));
}

// プランごとの1日の共有回数（Today Recallの1/3/10と同じ段組み）
export const ECHO_SHARE_DAILY_LIMITS: Record<string, number> = {
  free: 1,
  standard: 3,
  pro: 10,
};

// 今日の共有回数。「今日」は「住んでいる国」設定のタイムゾーン基準（todayLocal）で判定するため、
// 選んだ国の日付が変わった瞬間にリセットされる。国を切り替えると日付のずれで早めにリセットされる
// ことがあるが、サーバー側の「1端末24時間10件」の天井が悪用を防ぐ。
// 旧形式（日付文字列だけ保存していた頃）は「その日1回共有済み」として引き継ぐ
async function getShareState(): Promise<{ date: string; count: number }> {
  const raw = await AsyncStorage.getItem(LAST_SHARE_KEY).catch(() => null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { date?: string; count?: number };
      if (parsed && typeof parsed === 'object' && parsed.date) {
        return { date: parsed.date, count: parsed.count ?? 0 };
      }
    } catch {
      return { date: raw, count: 1 };
    }
  }
  return { date: '', count: 0 };
}

// 今日あと何回共有できるかをUIに出すための状態（used=今日の共有済み回数）
export async function getEchoShareStatus(): Promise<{ used: number; limit: number }> {
  const { plan } = await getCurrentPlanLimit();
  const limit = ECHO_SHARE_DAILY_LIMITS[plan] ?? ECHO_SHARE_DAILY_LIMITS.free;
  const state = await getShareState();
  return { used: state.date === todayLocal() ? state.count : 0, limit };
}

async function recordShare(): Promise<void> {
  const { used } = await getEchoShareStatus();
  await AsyncStorage.setItem(
    LAST_SHARE_KEY,
    JSON.stringify({ date: todayLocal(), count: used + 1 }),
  ).catch(() => {});
}

async function getReactedIds(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(REACTED_KEY);
  return new Set(raw ? (JSON.parse(raw) as string[]) : []);
}

export async function hasReacted(id: string): Promise<boolean> {
  const reacted = await getReactedIds();
  return reacted.has(id);
}

async function setReacted(id: string, value: boolean): Promise<void> {
  const reacted = await getReactedIds();
  if (value) reacted.add(id);
  else reacted.delete(id);
  await AsyncStorage.setItem(REACTED_KEY, JSON.stringify([...reacted])).catch(() => {});
}

async function callRest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new CommunityConfigError(
      'こだま機能の接続設定がまだ完了していません。.env に EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください。',
    );
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`通信に失敗しました（${response.status}）: ${body.slice(0, 200)}`);
  }
  return response;
}

export type Echo = {
  id: string;
  text: string;
  created_at: string;
  reaction_count: number;
};

export async function fetchEchoes(limit = 50): Promise<Echo[]> {
  const response = await callRest(
    `/rest/v1/echoes?select=id,text,created_at,reaction_count&hidden=eq.false&order=created_at.desc&limit=${limit}`,
  );
  return (await response.json()) as Echo[];
}

// 共有をブロックした理由。文言はUI側でi18n辞書から表示する（このファイルは言語設定を知らないため）
export type ShareBlockCode = 'empty' | 'unsafe' | 'daily-limit';
export type ShareCheck = { ok: true } | { ok: false; code: ShareBlockCode; limit: number };

export class ShareBlockedError extends Error {
  constructor(
    public code: ShareBlockCode,
    public limit: number,
  ) {
    super(`share blocked: ${code}`);
  }
}

// 共有できる状態かを事前に確認する（実際の送信前にUI側で理由を表示するため）
export async function checkCanShare(text: string): Promise<ShareCheck> {
  const { used, limit } = await getEchoShareStatus();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, code: 'empty', limit };
  if (containsUnsafeContent(trimmed)) return { ok: false, code: 'unsafe', limit };
  if (used >= limit) return { ok: false, code: 'daily-limit', limit };
  return { ok: true };
}

export async function shareEcho(text: string): Promise<void> {
  const trimmed = text.trim().slice(0, MAX_LEN);
  const check = await checkCanShare(trimmed);
  if (!check.ok) throw new ShareBlockedError(check.code, check.limit);
  // 投稿はRPC経由のみ（テーブルへの直接INSERTはサーバー側で禁止済み）。
  // サーバー側でも端末ごとに1日10件（最上位プラン相当）を上限にしており、
  // アプリを再インストールしてもAPIを直接叩いても、それ以上は投稿できない
  const token = generateDeleteToken();
  const response = await callRest('/rest/v1/rpc/share_echo', {
    method: 'POST',
    body: JSON.stringify({ echo_text: trimmed, token, device: await getDeviceId() }),
  });
  const id = (await response.json().catch(() => null)) as string | null;
  if (id) {
    const mine = await getMyPosts();
    mine[id] = token;
    await AsyncStorage.setItem(MY_POSTS_KEY, JSON.stringify(mine)).catch(() => {});
  }
  await recordShare();
}

// 自分の投稿の削除。投稿時にこの端末へ保存したトークンが一致する場合だけサーバー側で削除される
export async function deleteMyEcho(id: string): Promise<void> {
  const mine = await getMyPosts();
  const token = mine[id];
  if (!token) throw new Error('この投稿の削除情報がこの端末にありません。');
  await callRest('/rest/v1/rpc/delete_echo', {
    method: 'POST',
    body: JSON.stringify({ echo_id: id, token }),
  });
  delete mine[id];
  await AsyncStorage.setItem(MY_POSTS_KEY, JSON.stringify(mine)).catch(() => {});
}

// 1件につき端末ごとに1回だけ。端末内の記録に加えてサーバー側でも
// (投稿ID, 端末ID)の組で重複を弾くため、APIを直接叩いても水増しできない
export async function reactToEcho(id: string): Promise<void> {
  if (await hasReacted(id)) return;
  await callRest('/rest/v1/rpc/react_echo', {
    method: 'POST',
    body: JSON.stringify({ echo_id: id, device: await getDeviceId() }),
  });
  await setReacted(id, true);
}

// いいねの取り消し。サーバー側は「この端末が実際にいいねした記録」がある場合だけ減算する
export async function unreactToEcho(id: string): Promise<void> {
  if (!(await hasReacted(id))) return;
  await callRest('/rest/v1/rpc/unreact_echo', {
    method: 'POST',
    body: JSON.stringify({ echo_id: id, device: await getDeviceId() }),
  });
  await setReacted(id, false);
}

// 通報も端末ごとに1投稿1回だけ数える（1人が3回通報して非表示に追い込むのを防ぐ）
export async function reportEcho(id: string): Promise<void> {
  await callRest('/rest/v1/rpc/report_echo', {
    method: 'POST',
    body: JSON.stringify({ echo_id: id, device: await getDeviceId() }),
  });
}
