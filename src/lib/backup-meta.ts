import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BackupPayload } from '@/lib/backup';

// クラウドバックアップの「見える化」用メタ情報と、復元前の安全退避。
// メタ情報は端末内にだけ保存する（サーバーには件数すら送らない方針を保つ）。
const META_KEY = 'memorytwin.cloudBackupMeta.v1';
const SNAPSHOT_KEY = 'memorytwin.preRestoreSnapshot.v1';

export type CloudBackupMeta = {
  at: string; // ISO日時
  journal: number;
  people: number;
  tasks: number;
};

export async function saveBackupMeta(payload: BackupPayload): Promise<void> {
  try {
    const meta: CloudBackupMeta = {
      at: new Date().toISOString(),
      journal: payload.journal.length,
      people: payload.people.length,
      tasks: payload.tasks?.length ?? 0,
    };
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // メタ情報は補助表示なので、保存に失敗してもバックアップ自体の成功は妨げない
  }
}

export async function getBackupMeta(): Promise<CloudBackupMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw) as CloudBackupMeta;
    return typeof meta?.at === 'string' ? meta : null;
  } catch {
    return null;
  }
}

// 復元は追記方式で既存データを消さないが、万一に備えて直前の状態を端末内へ丸ごと退避する。
// 最新1世代のみ保持（復元のたびに上書き）。写真はファイルURI参照のまま保存し、容量を抑える。
export async function savePreRestoreSnapshot(payload: BackupPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ at: new Date().toISOString(), ...payload }));
  } catch {
    // 端末容量不足などで退避に失敗しても、復元自体（追記方式）は安全に続行できる
  }
}
