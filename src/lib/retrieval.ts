// Memory Twin Retrieval Engine (Phase 1)
// 全記録を毎回AIへ送るのではなく、質問に関連する記録だけを端末内で検索・選別して渡す。
// 評価軸: キーワード関連度・新しさ・重要度（約束/未完了）— 企画書「検索結果の選別」に対応。

export type MemoryRecord = {
  date: string; // YYYY-MM-DD
  text: string;
  kind: 'journal' | 'person' | 'promise';
  personName?: string;
  tags?: string[];
  source?: string;
  done?: boolean; // promiseのみ
};

const DEFAULT_LIMIT = 12;

function tokenize(query: string): string[] {
  // 日本語は分かち書きされないため、空白・記号区切り＋2文字以上の部分文字列マッチで代用する
  return query
    .split(/[\s、。・,.!?？！「」()（）]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function daysAgo(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function retrieveRelevant(
  records: MemoryRecord[],
  query: string,
  limit = DEFAULT_LIMIT,
): MemoryRecord[] {
  const terms = tokenize(query);

  const scored = records.map((record) => {
    const haystack = [record.text, record.personName ?? '', ...(record.tags ?? [])].join(' ');
    let score = 0;

    // 関連度: クエリ語の一致（人物名の一致は特に重視）
    for (const term of terms) {
      if (haystack.includes(term)) score += 10;
      if (record.personName && record.personName.includes(term)) score += 20;
    }

    // 新しさ: 直近ほど加点（90日で減衰）
    const age = daysAgo(record.date);
    score += Math.max(0, 8 - age / 12);

    // 重要度: 未完了の約束を優先（企画書の評価軸）
    if (record.kind === 'promise' && !record.done) score += 6;

    return { record, score };
  });

  const matched = scored.filter((s) => s.score > 8); // キーワードが1つも当たらない記録は原則外す
  const pool = matched.length >= 3 ? matched : scored; // ヒットが少なすぎる場合は全体から新しい順に補完

  return pool
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.record);
}

// 人物・日記の生データをMemoryRecordへ変換するヘルパー
export function buildMemoryRecords(
  entries: { date: string; text: string; tags?: string[]; source?: string }[],
  people: { name: string; memos: { date: string; text: string; tags?: string[]; promise?: { action: string; dueDate?: string; done: boolean } }[] }[],
): MemoryRecord[] {
  const records: MemoryRecord[] = [];
  for (const e of entries) {
    records.push({ date: e.date, text: e.text, kind: 'journal', tags: e.tags, source: e.source });
  }
  for (const p of people) {
    for (const m of p.memos) {
      records.push({ date: m.date, text: m.text, kind: 'person', personName: p.name, tags: m.tags });
      if (m.promise) {
        records.push({
          date: m.promise.dueDate ?? m.date,
          text: `${p.name}との約束: ${m.promise.action}`,
          kind: 'promise',
          personName: p.name,
          done: m.promise.done,
        });
      }
    }
  }
  return records;
}
