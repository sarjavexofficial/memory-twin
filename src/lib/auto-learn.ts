import { learnUserProfile } from '@/lib/ai';
import {
  buildLearningExcerpts,
  buildLearningStats,
  countLearnableRecords,
  getAiProfile,
  saveAiProfile,
} from '@/lib/ai-profile';
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
  // 手動学習（設定タブ）と完全に同じ材料を使う（サンプルデータ除外・最大40件×200字＋統計）
  const recordCount = countLearnableRecords(people, entries);
  if (recordCount === 0) return;

  const profile = await getAiProfile();
  if (recordCount - (profile?.learnedFromCount ?? 0) < AUTO_LEARN_THRESHOLD) return;

  isRunning = true;
  try {
    const summary = await learnUserProfile(
      buildLearningExcerpts(people, entries),
      buildLearningStats(people, entries),
      profile?.summary ?? null,
      language,
    );
    if (summary.trim()) await saveAiProfile(summary, recordCount);
  } catch {
    // 月間上限・圏外などは静かに諦める
  } finally {
    isRunning = false;
  }
}
