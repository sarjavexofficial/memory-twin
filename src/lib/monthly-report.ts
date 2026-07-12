import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayLocal } from '@/lib/date';
import { JournalEntry } from '@/lib/journal-data';
import { Person } from '@/lib/mock-data';

// 月次インサイトレポート: 1ヶ月分の記録から統計を作る。
// この計算はすべて端末内で行う（AIに送信されるのは、ユーザーが明示的に
// 「AIにまとめてもらう」を押したときの抜粋だけ。monthly-report.tsx参照）

export type MonthlyStats = {
  month: string; // YYYY-MM
  daysRecorded: number; // 記録がある日の数（日記と人物メモの日付の和集合）
  totalRecords: number; // 日記＋人物メモの合計件数
  avgSleep: number | null; // 睡眠記録がある日の平均（小数1桁）
  avgMood: number | null; // 気分記録がある日の平均（1〜5、小数1桁）
  topPeople: { name: string; count: number }[]; // その月にメモが多かった人（上位3名）
  excerpts: string[]; // AIまとめ用の本文抜粋（新しい順・最大6件・各120字）
};

// ---- AIまとめの保存 ----
// 生成したまとめは月ごとに端末へ保存し、読み返しは無料にする（AI利用回数を無駄にしない）。
// 保存時の記録件数も残し、記録が増えたときだけ「まとめを更新する」ボタンを出せるようにする

const NARRATIVE_KEY = 'memory-twin:monthly-narratives';

export type SavedNarrative = {
  text: string;
  recordCount: number; // 生成した時点のその月の記録件数
  updatedAt: string; // YYYY-MM-DD
};

async function readNarrativeMap(): Promise<Record<string, SavedNarrative>> {
  try {
    const raw = await AsyncStorage.getItem(NARRATIVE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SavedNarrative>) : {};
  } catch {
    return {};
  }
}

export async function getSavedNarrative(month: string): Promise<SavedNarrative | null> {
  const map = await readNarrativeMap();
  return map[month] ?? null;
}

export async function saveNarrative(
  month: string,
  text: string,
  recordCount: number,
): Promise<SavedNarrative> {
  const entry: SavedNarrative = { text, recordCount, updatedAt: todayLocal() };
  const map = await readNarrativeMap();
  map[month] = entry;
  await AsyncStorage.setItem(NARRATIVE_KEY, JSON.stringify(map)).catch(() => {});
  return entry;
}

// 'YYYY-MM-DD' から「先月」の 'YYYY-MM' を求める（国設定の今日を渡す前提）
export function previousMonth(todayIso: string): string {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeMonthlyStats(
  month: string,
  entries: JournalEntry[],
  people: Person[],
): MonthlyStats {
  const prefix = `${month}-`;
  const monthEntries = entries.filter((e) => e.date.startsWith(prefix));

  const dates = new Set<string>(monthEntries.map((e) => e.date));
  let memoCount = 0;
  const personCounts: { name: string; count: number }[] = [];
  for (const p of people) {
    const memos = p.memos.filter((m) => m.date.startsWith(prefix));
    if (memos.length === 0) continue;
    memoCount += memos.length;
    memos.forEach((m) => dates.add(m.date));
    personCounts.push({ name: p.name, count: memos.length });
  }

  const sleeps = monthEntries.map((e) => e.sleepHours).filter((v): v is number => typeof v === 'number');
  const moods = monthEntries.map((e) => e.mood).filter((v): v is number => typeof v === 'number');

  return {
    month,
    daysRecorded: dates.size,
    totalRecords: monthEntries.length + memoCount,
    avgSleep: sleeps.length ? round1(sleeps.reduce((a, b) => a + b, 0) / sleeps.length) : null,
    avgMood: moods.length ? round1(moods.reduce((a, b) => a + b, 0) / moods.length) : null,
    topPeople: personCounts.sort((a, b) => b.count - a.count).slice(0, 3),
    excerpts: monthEntries
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 6)
      .map((e) => e.text.slice(0, 120)),
  };
}
