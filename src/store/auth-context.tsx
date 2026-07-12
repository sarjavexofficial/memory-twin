import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

// アカウント（Apple / Google サインイン）。ログインは任意で、記録の保存先は変わらず端末内。
// 将来のクラウド同期・購入情報の引き継ぎの土台として、本人識別子だけを端末内に保持する
const STORAGE_KEY = 'memory-twin:account';

export type Account = {
  provider: 'apple' | 'google';
  userId: string; // プロバイダーが発行する本人ID（名前やメールが取れない場合もこれで識別できる）
  name?: string;
  email?: string;
  signedInAt: string;
};

type AuthContextValue = {
  account: Account | null;
  isLoaded: boolean;
  saveAccount: (account: Account) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setAccount(JSON.parse(raw) as Account);
      } catch {
        // 読み込み失敗時は未ログイン扱い
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  function saveAccount(next: Account) {
    setAccount(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function signOut() {
    setAccount(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ account, isLoaded, saveAccount, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
