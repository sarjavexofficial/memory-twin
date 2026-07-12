import { todayLocal } from '@/lib/date';
import { JournalEntry } from '@/lib/journal-data';

// リマインド・オブ・ユー: 今日と同じ月日の、過去の記録を再提示する（AI不要・端末内）
export type OnThisDayItem = {
  yearsAgo: number;
  entry: JournalEntry;
};

export function findOnThisDay(entries: JournalEntry[]): OnThisDayItem[] {
  const today = todayLocal(); // YYYY-MM-DD
  const mmdd = today.slice(5); // MM-DD
  const currentYear = Number(today.slice(0, 4));

  const items: OnThisDayItem[] = [];
  for (const e of entries) {
    if (e.date.length < 10) continue;
    // 同じ月日で、年が過去のものだけ
    if (e.date.slice(5, 10) === mmdd && e.date.slice(0, 4) !== today.slice(0, 4)) {
      items.push({ yearsAgo: currentYear - Number(e.date.slice(0, 4)), entry: e });
    }
  }
  // 近い年（1年前）を先頭に
  return items.sort((a, b) => a.yearsAgo - b.yearsAgo);
}
