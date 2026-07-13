// 自分のタスク: 「何年何月何日までにこれをやる」とユーザー自身が期限を決めて登録するもの。
// AIが記録から拾う「約束」(Memo.promise) と違い、人物にも記録にも紐づかず単独で存在できる。
// Today Recallでは約束より優先して表示される（自分で決めた期限が最優先）。

export type UserTask = {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  personId?: string; // 関係する人物（任意）。人物が削除されても タスクは残る
  done: boolean;
  doneAt?: string; // YYYY-MM-DD 完了した日（「今年のあなた」の年別集計に使う）
  createdAt: string; // YYYY-MM-DD
};
