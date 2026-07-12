import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppPalette } from '@/constants/app-colors';
import { confirmAsync } from '@/lib/confirm';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { Account, useAuth } from '@/store/auth-context';

// ブラウザ経由のOAuth（Google）から戻ってきたときにセッションを閉じる
WebBrowser.maybeCompleteAuthSession();

// GoogleのOAuthクライアントID（Google Cloud Consoleで発行し .env に設定する）
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleConfigured = Boolean(GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);

// 設定タブに置くアカウント欄。ログインは任意（未ログインでも全機能が使える）
export function AccountSection() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { account, saveAccount, signOut } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    }
  }, []);

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
      saveAccount({
        provider: 'apple',
        userId: credential.user,
        name: name || undefined,
        email: credential.email ?? undefined,
        signedInAt: new Date().toISOString(),
      });
    } catch (e) {
      // ユーザー自身のキャンセルはエラー表示しない
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') setError(L.signInFailed);
    }
  }

  async function handleSignOut() {
    const proceed = await confirmAsync(L.signOutConfirmTitle, L.signOutConfirmMessage);
    if (proceed) signOut();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{L.accountSection}</Text>
      <Text style={styles.desc}>{L.accountDesc}</Text>

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
              onDone={saveAccount}
              onError={() => setError(L.signInFailed)}
              label={L.signInWithGoogle}
            />
          ) : (
            <Text style={styles.note}>{L.accountGoogleNotConfigured}</Text>
          )}
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

// Googleサインイン。クライアントID設定時のみマウントされる（フックの条件呼び出しを避けるため分離）
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
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      // アクセストークンで本人情報（ID・名前・メール）だけを取得する
      fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${response.authentication.accessToken}` },
      })
        .then((r) => r.json())
        .then((u: { id?: string | number; name?: string; email?: string }) => {
          if (!u.id) throw new Error('no id');
          onDone({
            provider: 'google',
            userId: String(u.id),
            name: u.name,
            email: u.email,
            signedInAt: new Date().toISOString(),
          });
        })
        .catch(onError);
    } else if (response?.type === 'error') {
      onError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return (
    <Pressable
      style={[styles.providerButton, !request && { opacity: 0.5 }]}
      disabled={!request}
      onPress={() => promptAsync()}>
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
  });

const themed = makeThemed(makeStyles);
