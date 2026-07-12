import JSZip from 'jszip';
import { Platform, Share } from 'react-native';

import { todayLocal } from '@/lib/date';
import { JournalEntry, MOOD_EMOJIS } from '@/lib/journal-data';
import { Person } from '@/lib/mock-data';

// データエクスポート。ChatGPTやClaudeの正規エクスポートと同じ考え方で、
// 1つのZIPに「機械可読JSON」と「人がそのまま読めるHTML」を同梱して共有する。
//   - conversations.json … Claude互換形式。本アプリのインポート機能でも他ツールでも読める
//   - memories.html      … ブラウザで開けば読める記録一覧（印刷・PDF保存も可）
//   - data.json          … 全項目を欠けなく含む完全バックアップ（将来の復元用）

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Claude互換のconversations.json（created_at + chat_messages[sender/text]）。
// 標準形式に載らない項目（気分・睡眠など）は本文に含め、完全な復元はdata.jsonが担う
function buildConversationsJson(people: Person[], entries: JournalEntry[]): string {
  const conversations: object[] = [];

  for (const e of entries) {
    conversations.push({
      uuid: e.id,
      name: `日記 ${e.date}`,
      created_at: `${e.date}T12:00:00Z`,
      chat_messages: [
        { sender: 'human', text: e.text, created_at: `${e.date}T12:00:00Z` },
      ],
    });
  }

  for (const p of people) {
    for (const m of p.memos) {
      conversations.push({
        uuid: m.id,
        name: `${p.name}さんについてのメモ ${m.date}`,
        created_at: `${m.date}T12:00:00Z`,
        chat_messages: [
          { sender: 'human', text: `${p.name}: ${m.text}`, created_at: `${m.date}T12:00:00Z` },
        ],
      });
    }
  }

  conversations.sort((a, b) =>
    String((a as { created_at: string }).created_at).localeCompare(
      (b as { created_at: string }).created_at,
    ),
  );
  return JSON.stringify(conversations, null, 2);
}

// 人がそのまま読めるHTML（ChatGPTエクスポートのchat.html相当）
function buildHtml(people: Person[], entries: JournalEntry[]): string {
  const items: { date: string; html: string }[] = [];

  for (const e of entries) {
    const mood = e.mood ? `${MOOD_EMOJIS[e.mood - 1] ?? ''} ` : '';
    const meta = [
      e.sleepHours != null ? `睡眠${e.sleepHours}h` : null,
      e.source ? `出典: ${escapeHtml(e.source)}` : null,
      e.project ? `プロジェクト: ${escapeHtml(e.project)}` : null,
      e.tags?.length ? e.tags.map((t) => `#${escapeHtml(t)}`).join(' ') : null,
    ]
      .filter(Boolean)
      .join(' ・ ');
    items.push({
      date: e.date,
      html: `<article><h3>${mood}${e.date} <small>自分の日記</small></h3><p>${escapeHtml(e.text).replace(/\n/g, '<br>')}</p>${meta ? `<footer>${meta}</footer>` : ''}</article>`,
    });
  }

  for (const p of people) {
    for (const m of p.memos) {
      const promise = m.promise
        ? `<footer>約束: ${escapeHtml(m.promise.action)}${m.promise.dueDate ? `（${m.promise.dueDate}まで）` : ''}${m.promise.done ? ' ✅完了' : ''}</footer>`
        : '';
      items.push({
        date: m.date,
        html: `<article><h3>${m.date} <small>${escapeHtml(p.name)}さんについてのメモ</small></h3><p>${escapeHtml(m.text).replace(/\n/g, '<br>')}</p>${promise}</article>`,
      });
    }
  }

  items.sort((a, b) => b.date.localeCompare(a.date));

  const peopleRows = people
    .map(
      (p) =>
        `<li><strong>${p.avatarEmoji} ${escapeHtml(p.name)}</strong>（${escapeHtml(p.relation)}）${p.birthday ? ` ・ 誕生日 ${escapeHtml(p.birthday)}` : ''}${p.likes.length ? ` ・ 好き: ${p.likes.map(escapeHtml).join('、')}` : ''}</li>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Memory Twin エクスポート ${todayLocal()}</title>
<style>
  body { font-family: -apple-system, "Hiragino Sans", sans-serif; max-width: 720px; margin: 0 auto; padding: 24px; color: #1c2333; line-height: 1.7; }
  h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 32px; border-bottom: 2px solid #e5e8f0; padding-bottom: 6px; }
  article { border: 1px solid #e5e8f0; border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
  article h3 { font-size: 14px; margin: 0 0 6px; } article h3 small { color: #7a819a; font-weight: normal; margin-left: 6px; }
  article p { margin: 0; font-size: 14px; }
  article footer { margin-top: 8px; font-size: 12px; color: #7a819a; }
  ul { padding-left: 18px; } li { font-size: 14px; margin: 4px 0; }
  .note { font-size: 12px; color: #7a819a; }
</style>
</head>
<body>
<h1>Memory Twin エクスポート</h1>
<p class="note">書き出し日: ${todayLocal()} ・ 記録 ${entries.length}件 ・ 人物 ${people.length}人（メモ ${people.reduce((n, p) => n + p.memos.length, 0)}件）</p>
<h2>人物</h2>
<ul>${peopleRows || '<li>（登録なし）</li>'}</ul>
<h2>記録（新しい順）</h2>
${items.map((i) => i.html).join('\n')}
<p class="note">このファイルはMemory Twinから書き出されたものです。同梱の conversations.json はMemory Twinのインポート機能で再取り込みできます。</p>
</body>
</html>`;
}

// 人物写真をデータURIとしてJSONに埋め込む。写真は端末内のファイル参照でしか持っていないため、
// そのまま書き出すと機種変更後に写真だけ消える。埋め込めばZIPひとつで写真ごと復元できる
// （クラウドバックアップも同じ理由でこの処理を使う）
export async function embedPhotos(people: Person[]): Promise<Person[]> {
  return Promise.all(
    people.map(async (p) => {
      if (!p.photoUri || !p.photoUri.startsWith('file:')) return p;
      try {
        const { File } = await import('expo-file-system');
        const base64 = await new File(p.photoUri).base64();
        return { ...p, photoUri: `data:image/jpeg;base64,${base64}` };
      } catch {
        // 読めない写真は外して、記録本体のバックアップを優先する
        return { ...p, photoUri: undefined };
      }
    }),
  );
}

export async function exportAllData(people: Person[], entries: JournalEntry[]): Promise<void> {
  const peopleForExport = await embedPhotos(people);
  const fullBackup = JSON.stringify(
    { app: 'Memory Twin', exportedAt: new Date().toISOString(), people: peopleForExport, journal: entries },
    null,
    2,
  );

  const zip = new JSZip();
  zip.file('conversations.json', buildConversationsJson(people, entries));
  zip.file('memories.html', buildHtml(people, entries));
  zip.file('data.json', fullBackup);
  const fileName = `memory-twin-export-${todayLocal()}.zip`;

  if (Platform.OS === 'web') {
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // ネイティブ: 一時フォルダにZIPを書き出して共有シートを開く
  // （expo-file-system / expo-sharing はネイティブ専用のためここで動的に読み込む）
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, fileName);
  try {
    if (file.exists) file.delete();
  } catch {
    // 削除に失敗しても write が上書きを試みる
  }
  file.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/zip',
      dialogTitle: fileName,
    });
  } else {
    // 共有シートが使えない環境ではテキスト共有にフォールバック
    await Share.share({ message: fullBackup });
  }
}
