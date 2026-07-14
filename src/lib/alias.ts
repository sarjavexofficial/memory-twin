// AIへ送る前に、登録済み人物の「実名」を関係性ベースの別名へ置換し、
// 回答表示時に実名へ戻すためのユーティリティ。
//
// 目的（企画書§4・§6）: 人物の実名は最も直接的な個人識別子なので、外部AI（Gemini）へ送らない。
// 関係性（例: 職場の先輩）は文脈として有用なので、それを別名として送る。関係性が無ければ「人物N」。
//
// 方針:
// - 別名は人物ごとに一意（同じ関係性が複数いたら連番を付ける）。回答側で確実に実名へ戻すため。
// - 置換は plain な文字列置換。長い名前/別名から先に置換して部分一致の取り違えを防ぐ。

export type AliasMap = {
  mask: (text: string) => string; // 実名 → 別名（送信前）
  unmask: (text: string) => string; // 別名 → 実名（表示前）
  aliasFor: (name: string) => string; // 単一の人物名を別名へ
};

// 人物が居ない・実名が無い場合は素通し（既存挙動と同じ）
export const identityAlias: AliasMap = {
  mask: (t) => t,
  unmask: (t) => t,
  aliasFor: (n) => n,
};

export function buildAliasMap(
  people: { name?: string; relation?: string }[],
  fallbackLabel = '人物',
): AliasMap {
  const used = new Set<string>();
  const pairs: { name: string; alias: string }[] = [];
  let generic = 0;

  for (const p of people) {
    const name = p.name?.trim();
    if (!name) continue;
    if (pairs.some((x) => x.name === name)) continue; // 同名は最初の1件だけ登録
    const base = p.relation?.trim() || `${fallbackLabel}${++generic}`;
    let alias = base;
    let n = 2;
    while (used.has(alias)) alias = `${base}${n++}`; // 別名の一意性を担保
    used.add(alias);
    pairs.push({ name, alias });
  }

  if (pairs.length === 0) return identityAlias;

  // 置換は長い文字列から（「田中」と「田中美咲」のような部分一致の取り違えを防ぐ）
  const byNameLen = [...pairs].sort((a, b) => b.name.length - a.name.length);
  const byAliasLen = [...pairs].sort((a, b) => b.alias.length - a.alias.length);

  return {
    aliasFor: (name) => pairs.find((x) => x.name === name?.trim())?.alias ?? name,
    mask: (text) => {
      if (!text) return text;
      let out = text;
      for (const { name, alias } of byNameLen) out = out.split(name).join(alias);
      return out;
    },
    unmask: (text) => {
      if (!text) return text;
      let out = text;
      for (const { name, alias } of byAliasLen) out = out.split(alias).join(name);
      return out;
    },
  };
}
