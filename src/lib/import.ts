// 他のAIアプリの正規エクスポートファイルを解析し、日時付きの記録に変換する。
// タイムスタンプはファイルに含まれる値をそのまま使うため、AIによる推測は行わない。

export type ImportedRecord = {
  date: string; // YYYY-MM-DD（端末のタイムゾーンで変換）
  text: string;
  source: string;
};

const MAX_TEXT_LENGTH = 300;
const MAX_RECORDS = 1000;

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

// ChatGPTエクスポート（conversations.json）: create_timeはUnix秒
function parseChatGpt(conversations: any[]): ImportedRecord[] {
  const records: ImportedRecord[] = [];
  for (const conv of conversations) {
    if (typeof conv?.create_time !== 'number' || !conv?.mapping) continue;
    const date = toLocalDateString(new Date(conv.create_time * 1000));

    // mappingから最初のユーザー発言を取り出す
    let firstUserText = '';
    let earliest = Infinity;
    for (const node of Object.values<any>(conv.mapping)) {
      const msg = node?.message;
      if (msg?.author?.role !== 'user') continue;
      const parts = msg?.content?.parts;
      const text = Array.isArray(parts) ? parts.filter((p: unknown) => typeof p === 'string').join(' ').trim() : '';
      if (!text) continue;
      const t = typeof msg.create_time === 'number' ? msg.create_time : Infinity;
      if (t < earliest) {
        earliest = t;
        firstUserText = text;
      }
    }

    const title = typeof conv.title === 'string' && conv.title.trim() ? conv.title.trim() : '';
    const body = firstUserText || title;
    if (!body) continue;
    records.push({
      date,
      text: truncate(title && firstUserText ? `【${title}】${firstUserText}` : body),
      source: 'ChatGPT',
    });
  }
  return records;
}

// Claudeエクスポート（conversations.json）: created_atはISO形式
function parseClaude(conversations: any[]): ImportedRecord[] {
  const records: ImportedRecord[] = [];
  for (const conv of conversations) {
    if (typeof conv?.created_at !== 'string' || !Array.isArray(conv?.chat_messages)) continue;
    const created = new Date(conv.created_at);
    if (Number.isNaN(created.getTime())) continue;

    const firstHuman = conv.chat_messages.find(
      (m: any) => m?.sender === 'human' && typeof m?.text === 'string' && m.text.trim(),
    );
    const title = typeof conv.name === 'string' && conv.name.trim() ? conv.name.trim() : '';
    const body = firstHuman?.text?.trim() || title;
    if (!body) continue;
    records.push({
      date: toLocalDateString(created),
      text: truncate(title && firstHuman ? `【${title}】${firstHuman.text}` : body),
      source: 'Claude',
    });
  }
  return records;
}

// 汎用: [{date|created_at|create_time, text|content|body}] 形式
function parseGeneric(items: any[]): ImportedRecord[] {
  const records: ImportedRecord[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const rawDate = item.date ?? item.created_at ?? item.create_time ?? item.timestamp;
    const rawText = item.text ?? item.content ?? item.body;
    if (typeof rawText !== 'string' || !rawText.trim()) continue;

    let d: Date | null = null;
    if (typeof rawDate === 'number') d = new Date(rawDate > 1e12 ? rawDate : rawDate * 1000);
    else if (typeof rawDate === 'string') d = new Date(rawDate);
    if (!d || Number.isNaN(d.getTime())) continue;

    records.push({ date: toLocalDateString(d), text: truncate(rawText), source: 'インポート' });
  }
  return records;
}

export function parseAiHistory(jsonText: string): ImportedRecord[] {
  // 展開後のJSON本文の上限。ZIP自体の上限（import-history側・100MB）とは別で、
  // JSON.parseのメモリ圧迫を防ぐための値
  if (jsonText.length > 30 * 1024 * 1024) {
    throw new Error('ファイルが大きすぎます（30MBまで対応）。');
  }

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('JSONとして読み取れませんでした。エクスポートファイルの中身（conversations.json）を貼り付けてください。');
  }

  const arr = Array.isArray(data) ? data : null;
  if (!arr || arr.length === 0) {
    throw new Error('会話データが見つかりませんでした。配列形式のJSONが必要です。');
  }

  let records: ImportedRecord[];
  if (arr[0]?.mapping !== undefined) {
    records = parseChatGpt(arr);
  } else if (arr[0]?.chat_messages !== undefined) {
    records = parseClaude(arr);
  } else {
    records = parseGeneric(arr);
  }

  if (records.length === 0) {
    throw new Error('日時とテキストを取り出せる会話がありませんでした。対応形式：ChatGPT / Claude のエクスポート、または date と text を持つJSON配列。');
  }

  return records
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX_RECORDS);
}
