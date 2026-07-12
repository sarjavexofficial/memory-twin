import AsyncStorage from '@react-native-async-storage/async-storage';

import { currentMonthLocal } from '@/lib/date';

// プランごとの月間AI処理回数上限（企画書: Free=月20回、有料も「無制限」にしない）。
export const PLAN_AI_LIMITS: Record<string, number> = {
  free: 20,
  standard: 500,
  pro: 1500,
};

// 旧プラン名(seed/grow/twin)の読み替え。保存値の書き換えはsettings-contextが行うが、
// このモジュールは設定ストレージを直接読むため、書き換え前の値にも備えてここでも正規化する
const LEGACY_PLAN_NAMES: Record<string, string> = { seed: 'free', grow: 'standard', twin: 'pro' };

const USAGE_KEY = 'memory-twin:ai-usage';
const SETTINGS_KEY = 'memory-twin:settings';

function currentMonth() {
  // 「住んでいる国」設定のタイムゾーン基準のYYYY-MM（未設定なら端末基準）。
  // 月間上限のリセットも選んだ国の月替わりに合わせて切り替わる
  return currentMonthLocal();
}

export async function getAiUsage(): Promise<{ month: string; count: number }> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_KEY);
    if (raw) {
      const usage = JSON.parse(raw) as { month: string; count: number };
      if (usage.month === currentMonth()) return usage; // 月が変わったら自動リセット
    }
  } catch {
    // 読み込み失敗時は0からカウント
  }
  return { month: currentMonth(), count: 0 };
}

export async function getCurrentPlanLimit(): Promise<{ plan: string; limit: number }> {
  let plan = 'free';
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) plan = (JSON.parse(raw).currentPlan as string) ?? 'free';
  } catch {
    // 設定が読めない場合は無料プラン扱い
  }
  plan = LEGACY_PLAN_NAMES[plan] ?? plan;
  return { plan, limit: PLAN_AI_LIMITS[plan] ?? PLAN_AI_LIMITS.free };
}

// AI呼び出し前に実行。上限超過ならエラーを投げる
export async function checkAiQuota(): Promise<void> {
  const [usage, { limit }] = await Promise.all([getAiUsage(), getCurrentPlanLimit()]);
  if (usage.count >= limit) {
    throw new Error(
      `今月のAI処理回数の上限（${limit}回）に達しました。毎月1日にリセットされます。上限を増やすには、設定タブからプランのアップグレードをご検討ください。`,
    );
  }
}

// AI呼び出し成功後に実行（失敗した呼び出しは消費しない）
export async function recordAiUse(): Promise<void> {
  const usage = await getAiUsage();
  await AsyncStorage.setItem(
    USAGE_KEY,
    JSON.stringify({ month: usage.month, count: usage.count + 1 }),
  ).catch(() => {});
}
