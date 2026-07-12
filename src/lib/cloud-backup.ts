import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import * as Crypto from 'expo-crypto';

import { BackupPayload } from '@/lib/backup';

// 暗号化クラウドバックアップ（E2E方式）:
// 合言葉から端末上で鍵を作り、全データを暗号化してからSupabaseへ1つの塊として保管する。
// - サーバーに渡るのは「暗号化済みの塊」と「合言葉から導出したID」だけ。合言葉も平文も送らない
// - 運営（Sarjavex）にも中身は読めない。合言葉を忘れると誰にも復元できない（そういう設計）
// - 機種変更後は、新しい端末で同じ合言葉を入れるだけで復元できる

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export class CloudBackupConfigError extends Error {}
export class CloudBackupNotFoundError extends Error {}
export class CloudBackupDecryptError extends Error {}

export const MIN_PASSPHRASE_LENGTH = 8;

// 鍵導出の強度。純JS実装のため、古い端末でも数秒以内で終わる回数に抑えている
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;

// 保管場所のID: 合言葉から一方向に導出する（合言葉を知る人だけが同じIDへ辿り着ける）。
// 鍵とは別の導出（プレフィックス付き）なので、IDから鍵は割り出せない
function backupId(passphrase: string): string {
  return bytesToHex(sha256(utf8ToBytes(`memory-twin-cloud-backup:${passphrase}`)));
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
    throw new Error(`通信に失敗しました（${response.status}）: ${text.slice(0, 200)}`);
  }
  return response;
}

// バックアップ: 端末上で暗号化してからアップロード（同じ合言葉なら上書き保存）
export async function uploadCloudBackup(passphrase: string, payload: BackupPayload): Promise<void> {
  const packed = encrypt(passphrase, JSON.stringify({ app: 'Memory Twin', ...payload }));
  await callRpc('put_backup', { backup_id: backupId(passphrase), payload: packed });
}

// 復元: 合言葉からIDを導出して取得し、端末上で復号する
export async function downloadCloudBackup(passphrase: string): Promise<BackupPayload> {
  const response = await callRpc('get_backup', { backup_id: backupId(passphrase) });
  const packedHex = (await response.json().catch(() => null)) as string | null;
  if (!packedHex) throw new CloudBackupNotFoundError('この合言葉のバックアップは見つかりません。');
  const parsed = JSON.parse(decrypt(passphrase, packedHex)) as BackupPayload;
  return { people: parsed.people ?? [], journal: parsed.journal ?? [] };
}
