import JSZip from 'jszip';
import { Platform } from 'react-native';

import { JournalEntry } from '@/lib/journal-data';
import { Person } from '@/lib/mock-data';

// エクスポートZIP・バックアップJSONの読み取り。
// 機械に詳しくない人でも「エクスポートしたファイルをそのまま選ぶだけ」で復元できるよう、
// ZIP（本アプリのエクスポート）/ data.json単体 / conversations.json のどれでも受け付けて自動判別する。

export type BackupPayload = { people: Person[]; journal: JournalEntry[] };

export type PickedData =
  | { kind: 'backup'; backup: BackupPayload } // 本アプリの完全バックアップ → そのまま復元できる
  | { kind: 'text'; text: string }; // conversations.json 等のテキスト → 既存のインポート解析へ

function asBackup(parsed: unknown): BackupPayload | null {
  const p = parsed as { app?: string; people?: unknown; journal?: unknown };
  if (p?.app === 'Memory Twin' && Array.isArray(p.people) && Array.isArray(p.journal)) {
    return { people: p.people as Person[], journal: p.journal as JournalEntry[] };
  }
  return null;
}

// JSONテキストを判別する（完全バックアップならbackup、それ以外はtextとして返す）
export function classifyJsonText(text: string): PickedData {
  try {
    const backup = asBackup(JSON.parse(text));
    if (backup) return { kind: 'backup', backup };
  } catch {
    // JSONとして読めない場合もそのまま解析側に回す（エラーメッセージは解析側が出す）
  }
  return { kind: 'text', text };
}

// ZIPを開いて中身を判別する。dataはbase64文字列（ネイティブ）またはArrayBuffer（Web）
export async function readBackupZip(data: string | ArrayBuffer): Promise<PickedData> {
  const zip =
    typeof data === 'string'
      ? await JSZip.loadAsync(data, { base64: true })
      : await JSZip.loadAsync(data);

  // 本アプリのエクスポート: data.json（完全バックアップ）を最優先で読む
  const dataFile = zip.file('data.json');
  if (dataFile) {
    try {
      const backup = asBackup(JSON.parse(await dataFile.async('string')));
      if (backup) return { kind: 'backup', backup };
    } catch {
      // 壊れていたら conversations.json にフォールバック
    }
  }

  // ChatGPT/Claudeの公式エクスポートZIPにも対応（conversations.jsonがどの階層にあっても拾う）
  const conv = zip.file('conversations.json') ?? zip.file(/(^|\/)conversations\.json$/)[0];
  if (conv) return { kind: 'text', text: await conv.async('string') };

  throw new Error(
    'このZIPの中に読み取れるファイルが見つかりませんでした。Memory Twinのバックアップ、またはChatGPT/Claudeのエクスポートを選んでください。',
  );
}

// バックアップに埋め込まれた写真（データURI）を端末のファイルに書き戻す。
// AsyncStorageに巨大な画像文字列を残さないため、ネイティブでは実ファイル参照に変換する。
// Webはファイルシステムが無いのでデータURIのまま表示する（Imageはそのまま描画できる）
export async function materializePhotos(people: Person[]): Promise<Person[]> {
  if (Platform.OS === 'web') return people;
  const { File, Paths } = await import('expo-file-system');
  return Promise.all(
    people.map(async (p) => {
      if (!p.photoUri || !p.photoUri.startsWith('data:')) return p;
      try {
        const base64 = p.photoUri.split(',')[1] ?? '';
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File(Paths.document, `person-photo-${p.id}-${Date.now()}.jpg`);
        file.write(bytes);
        return { ...p, photoUri: file.uri };
      } catch {
        return { ...p, photoUri: undefined };
      }
    }),
  );
}
