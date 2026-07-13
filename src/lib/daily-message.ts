import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayLocal } from '@/lib/date';
import { strings } from '@/lib/i18n';
import { JournalEntry } from '@/lib/journal-data';
import { Person } from '@/lib/mock-data';

type Dict = (typeof strings)['ja'];

// 能動メッセージ（事業計画書の中核機能）
// 原則: 1日最大1件 / 話さない判断（閾値未満なら出さない）/ 根拠の明示 / 反応の学習

const MESSAGE_KEY = 'memory-twin:daily-message';
const FEEDBACK_KEY = 'memory-twin:speech-feedback';

// 発話しきい値。スコアがこれ未満なら「今日は話さない」
const SPEAK_THRESHOLD = 5;

export type MessageCategory =
  | 'overdue-promise'
  | 'upcoming-promise'
  | 'undated-promise'
  | 'stale-person'
  | 'short-sleep';

export type DailyCandidate = {
  category: MessageCategory;
  score: number;
  // メッセージ組み立て用のパラメータ（文言はi18n側で組み立てる）
  personName?: string;
  personId?: string;
  action?: string;
  dueDate?: string;
  days?: number;
  // 根拠の明示用
  sourceDate: string;
  sourceText: string;
};

export type DailyMessageRecord = {
  date: string; // YYYY-MM-DD
  candidate: DailyCandidate | null; // nullは「今日は話さないと判断した」記録
  feedback?: 'helpful' | 'unnecessary';
};

type FeedbackStats = Record<string, { up: number; down: number }>;

function today() {
  // 「住んでいる国」設定のタイムゾーン基準（未設定なら端末基準）。
  // 「1日1件」の区切りも選んだ国の日付替わりで切り替わる
  return todayLocal();
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export async function getFeedbackStats(): Promise<FeedbackStats> {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    return raw ? (JSON.parse(raw) as FeedbackStats) : {};
  } catch {
    return {};
  }
}

// 候補を集めてスコアリングする。スコア = 基礎点（重要度・緊急度）+ 学習調整
function buildCandidates(rawPeople: Person[], rawEntries: JournalEntry[]): DailyCandidate[] {
  // サンプル（デモ）データは、本人の記録が1件でもあれば話題にしない。
  // 何も記録がない初期状態でだけ、機能紹介としてサンプルを話題にする
  const hasReal = rawPeople.some((p) => !p.sample) || rawEntries.some((e) => !e.sample);
  const people = hasReal ? rawPeople.filter((p) => !p.sample) : rawPeople;
  const entries = hasReal ? rawEntries.filter((e) => !e.sample) : rawEntries;

  const list: DailyCandidate[] = [];
  const todayIso = today();

  for (const person of people) {
    for (const memo of person.memos) {
      const promise = memo.promise;
      if (!promise || promise.done) continue;
      if (promise.dueDate && promise.dueDate < todayIso) {
        // 期限切れの約束: 最も緊急・行動可能
        list.push({
          category: 'overdue-promise',
          score: 10,
          personName: person.name,
          personId: person.id,
          action: promise.action,
          dueDate: promise.dueDate,
          sourceDate: memo.date,
          sourceText: memo.text,
        });
      } else if (promise.dueDate && daysSince(promise.dueDate) >= -3) {
        // 3日以内に期限が来る約束
        list.push({
          category: 'upcoming-promise',
          score: 7,
          personName: person.name,
          personId: person.id,
          action: promise.action,
          dueDate: promise.dueDate,
          sourceDate: memo.date,
          sourceText: memo.text,
        });
      } else if (!promise.dueDate) {
        // 期限のない約束: 忘れやすいので「日付を決めませんか」と後押しする。
        // 他に話題がない日にだけ出る低スコア（しきい値ちょうど）
        list.push({
          category: 'undated-promise',
          score: 5,
          personName: person.name,
          personId: person.id,
          action: promise.action,
          sourceDate: memo.date,
          sourceText: memo.text,
        });
      }
    }
  }

  // 30日以上連絡していない人（最も疎遠な1人だけ候補にする）
  const stale = people
    .map((p) => ({ p, days: daysSince(p.lastContact) }))
    .filter(({ days }) => days >= 30)
    .sort((a, b) => b.days - a.days)[0];
  if (stale) {
    list.push({
      category: 'stale-person',
      score: 6,
      personName: stale.p.name,
      personId: stale.p.id,
      days: stale.days,
      sourceDate: stale.p.lastContact,
      sourceText: stale.p.memos[0]?.text ?? '',
    });
  }

  // 直近3件の記録がすべて睡眠6時間未満
  const withSleep = entries.filter((e) => typeof e.sleepHours === 'number').slice(0, 3);
  if (withSleep.length === 3 && withSleep.every((e) => (e.sleepHours as number) < 6)) {
    list.push({
      category: 'short-sleep',
      score: 5,
      sourceDate: withSleep[0].date,
      sourceText: withSleep.map((e) => `${e.date}: ${e.sleepHours}h`).join(' / '),
    });
  }

  return list;
}

// 候補は日付が変わるまでAsyncStorageにキャッシュされるため、personName/actionを固定文字列のまま
// 持たせると表示言語を切り替えても古い言語のまま残ってしまう。personIdから現在のpeopleを
// 引き直し、見つかればそちらを優先する（サンプル人物は言語切り替えで名前が差し替わるため）。
function resolveCandidateTexts(c: DailyCandidate, people: Person[]): { personName: string; action: string } {
  const current = c.personId ? people.find((p) => p.id === c.personId) : undefined;
  if (!current) return { personName: c.personName ?? '', action: c.action ?? '' };
  const memo = current.memos.find((m) => m.date === c.sourceDate);
  return { personName: current.name, action: memo?.promise?.action ?? c.action ?? '' };
}

// 候補からユーザー向けメッセージ文を組み立てる（画面表示・通知本文の両方で使う）
export function candidateMessage(c: DailyCandidate, L: Dict, people: Person[] = []): string {
  const { personName, action } = resolveCandidateTexts(c, people);
  switch (c.category) {
    case 'overdue-promise':
      return L.dailyMsgOverdue(personName, action, c.dueDate ?? '');
    case 'upcoming-promise':
      return L.dailyMsgUpcoming(personName, action, c.dueDate ?? '');
    case 'undated-promise':
      return L.dailyMsgUndated(personName, action);
    case 'stale-person':
      return L.dailyMsgStale(personName, c.days ?? 0);
    case 'short-sleep':
      return L.dailyMsgSleep;
  }
}

// 現時点で最も優先度の高い候補を返す（通知の予約用。当日の固定記録には触れない）
export async function previewBestCandidate(
  people: Person[],
  entries: JournalEntry[],
): Promise<DailyCandidate | null> {
  const stats = await getFeedbackStats();
  const candidates = buildCandidates(people, entries)
    .map((c) => {
      const s = stats[c.category] ?? { up: 0, down: 0 };
      return { ...c, score: c.score + (s.up - s.down) * 2 };
    })
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score >= SPEAK_THRESHOLD ? best : null;
}

// 今日の能動メッセージを取得する。初回呼び出しで生成・固定し、同日は同じ内容を返す
export async function getTodayMessage(
  people: Person[],
  entries: JournalEntry[],
): Promise<DailyMessageRecord> {
  const todayIso = today();
  try {
    const raw = await AsyncStorage.getItem(MESSAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as DailyMessageRecord;
      // 1日最大1件: 一度「話した」日は固定。
      // まだ話していない日（candidate: null）は、その後の記録で話題が生まれている
      // 可能性があるため再評価する（朝は無言→夕方に約束を記録→その日のうちに拾える）
      if (stored.date === todayIso && stored.candidate) return stored;
    }
  } catch {
    // 読み込み失敗時は再生成
  }

  // 「不要だった」が続いたカテゴリはスコアを下げる（反応の学習）
  const stats = await getFeedbackStats();
  const candidates = buildCandidates(people, entries)
    .map((c) => {
      const s = stats[c.category] ?? { up: 0, down: 0 };
      return { ...c, score: c.score + (s.up - s.down) * 2 };
    })
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const record: DailyMessageRecord = {
    date: todayIso,
    // 話さない判断: しきい値未満なら候補があっても出さない
    candidate: best && best.score >= SPEAK_THRESHOLD ? best : null,
  };
  await AsyncStorage.setItem(MESSAGE_KEY, JSON.stringify(record)).catch(() => {});
  return record;
}

// 「役に立った / 不要だった」を保存し、カテゴリ別の学習統計を更新する
export async function saveMessageFeedback(
  record: DailyMessageRecord,
  feedback: 'helpful' | 'unnecessary',
): Promise<DailyMessageRecord> {
  const updated: DailyMessageRecord = { ...record, feedback };
  await AsyncStorage.setItem(MESSAGE_KEY, JSON.stringify(updated)).catch(() => {});
  if (record.candidate) {
    const stats = await getFeedbackStats();
    const s = stats[record.candidate.category] ?? { up: 0, down: 0 };
    if (feedback === 'helpful') s.up += 1;
    else s.down += 1;
    stats[record.candidate.category] = s;
    await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(stats)).catch(() => {});
  }
  return updated;
}
