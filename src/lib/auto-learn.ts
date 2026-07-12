import { learnUserProfile } from '@/lib/ai';
import { getAiProfile, saveAiProfile } from '@/lib/ai-profile';
import { JournalEntry } from '@/lib/journal-data';
import { Person } from '@/lib/mock-data';
import { Language } from '@/store/settings-context';

// Pro限定の自動学習: 前回の学習から記録が一定数増えていたら、裏でAIの理解ノートを更新する。
// ONにする操作自体がオプトイン（設定タブに送信内容と消費回数を明記）。
// 失敗しても静かに何もしない（次に条件を満たしたときに再試行され、手動学習もいつでも使える）
const AUTO_LEARN_THRESHOLD = 5;

// 二重実行ガード（記録の連続追加などでeffectが連続発火しても1回にまとめる）
let isRunning = false;

export async function maybeAutoLearn(
  people: Person[],
  entries: JournalEntry[],
  language: Language,
): Promise<void> {
  if (isRunning) return;
  const recordCount = entries.length + people.reduce((n, p) => n + p.memos.length, 0);
  if (recordCount === 0) return;

  const profile = await getAiProfile();
  if (recordCount - (profile?.learnedFromCount ?? 0) < AUTO_LEARN_THRESHOLD) return;

  isRunning = true;
  try {
    // 手動学習（設定タブ）と同じ抜粋ルール: 新しい順に最大15件・各100字
    const excerpts = [
      ...entries.map((e) => ({ date: e.date, text: e.text })),
      ...people.flatMap((p) => p.memos.map((m) => ({ date: m.date, text: `${p.name}: ${m.text}` }))),
    ]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 15)
      .map((r) => r.text.slice(0, 100));
    const summary = await learnUserProfile(excerpts, profile?.summary ?? null, language);
    if (summary.trim()) await saveAiProfile(summary, recordCount);
  } catch {
    // 月間上限・圏外などは静かに諦める
  } finally {
    isRunning = false;
  }
}
