import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayLocal } from '@/lib/date';

// AIの理解ノート: 使うほどAIが本人を学ぶ「成長」の土台。
// 記録からAIが生成した「本人の理解」を端末内に保存し、AI検索・月次まとめなどの
// プロンプトに毎回添えることで、回答が本人向けに個人化されていく。
// 理解ノートはユーザーがいつでも全文を確認・削除できる（設定タブ）。
// サーバーには保存しない。AIに送られるのは「学習する」を押した瞬間の抜粋だけ。

const PROFILE_KEY = 'memory-twin:ai-profile';

// 記録がこの件数増えたら「学習の更新」を促す
const STALE_THRESHOLD = 10;

export type AiProfile = {
  summary: string; // AIが学んだ本人の理解（250字程度）
  updatedAt: string; // YYYY-MM-DD（国設定のタイムゾーン基準）
  learnedFromCount: number; // 学習した時点の記録件数
};

export async function getAiProfile(): Promise<AiProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiProfile;
    return parsed.summary ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveAiProfile(summary: string, recordCount: number): Promise<AiProfile> {
  const profile: AiProfile = {
    summary,
    updatedAt: todayLocal(),
    learnedFromCount: recordCount,
  };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile)).catch(() => {});
  return profile;
}

export async function clearAiProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
}

// 前回の学習から記録が一定数増えていたら、更新を促すヒントを出す
export function isProfileStale(profile: AiProfile | null, currentRecordCount: number): boolean {
  if (!profile) return currentRecordCount > 0;
  return currentRecordCount - profile.learnedFromCount >= STALE_THRESHOLD;
}
