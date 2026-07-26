// 他のAIアプリの正規エクスポートファイルを解析し、日時付きの記録に変換する。
// タイムスタンプはファイルに含まれる値をそのまま使うため、AIによる推測は行わない。
//
// ChatGPTのconversations.jsonは数百MBになることがあり、丸ごと文字列にして
// JSON.parseすると端末が落ちる。そのため「ファイルを1会話ずつ流し読みする」処理は
// import-stream.ts に置き、このファイルは
//   ①1件の会話 → 1件の記録への変換規則  ②上限つきの収集器
// を提供して、流し読みと貼り付け解析の両方から使えるようにしている。

export type ImportedRecord = {
  date: string; // YYYY-MM-DD（端末のタイムゾーンで変換）
  text: string;
  source: string;
};

const MAX_TEXT_LENGTH = 300;
export const MAX_RECORDS = 1000;

// 貼り付け入力の上限（手で貼れる量の想定）。
// ファイル選択の経路は流し読みなので、この上限に縛られない
const MAX_PASTE_LENGTH = 30 * 1024 * 1024;

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function truncate(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > MAX_TEXT_LENGTH ? `${cleaned.slice(0, MAX_TEXT_LENGTH)}…` : cleaned;
}

// ---- 形式の判定と、1件ずつの変換 ----
// 流し読みでは配列全体を持てないため、最初の1要素だけを見て形式を決める

export type ImportFormat = 'chatgpt' | 'claude' | 'generic';

export function detectFormat(first: unknown): ImportFormat {
  if (typeof first === 'object' && first !== null) {
    const o = first as { mapping?: unknown; chat_messages?: unknown };
    if (o.mapping !== undefined) return 'chatgpt';
    if (o.chat_messages !== undefined) return 'claude';
  }
  return 'generic';
}

// ChatGPTエクスポート（conversations.json）: create_timeはUnix秒
function fromChatGpt(conv: any): ImportedRecord | null {
  if (typeof conv?.create_time !== 'number' || !conv?.mapping) return null;
  const date = toLocalDateString(new Date(conv.create_time * 1000));

  // mappingから最初のユーザー発言を取り出す
  let firstUserText = '';
  let earliest = Infinity;
  for (const node of Object.values<any>(conv.mapping)) {
    const msg = node?.message;
    if (msg?.author?.role !== 'user') continue;
    const parts = msg?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.filter((p: unknown) => typeof p === 'string').join(' ').trim()
      : '';
    if (!text) continue;
    const t = typeof msg.create_time === 'number' ? msg.create_time : Infinity;
    if (t < earliest) {
      earliest = t;
      firstUserText = text;
    }
  }

  const title = typeof conv.title === 'string' && conv.title.trim() ? conv.title.trim() : '';
  const body = firstUserText || title;
  if (!body) return null;
  return {
    date,
    text: truncate(title && firstUserText ? `【${title}】${firstUserText}` : body),
    source: 'ChatGPT',
  };
}

// Claudeエクスポート（conversations.json）: created_atはISO形式
function fromClaude(conv: any): ImportedRecord | null {
  if (typeof conv?.created_at !== 'string' || !Array.isArray(conv?.chat_messages)) return null;
  const created = new Date(conv.created_at);
  if (Number.isNaN(created.getTime())) return null;

  const firstHuman = conv.chat_messages.find(
    (m: any) => m?.sender === 'human' && typeof m?.text === 'string' && m.text.trim(),
  );
  const title = typeof conv.name === 'string' && conv.name.trim() ? conv.name.trim() : '';
  const body = firstHuman?.text?.trim() || title;
  if (!body) return null;
  return {
    date: toLocalDateString(created),
    text: truncate(title && firstHuman ? `【${title}】${firstHuman.text}` : body),
    source: 'Claude',
  };
}

// 汎用: [{date|created_at|create_time, text|content|body}] 形式
function fromGeneric(item: any): ImportedRecord | null {
  if (typeof item !== 'object' || item === null) return null;
  const rawDate = item.date ?? item.created_at ?? item.create_time ?? item.timestamp;
  const rawText = item.text ?? item.content ?? item.body;
  if (typeof rawText !== 'string' || !rawText.trim()) return null;

  let d: Date | null = null;
  if (typeof rawDate === 'number') d = new Date(rawDate > 1e12 ? rawDate : rawDate * 1000);
  else if (typeof rawDate === 'string') d = new Date(rawDate);
  if (!d || Number.isNaN(d.getTime())) return null;

  return { date: toLocalDateString(d), text: truncate(rawText), source: 'インポート' };
}

export function recordFromItem(item: unknown, format: ImportFormat): ImportedRecord | null {
  if (format === 'chatgpt') return fromChatGpt(item);
  if (format === 'claude') return fromClaude(item);
  return fromGeneric(item);
}

// ---- 上限つきの収集器 ----
// 全件を配列に積んでから並べ替えて切り詰めると、数十万会話のエクスポートで
// メモリが破裂する。常に「新しい順に最大MAX_RECORDS件」だけを保持する。

export class TopRecords {
  private items: ImportedRecord[] = [];

  constructor(private readonly limit = MAX_RECORDS) {}

  add(record: ImportedRecord): void {
    const last = this.items[this.items.length - 1];
    // 満杯で、いちばん古い保持分より古いなら見るまでもなく捨てる（大半がここで終わる）
    if (this.items.length >= this.limit && last && record.date <= last.date) return;
    // date降順を保ったまま二分探索で挿入する
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid].date > record.date) lo = mid + 1;
      else hi = mid;
    }
    this.items.splice(lo, 0, record);
    if (this.items.length > this.limit) this.items.pop();
  }

  get count(): number {
    return this.items.length;
  }

  toArray(): ImportedRecord[] {
    return this.items;
  }
}

export const NO_RECORDS_MESSAGE =
  '日時とテキストを取り出せる会話がありませんでした。対応形式：ChatGPT / Claude のエクスポート、または date と text を持つJSON配列。';

// ---- 貼り付けテキストの解析（ファイル選択は import-stream.ts の流し読みを使う） ----

export function parseAiHistory(jsonText: string): ImportedRecord[] {
  if (jsonText.length > MAX_PASTE_LENGTH) {
    throw new Error(
      '貼り付けたテキストが大きすぎます（30MBまで）。大きなエクスポートは「ファイルを選ぶ」から取り込んでください（サイズの制限はありません）。',
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error(
      'JSONとして読み取れませんでした。エクスポートファイルの中身（conversations.json）を貼り付けてください。',
    );
  }

  const arr = Array.isArray(data) ? data : null;
  if (!arr || arr.length === 0) {
    throw new Error('会話データが見つかりませんでした。配列形式のJSONが必要です。');
  }

  const format = detectFormat(arr[0]);
  const top = new TopRecords();
  for (const item of arr) {
    const record = recordFromItem(item, format);
    if (record) top.add(record);
  }

  if (top.count === 0) throw new Error(NO_RECORDS_MESSAGE);
  return top.toArray();
}
