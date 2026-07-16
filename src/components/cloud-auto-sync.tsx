import { useEffect, useRef } from 'react';

import { uploadCloudBackup } from '@/lib/cloud-backup';
import { getCachedPassphrase } from '@/lib/cloud-sync-cache';
import { embedPhotos } from '@/lib/export';
import { FEATURES } from '@/lib/feature-flags';
import { useAuth } from '@/store/auth-context';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { useTasks } from '@/store/tasks-context';

// 自動クラウド同期（アップロード側）。手動の「バックアップ」/「復元」を1回でも行うと
// 合言葉が端末に記憶され（cloud-sync-cache.ts）、以後は記録が変わるたびに、少し間を置いてから
// このコンポーネントが黙ってクラウドへ再アップロードする。手動ボタンは引き続きそのまま使える。
// サーバー側の1日あたり回数制限（put_backup: 5回/日）に収まるよう、変更直後ではなく一定時間の
// デバウンス後にのみ送信する。合言葉が記憶されていない（未サインイン・未同期）場合は何もしない。
const DEBOUNCE_MS = 8000;

export function CloudAutoSync() {
  const { account } = useAuth();
  const { people } = usePeople();
  const { entries } = useJournal();
  const { tasks } = useTasks();

  const accountRef = useRef(account);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  // 起動直後の初回ロードでは動かさず、実際にデータが変化したときだけ反応させる
  const isFirstRun = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (!FEATURES.autoCloudSync) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const acc = accountRef.current;
      if (!acc) return;
      const cached = await getCachedPassphrase(acc);
      if (!cached) return;
      try {
        await uploadCloudBackup(acc, cached, {
          people: await embedPhotos(people),
          journal: entries,
          tasks,
        });
      } catch {
        // 通信失敗・本日の回数上限などは静かに諦める。次の変更時か手動操作でまた試せる
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, entries, tasks]);

  return null;
}
