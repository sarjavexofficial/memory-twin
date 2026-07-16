import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { BackupAccount } from '@/lib/cloud-backup';

// 合言葉の端末内キャッシュ（自動クラウド同期用）。
// 通常のクラウドバックアップは合言葉を一切保存しないゼロ知識設計だが、
// 「サインインしたら自動で同期する」体験のためには、本人が一度入力した合言葉を
// 端末のSecure Storage（Keychain/Keystore、OSレベルで暗号化）にだけ、明示的なキャッシュとして保持する。
// サーバー側の設計（合言葉を送らない・運営が復号できない）はこれまでと変わらない。
// SecureStoreはWebで利用できないため、Web版では常にキャッシュなし（毎回手入力）にフォールバックする。

function cacheKey(account: BackupAccount): string {
  return `memory-twin:cloud-pass:${account.provider}:${account.userId}`;
}

export async function getCachedPassphrase(account: BackupAccount): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(cacheKey(account));
  } catch {
    return null;
  }
}

export async function saveCachedPassphrase(account: BackupAccount, passphrase: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(cacheKey(account), passphrase);
  } catch {
    // 端末のSecure Storageが使えない場合は諦める（自動同期がオフになるだけで手動操作は引き続き可能）
  }
}

export async function clearCachedPassphrase(account: BackupAccount): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(cacheKey(account));
  } catch {
    // 元々存在しない場合も含めて無視してよい
  }
}
