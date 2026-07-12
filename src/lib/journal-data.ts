export type JournalEntry = {
  id: string;
  date: string;
  text: string;
  mood?: number; // 手入力の記録のみ。インポート記録には付かない
  sleepHours?: number;
  tags?: string[];
  source?: string; // 'ChatGPT' | 'Claude' など。手入力はundefined
  project?: string; // ユーザーが任意の名前で付けるプロジェクト分類。未分類はundefined
  sample?: boolean; // 表示言語に追従するデモデータ（sample-data.ts参照）
};

export const MOOD_EMOJIS = ['😞', '😕', '😐', '🙂', '😄'];
