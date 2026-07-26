import { Platform } from 'react-native';

import { JournalEntry } from '@/lib/journal-data';
import { Person } from '@/lib/mock-data';
import { UserTask } from '@/lib/task-data';

// エクスポートZIP・バックアップJSONの読み取り。
// 機械に詳しくない人でも「エクスポートしたファイルをそのまま選ぶだけ」で復元できるよう、
// ZIP（本アプリのエクスポート）/ data.json単体 / conversations.json のどれでも受け付けて自動判別する。

// tasksは0.1.6で追加。それ以前のバックアップには無いためオプショナルにして互換を保つ
export type BackupPayload = { people: Person[]; journal: JournalEntry[]; tasks?: UserTask[] };

export type PickedData =
  | { kind: 'backup'; backup: BackupPayload } // 本アプリの完全バックアップ → そのまま復元できる
  | { kind: 'text'; text: string }; // conversations.json 等のテキスト → 既存のインポート解析へ

function asBackup(parsed: unknown): BackupPayload | null {
  const p = parsed as { app?: string; people?: unknown; journal?: unknown; tasks?: unknown };
  if (p?.app === 'Memory Twin' && Array.isArray(p.people) && Array.isArray(p.journal)) {
    return {
      people: p.people as Person[],
      journal: p.journal as JournalEntry[],
      tasks: Array.isArray(p.tasks) ? (p.tasks as UserTask[]) : [],
    };
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

// ZIPの読み取りは import-stream.ts の流し読み（readExportFile / readExportBytes）に移した。
// 以前はここでZIPを丸ごとメモリに展開していたため、圧縮率の高いエクスポート
// （20MBのZIPが展開後1GB超になり得る）でアプリが落ちていた。

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
