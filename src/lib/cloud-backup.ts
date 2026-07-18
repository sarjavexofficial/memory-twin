import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';

import { BackupPayload } from '@/lib/backup';
import { saveBackupMeta } from '@/lib/backup-meta';
import { getDeviceId } from '@/lib/device-id';

// 暗号化クラウドバックアップ（E2E方式・アカウント紐付け）:
// 合言葉から端末上で鍵を作り、全データを暗号化してからSupabaseへ1つの塊として保管する。
// - サーバーに渡るのは「暗号化済みの塊」と「アカウント＋合言葉から導出したID」だけ。合言葉も平文も送らない
// - 保管場所はサインイン中のアカウント（Apple/Google）ごとに分かれる。
//   他人が偶然同じ合言葉を選んでも、保管場所が別なので衝突・上書き・盗み見が起きない
// - 運営（Sarjavex）にも中身は読めない。合言葉を忘れると誰にも復元できない（そういう設計）
// - 機種変更後は、同じアカウントでサインインして同じ合言葉を入れるだけで復元できる

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export class CloudBackupConfigError extends Error {}
export class CloudBackupNotFoundError extends Error {}
export class CloudBackupDecryptError extends Error {}
export class CloudBackupRateLimitError extends Error {}

export const MIN_PASSPHRASE_LENGTH = 8;

// 明らかに推測されやすい合言葉を弾く（暗号の鍵そのものになるため）。
// 完全な強度判定ではなく「事故りやすい典型パターン」だけを対象にした軽いチェック
const COMMON_PASSPHRASES = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'qwerty123',
  'iloveyou',
  'sunshine',
  'aikotoba',
]);

export function isWeakPassphrase(passphrase: string): boolean {
  const p = passphrase.toLowerCase();
  if (/^(.)\1+$/.test(p)) return true; // 同じ文字の繰り返し（aaaaaaaa など）
  if (/^[0-9]+$/.test(p)) return true; // 数字のみ（誕生日・電話番号になりがち）
  if ('abcdefghijklmnopqrstuvwxyz'.includes(p) || '0123456789012345678901234567890'.includes(p))
    return true; // 連続文字（abcdefgh / 45678901 など）
  return COMMON_PASSPHRASES.has(p);
}

// 鍵導出の強度。純JS実装のため、古い端末でも数秒以内で終わる回数に抑えている
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;

// サインイン中のアカウント（auth-contextのAccountから必要な2項目だけ受け取る）
export type BackupAccount = { provider: string; userId: string };

// 保管場所のID: アカウント＋合言葉から一方向に導出する。
// アカウントIDが混ざるため、赤の他人と合言葉が同じでもIDは必ず別になる。
// 鍵とは別の導出（プレフィックス付き）なので、IDから鍵は割り出せない
function backupId(account: BackupAccount, passphrase: string): string {
  return bytesToHex(
    sha256(
      utf8ToBytes(
        `memory-twin-cloud-backup:${account.provider}:${account.userId}:${passphrase}`,
      ),
    ),
  );
}

function deriveKey(passphrase: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(passphrase), salt, { c: PBKDF2_ITERATIONS, dkLen: 32 });
}

// 暗号化: hex( salt || nonce || AES-256-GCM暗号文 ) を返す
function encrypt(passphrase: string, plaintext: string): string {
  const salt = Crypto.getRandomBytes(SALT_LENGTH);
  const nonce = Crypto.getRandomBytes(NONCE_LENGTH);
  const key = deriveKey(passphrase, salt);
  const ciphertext = gcm(key, nonce).encrypt(utf8ToBytes(plaintext));
  const packed = new Uint8Array(SALT_LENGTH + NONCE_LENGTH + ciphertext.length);
  packed.set(salt, 0);
  packed.set(nonce, SALT_LENGTH);
  packed.set(ciphertext, SALT_LENGTH + NONCE_LENGTH);
  return bytesToHex(packed);
}

function decrypt(passphrase: string, packedHex: string): string {
  const packed = hexToBytes(packedHex);
  const salt = packed.slice(0, SALT_LENGTH);
  const nonce = packed.slice(SALT_LENGTH, SALT_LENGTH + NONCE_LENGTH);
  const ciphertext = packed.slice(SALT_LENGTH + NONCE_LENGTH);
  const key = deriveKey(passphrase, salt);
  try {
    return bytesToUtf8(gcm(key, nonce).decrypt(ciphertext));
  } catch {
    // GCMの認証タグ不一致 = 合言葉が違う（またはデータ破損）
    throw new CloudBackupDecryptError('合言葉が違うか、データが破損しています。');
  }
}

async function callRpc(name: string, body: object): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new CloudBackupConfigError('クラウドバックアップの接続設定がまだ完了していません。');
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // サーバー側の1日あたり回数制限（悪用対策）に達した場合
    if (text.includes('rate limit')) {
      throw new CloudBackupRateLimitError('本日の利用回数の上限に達しました。');
    }
    throw new Error(`通信に失敗しました（${response.status}）: ${text.slice(0, 200)}`);
  }
  return response;
}

// バックアップ: 端末上で暗号化してからアップロード（同じアカウント＋同じ合言葉なら上書き保存）
export async function uploadCloudBackup(
  account: BackupAccount,
  passphrase: string,
  payload: BackupPayload,
): Promise<void> {
  const packed = encrypt(passphrase, JSON.stringify({ app: 'Memory Twin', ...payload }));
  await callRpc('put_backup', {
    backup_id: backupId(account, passphrase),
    payload: packed,
    device: await getDeviceId(), // サーバー側の回数制限（悪用対策）用の匿名ID
  });
  // 成功時のみ「最終バックアップ」の表示用メタを端末内に残す（手動・自動同期の両経路が通る）
  await saveBackupMeta(payload);
}

// 復元: アカウント＋合言葉からIDを導出して取得し、端末上で復号する
export async function downloadCloudBackup(
  account: BackupAccount,
  passphrase: string,
): Promise<BackupPayload> {
  const response = await callRpc('get_backup', {
    backup_id: backupId(account, passphrase),
    device: await getDeviceId(),
  });
  const packedHex = (await response.json().catch(() => null)) as string | null;
  if (!packedHex) throw new CloudBackupNotFoundError('この合言葉のバックアップは見つかりません。');
  const parsed = JSON.parse(decrypt(passphrase, packedHex)) as BackupPayload;
  return { people: parsed.people ?? [], journal: parsed.journal ?? [], tasks: parsed.tasks ?? [] };
}

// 削除（アカウント削除フローで使用）: アカウント＋合言葉からIDを導出し、その塊をサーバーから消す。
// 中身は元々ゼロ知識（運営も読めない）だが、本人が明示的に削除できる導線を用意する（Apple 5.1.1(v)対応）。
// 合言葉を知っている本人以外はIDを導出できないため、他人のバックアップは削除できない。
export async function deleteCloudBackup(
  account: BackupAccount,
  passphrase: string,
): Promise<void> {
  await callRpc('delete_backup', {
    backup_id: backupId(account, passphrase),
    device: await getDeviceId(),
  });
}
