import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayLocal } from '@/lib/date';
import { JournalEntry } from '@/lib/journal-data';
import { Person } from '@/lib/mock-data';

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

// ---- 学習の材料づくり（設定タブの手動学習と自動学習で共通） ----

// 学習に使える「本人の記録」の数。サンプルデータは本人の理解を汚染するため必ず除外する
export function countLearnableRecords(people: Person[], entries: JournalEntry[]): number {
  return (
    entries.filter((e) => !e.sample).length +
    people.filter((p) => !p.sample).reduce((n, p) => n + p.memos.length, 0)
  );
}

// 学習用の抜粋。件数と情報量が理解の精度を直接決めるため、新しい順に最大40件・各200字。
// 日記かメモかの種別・日付・約束の有無まで含め、AIが文脈を取り違えないようにする
export const LEARNING_EXCERPT_LIMIT = 40;

export function buildLearningExcerpts(people: Person[], entries: JournalEntry[]): string[] {
  const records = [
    ...entries
      .filter((e) => !e.sample)
      .map((e) => ({
        date: e.date,
        text: `日記: ${e.text}${typeof e.mood === 'number' ? `（気分${e.mood}/5)` : ''}`,
      })),
    ...people
      .filter((p) => !p.sample)
      .flatMap((p) =>
        p.memos.map((m) => ({
          date: m.date,
          text: `${p.name}(${p.relation})について: ${m.text}${
            m.promise ? `（約束: ${m.promise.action}${m.promise.done ? '・完了済み' : ''}）` : ''
          }`,
        })),
      ),
  ];
  return records
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, LEARNING_EXCERPT_LIMIT)
    .map((r) => `[${r.date}] ${r.text.slice(0, 200)}`);
}

// 抜粋に載りきらない全体傾向を1行の統計で伝える（期間・件数・平均気分・よく登場する人）
export function buildLearningStats(people: Person[], entries: JournalEntry[]): string {
  const own = [...entries.filter((e) => !e.sample)].sort((a, b) => (a.date < b.date ? 1 : -1));
  const ownPeople = people.filter((p) => !p.sample);
  const memoCount = ownPeople.reduce((n, p) => n + p.memos.length, 0);
  const withMood = own.filter((e) => typeof e.mood === 'number');
  const avgMood = withMood.length
    ? (withMood.reduce((s, e) => s + (e.mood as number), 0) / withMood.length).toFixed(1)
    : null;
  const top = ownPeople
    .map((p) => ({ name: p.name, count: p.memos.length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((x) => `${x.name}(メモ${x.count}件)`)
    .join('、');
  const span = own.length ? `${own[own.length - 1].date}〜${own[0].date}` : 'なし';
  return [
    `日記${own.length}件（期間: ${span}）`,
    `人物${ownPeople.length}人・メモ${memoCount}件`,
    avgMood ? `平均気分${avgMood}/5` : null,
    top ? `よく登場する人: ${top}` : null,
  ]
    .filter(Boolean)
    .join('、');
}
