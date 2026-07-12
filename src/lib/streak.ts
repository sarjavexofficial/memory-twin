import { daysAgoLocal } from '@/lib/date';

// 連続記録（ストリーク）: 習慣化の心理装置。
// - その日1件でも日記があれば「記録した日」と数える（サンプルデータは除外）
// - 今日まだ書いていなくても、昨日まで続いていれば「まだ途切れていない」扱い
//   （0時をまたいだ瞬間に炎が消えると理不尽なので、今日中は猶予）
export type Streak = {
  current: number; // 現在の連続日数（今日未記録なら昨日まで）
  recordedToday: boolean;
};

export function computeStreak(entries: { date: string; sample?: boolean }[]): Streak {
  const days = new Set(entries.filter((e) => !e.sample).map((e) => e.date));
  const recordedToday = days.has(daysAgoLocal(0));
  let current = 0;
  let i = recordedToday ? 0 : 1;
  while (days.has(daysAgoLocal(i))) {
    current += 1;
    i += 1;
  }
  return { current, recordedToday };
}
