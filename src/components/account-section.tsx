import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppPalette } from '@/constants/app-colors';
import { clearAiProfile } from '@/lib/ai-profile';
import { materializePhotos } from '@/lib/backup';
import { deleteCloudBackup, downloadCloudBackup } from '@/lib/cloud-backup';
import { clearCachedPassphrase, getCachedPassphrase } from '@/lib/cloud-sync-cache';
import { confirmAsync } from '@/lib/confirm';
import { FEATURES } from '@/lib/feature-flags';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { claimTrial } from '@/lib/trial';
import { Account, useAuth } from '@/store/auth-context';
import { useSettings } from '@/store/settings-context';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { useTasks } from '@/store/tasks-context';

// GoogleのOAuthクライアントID（Google Cloud Consoleで発行し .env / EASの環境変数に設定する）。
// クライアントIDは秘密情報ではなくアプリに埋め込まれる公開値なので、EXPO_PUBLIC_で扱う。
//
// 方式について: 以前は expo-auth-session（ブラウザ経由・カスタムURIスキーム）を使っていたが、
// Googleが「アプリのなりすましリスクのためカスタムURIスキームは今後サポートしない」と明記し、
// 自社SDKの利用を推奨したため、Google公式SDKを使う@react-native-google-signinへ移行した。
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
// GoogleのSDKはネイティブ実装のためWebでは動かない。iOSでIDが設定済みのときだけ出す
const googleConfigured = Platform.OS !== 'web' && Boolean(GOOGLE_IOS_CLIENT_ID);

// サインイン前に1度だけ初期化する（configureは同期・副作用のみ）
let googleConfigureDone = false;
function ensureGoogleConfigured() {
  if (googleConfigureDone || !googleConfigured) return;
  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    // webClientIdはidTokenをサーバーで検証したいとき用。今は端末内でしか使わないので任意
    ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
    scopes: ['email', 'profile'], // 本人識別に必要な最小限（Googleの審査が不要な範囲）
  });
  googleConfigureDone = true;
}

// 設定タブに置くアカウント欄。ログインは任意（未ログインでも全機能が使える）
export function AccountSection() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { account, saveAccount, signOut } = useAuth();
  const { clearAllPeople, restorePeople } = usePeople();
  const { clearAllEntries, restoreEntries } = useJournal();
  const { clearAllTasks, restoreTasks } = useTasks();
  const { settings, applyTrial, endTrial } = useSettings();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 7日間のPro無料体験が「今」始まったときだけ出すお祝いメッセージ
  const [trialMsg, setTrialMsg] = useState<string | null>(null);
  // アカウント削除フロー（Apple 5.1.1(v)対応）: 合言葉入力でクラウドも消せる
  const [showDelete, setShowDelete] = useState(false);
  const [deletePass, setDeletePass] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteDone, setDeleteDone] = useState<string | null>(null);
  // 自動クラウド同期: サインイン直後に、この端末に記憶済みの合言葉があれば静かに復元する
  const [autoSyncMsg, setAutoSyncMsg] = useState<string | null>(null);

  async function tryAutoSync(nextAccount: Account) {
    if (!FEATURES.autoCloudSync) return;
    const cached = await getCachedPassphrase(nextAccount);
    if (!cached) return; // この端末で合言葉を入力したことがない（初回サインイン等） → 何もしない
    try {
      const backup = await downloadCloudBackup(nextAccount, cached);
      const j = restoreEntries(backup.journal);
      const p = restorePeople(await materializePhotos(backup.people));
      const t = restoreTasks(backup.tasks ?? []);
      setAutoSyncMsg(L.backupRestored(j, p, t));
    } catch {
      // 通信失敗・合言葉変更済みなどは静かに諦める。Settings画面から手動でも復元できる
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    let cloudNote = '';
    try {
      // 合言葉が入っていればクラウドの塊も消す。失敗（合言葉違い・未設定等）でも端末側の削除は進める
      if (account && deletePass.trim()) {
        try {
          await deleteCloudBackup({ provider: account.provider, userId: account.userId }, deletePass.trim());
        } catch {
          cloudNote = L.deleteAccountCloudFailed;
        }
      }
      if (account) await clearCachedPassphrase(account);
      // アカウント削除ではGoogleとの連携自体を解除する（Apple 5.1.1(v)の趣旨に沿う）
      if (account?.provider === 'google' && googleConfigured) {
        try {
          await GoogleSignin.revokeAccess();
        } catch {
          // 連携解除に失敗しても端末側の削除は進める
        }
      }
      clearAllPeople();
      clearAllEntries();
      clearAllTasks();
      await clearAiProfile();
      signOut();
      endTrial();
      setShowDelete(false);
      setDeletePass('');
      setDeleteDone(cloudNote ? `${L.deleteAccountDone} ${cloudNote}` : L.deleteAccountDone);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    }
  }, []);

  // 7日間のPro無料体験: サインイン済みアカウントに対して1回だけ付与する。
  // 「1回だけ」の判定はサーバー（Supabase claim_trial）に記録されるため、
  // 再インストール・端末変更・データ全削除でも同じアカウントには再付与されない。
  // 通信失敗時は静かに何もしない（サインイン直後や次回この画面を開いたときに再試行される）
  useEffect(() => {
    if (!FEATURES.proTrial) return; // 初回リリースでは体験を提供しない（feature-flags参照）
    if (!account || settings.trialUsed) return;
    let active = true;
    (async () => {
      const claim = await claimTrial(account);
      if (!claim || !active) return;
      applyTrial(claim.trialEndsAt);
      if (claim.granted && new Date(claim.trialEndsAt).getTime() > Date.now()) {
        setTrialMsg(L.trialStarted);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, settings.trialUsed]);

  async function handleAppleSignIn() {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      // 名前・メールはAppleの仕様で初回サインイン時しか渡されない
      const name = [credential.fullName?.familyName, credential.fullName?.givenName]
        .filter(Boolean)
        .join(' ');
      const nextAccount: Account = {
        provider: 'apple',
        userId: credential.user,
        name: name || undefined,
        email: credential.email ?? undefined,
        signedInAt: new Date().toISOString(),
      };
      saveAccount(nextAccount);
      tryAutoSync(nextAccount);
    } catch (e) {
      // ユーザー自身のキャンセルはエラー表示しない
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') setError(L.signInFailed);
    }
  }

  async function handleSignOut() {
    const proceed = await confirmAsync(L.signOutConfirmTitle, L.signOutConfirmMessage);
    if (!proceed) return;
    if (account) await clearCachedPassphrase(account);
    // Google側の記憶も消しておく（次回サインイン時にアカウント選択が出るようにする）
    if (account?.provider === 'google' && googleConfigured) {
      try {
        await GoogleSignin.signOut();
      } catch {
        // 失敗してもアプリ側のサインアウトは進める
      }
    }
    signOut();
    // 体験はアカウントに紐づく特典なので、サインアウトした端末では終了する
    // （同じアカウントで再サインインすれば残り日数がサーバーから復元される）
    endTrial();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{L.accountSection}</Text>
      <Text style={styles.desc}>{L.accountDesc}</Text>

      {deleteDone && (
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={15} color={AppColors.success} />
          <Text style={styles.doneText}>{deleteDone}</Text>
        </View>
      )}

      {autoSyncMsg && (
        <View style={styles.doneRow}>
          <Ionicons name="cloud-done-outline" size={15} color={AppColors.success} />
          <Text style={styles.doneText}>{autoSyncMsg}</Text>
        </View>
      )}

      {trialMsg && (
        <View style={styles.doneRow}>
          <Ionicons name="sparkles-outline" size={15} color={AppColors.success} />
          <Text style={styles.doneText}>{trialMsg}</Text>
        </View>
      )}

      {account ? (
        <>
          <View style={styles.signedInRow}>
            <Ionicons
              name={account.provider === 'apple' ? 'logo-apple' : 'logo-google'}
              size={16}
              color={AppColors.text}
            />
            <Text style={styles.signedInText}>
              {L.signedInAs(account.name || account.email || account.userId.slice(0, 12))}
            </Text>
          </View>
          <Pressable style={styles.outlineButton} onPress={handleSignOut}>
            <Text style={styles.outlineButtonText}>{L.signOutButton}</Text>
          </Pressable>

          {/* アカウント削除（Apple 5.1.1(v)）: 端末データ消去＋サインアウト＋任意でクラウド削除 */}
          {!showDelete ? (
            <Pressable onPress={() => setShowDelete(true)} hitSlop={6}>
              <Text style={styles.deleteLink}>{L.deleteAccountButton}</Text>
            </Pressable>
          ) : (
            <View style={styles.deletePanel}>
              <Text style={styles.deletePanelText}>{L.deleteAccountMessage}</Text>
              <TextInput
                value={deletePass}
                onChangeText={setDeletePass}
                placeholder={L.deleteAccountPassPlaceholder}
                placeholderTextColor={AppColors.muted}
                style={styles.deleteInput}
                secureTextEntry
                autoCapitalize="none"
                editable={!deleting}
              />
              <View style={styles.deleteButtonRow}>
                <Pressable
                  style={styles.deleteCancelButton}
                  onPress={() => setShowDelete(false)}
                  disabled={deleting}>
                  <Text style={styles.deleteCancelText}>{L.personCancel}</Text>
                </Pressable>
                <Pressable
                  style={[styles.deleteConfirmButton, deleting && { opacity: 0.6 }]}
                  onPress={handleDeleteAccount}
                  disabled={deleting}>
                  <Text style={styles.deleteConfirmText}>
                    {deleting ? L.savingButton : L.deleteAccountConfirm}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      ) : (
        <>
          {Platform.OS === 'ios' && appleAvailable ? (
            <Pressable style={styles.providerButton} onPress={handleAppleSignIn}>
              <Ionicons name="logo-apple" size={16} color={AppColors.background} />
              <Text style={styles.providerButtonText}>{L.signInWithApple}</Text>
            </Pressable>
          ) : (
            <Text style={styles.note}>{L.accountAppleNote}</Text>
          )}
          {googleConfigured ? (
            <GoogleSignInButton
              onDone={(nextAccount) => {
                saveAccount(nextAccount);
                tryAutoSync(nextAccount);
              }}
              onError={() => setError(L.signInFailed)}
              label={L.signInWithGoogle}
            />
          ) : (
            <Text style={styles.note}>{L.accountGoogleNotConfigured}</Text>
          )}
          {/* 未使用アカウントへの特典案内（付与判定はサーバーが行う。体験の提供中のみ表示） */}
          {FEATURES.proTrial && !settings.trialUsed && (
            <Text style={styles.note}>{L.accountTrialNote}</Text>
          )}
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

// Googleサインイン。クライアントID設定時のみマウントされる。
// Google公式SDKが標準のサインインシートを出すので、本人情報はその戻り値から取れる
// （以前のようにアクセストークンでuserinfoを叩く通信は不要になった）
function GoogleSignInButton({
  onDone,
  onError,
  label,
}: {
  onDone: (account: Account) => void;
  onError: () => void;
  label: string;
}) {
  const { styles, AppColors } = useTheme(themed);
  const [busy, setBusy] = useState(false);

  async function handlePress() {
    setBusy(true);
    try {
      ensureGoogleConfigured();
      const response = await GoogleSignin.signIn();
      // ユーザー自身がやめた場合はエラー表示しない
      if (response.type !== 'success') return;
      const { user } = response.data;
      if (!user.id) throw new Error('no id');
      onDone({
        provider: 'google',
        userId: user.id,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        signedInAt: new Date().toISOString(),
      });
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={[styles.providerButton, busy && { opacity: 0.5 }]}
      disabled={busy}
      onPress={handlePress}>
      <Ionicons name="logo-google" size={16} color={AppColors.background} />
      <Text style={styles.providerButtonText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
      gap: 10,
    },
    cardTitle: { fontSize: 14, fontWeight: '800', color: AppColors.accent },
    desc: { fontSize: 12, color: AppColors.muted, lineHeight: 18 },
    providerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: AppColors.text,
      borderRadius: 12,
      paddingVertical: 12,
      minHeight: 46,
    },
    providerButtonText: { color: AppColors.background, fontWeight: '800', fontSize: 14 },
    signedInRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    signedInText: { fontSize: 14, fontWeight: '700', color: AppColors.text, flex: 1 },
    outlineButton: {
      borderWidth: 1.5,
      borderColor: AppColors.line,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
      minHeight: 42,
    },
    outlineButtonText: { color: AppColors.muted, fontWeight: '700', fontSize: 13 },
    note: { fontSize: 11, color: AppColors.muted, lineHeight: 16 },
    error: { fontSize: 12, color: AppColors.danger },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    doneText: { flex: 1, fontSize: 12, color: AppColors.success, fontWeight: '600', lineHeight: 17 },
    deleteLink: { fontSize: 12, color: AppColors.danger, fontWeight: '700', textAlign: 'center', paddingVertical: 6 },
    deletePanel: {
      borderWidth: 1,
      borderColor: AppColors.danger,
      borderRadius: 12,
      padding: 12,
      gap: 10,
      backgroundColor: AppColors.dangerSoft,
    },
    deletePanelText: { fontSize: 12, color: AppColors.text, lineHeight: 18 },
    deleteInput: {
      borderWidth: 1,
      borderColor: AppColors.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 42,
      fontSize: 14,
      color: AppColors.text,
      backgroundColor: AppColors.background,
    },
    deleteButtonRow: { flexDirection: 'row', gap: 10 },
    deleteCancelButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: AppColors.line,
      borderRadius: 10,
      paddingVertical: 10,
      minHeight: 42,
    },
    deleteCancelText: { color: AppColors.muted, fontWeight: '700', fontSize: 13 },
    deleteConfirmButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: AppColors.danger,
      borderRadius: 10,
      paddingVertical: 10,
      minHeight: 42,
    },
    deleteConfirmText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  });

const themed = makeThemed(makeStyles);
