export type Promise = {
  action: string;
  dueDate?: string;
  done: boolean;
};

export type Memo = {
  id: string;
  date: string;
  text: string;
  tags?: string[];
  promise?: Promise;
};

export const STALE_THRESHOLD_DAYS = 21;

export type Person = {
  id: string;
  name: string;
  relation: string;
  avatarEmoji: string;
  photoUri?: string; // 設定されていれば絵文字の代わりに写真を表示
  color?: string; // 関係性タグの色（未設定はテーマのprimary）
  birthday?: string;
  likes: string[];
  dislikes: string[];
  lastContact: string;
  place?: string;
  memos: Memo[];
  sample?: boolean; // 表示言語に追従するデモデータ。ユーザーが編集すると外れる（sample-data.ts参照）
};
