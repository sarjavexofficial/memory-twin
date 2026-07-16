import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { setAiResponseLanguage } from '@/lib/ai-language';
import { setAppTimeZone } from '@/lib/date';

const STORAGE_KEY = 'memory-twin:settings';

// 対応言語（翻訳辞書があるものだけ。ja/en は i18n.ts、他は src/lib/locales/ 配下）
export type Language = 'ja' | 'en' | 'zh' | 'ko' | 'fr' | 'pt';
export type ThemeName = 'dark' | 'light';
export type PlanKey = 'free' | 'standard' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';

// 旧プラン名(seed/grow/twin)で保存されている設定を新プランへ引き継ぐ
const LEGACY_PLAN_MAP: Record<string, PlanKey> = { seed: 'free', grow: 'standard', twin: 'pro' };

function normalizePlan(value: unknown): PlanKey {
  if (value === 'free' || value === 'standard' || value === 'pro') return value;
  if (typeof value === 'string' && LEGACY_PLAN_MAP[value]) return LEGACY_PLAN_MAP[value];
  return 'free';
}

// 各国の表示言語。翻訳辞書がある言語だけ指定し、他は英語（国際共通語）にする。
// 韓国語・中国語などの辞書を i18n.ts に追加したら、ここの値を差し替えるだけで対応国が増える。
const COUNTRY_LANGUAGE: Record<string, Language> = {
  'Asia/Tokyo': 'ja',
  'Asia/Seoul': 'ko',
  'Asia/Shanghai': 'zh',
  'Asia/Bangkok': 'en', // タイ語辞書の追加後に 'th' へ
  'Asia/Kolkata': 'en',
  'Europe/London': 'en',
  'Europe/Paris': 'fr',
  'Europe/Berlin': 'en', // ドイツ語辞書の追加後に 'de' へ
  'America/New_York': 'en',
  'America/Los_Angeles': 'en',
  'America/Sao_Paulo': 'pt',
  'Australia/Sydney': 'en',
};

// 住んでいる国に対応する言語。'auto'（端末設定に従う）のときは変更しない
function languageForCountry(tz: string): Language | null {
  if (tz === 'auto') return null;
  return COUNTRY_LANGUAGE[tz] ?? 'en';
}

type Settings = {
  aiLearningConsent: boolean;
  aiLearningConsentUpdatedAt?: string; // 同意履歴として変更日時を保持
  language: Language;
  theme: ThemeName;
  retentionOfferUsed?: Record<string, boolean>; // 解約時の半額オファーは各プラン1回限り
  currentPlan: PlanKey; // 課金実装前のデモ用プラン状態
  billingCycle?: BillingCycle; // 有料プランの支払いサイクル（未設定=月払い）
  hasSeenOnboarding?: boolean; // 初回起動時のオンボーディング表示済みフラグ
  aiConsentAt?: string; // 外部AI（Gemini）へのデータ送信に同意した日時。AI必須のためオンボーディング完了時に記録
  timezone?: string; // 住んでいる国のIANAタイムゾーン。'auto'=端末に従う
  proactiveNotify?: boolean; // AIからの能動メッセージを通知でも受け取る（初期OFF）
  notifyHour?: number; // 通知を受け取る時刻（その国の時刻・時のみ）
  appLock?: boolean; // 起動・復帰時にFace ID/パスコードを要求（初期OFF。iPhoneのみ有効）
  autoLearn?: boolean; // AIの理解ノートを自動更新する（Pro限定・初期OFF＝オプトイン）
  trialEndsAt?: string; // Pro無料体験の終了日時（購入すると消える。IAP導入時はストア側トライアルに置換）
  trialUsed?: boolean; // 無料体験は1回だけ
};

const DEFAULT_SETTINGS: Settings = {
  aiLearningConsent: false, // 企画書の要件: 初期OFF
  language: 'ja',
  theme: 'dark',
  currentPlan: 'free',
};

type SettingsContextValue = {
  settings: Settings;
  isLoaded: boolean;
  setAiLearningConsent: (value: boolean) => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeName) => void;
  markRetentionOfferUsed: (plan: string) => void;
  setCurrentPlan: (plan: PlanKey, cycle?: BillingCycle) => void;
  markOnboardingSeen: () => void;
  setTimezone: (tz: string) => void;
  setProactiveNotify: (value: boolean) => void;
  setNotifyHour: (hour: number) => void;
  setAppLock: (value: boolean) => void;
  setAutoLearn: (value: boolean) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Settings;
          const merged = { ...DEFAULT_SETTINGS, ...parsed, currentPlan: normalizePlan(parsed.currentPlan) };
          // Pro無料体験の期限切れ判定（購入するとtrialEndsAtは消えるので、残っている=未購入）
          if (merged.trialEndsAt && new Date(merged.trialEndsAt).getTime() < Date.now()) {
            merged.currentPlan = 'free';
            merged.trialEndsAt = undefined;
          }
          setSettings(merged);
          setAppTimeZone(parsed.timezone); // 日付計算を「住んでいる国」の時刻に合わせる
        }
      } catch {
        // 読み込み失敗時は初期値（すべてOFF）のまま
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, isLoaded]);

  // AIの返答言語を表示言語に追従させる（振り返り・検索などの出力が選択言語で返る）
  useEffect(() => {
    setAiResponseLanguage(settings.language);
  }, [settings.language]);

  function setAiLearningConsent(value: boolean) {
    setSettings((prev) => ({
      ...prev,
      aiLearningConsent: value,
      aiLearningConsentUpdatedAt: new Date().toISOString(),
    }));
  }

  function setLanguage(language: Language) {
    setSettings((prev) => ({ ...prev, language }));
  }

  function setTheme(theme: ThemeName) {
    setSettings((prev) => ({ ...prev, theme }));
  }

  function markRetentionOfferUsed(plan: string) {
    setSettings((prev) => ({
      ...prev,
      retentionOfferUsed: { ...prev.retentionOfferUsed, [plan]: true },
    }));
  }

  function setCurrentPlan(plan: PlanKey, cycle: BillingCycle = 'monthly') {
    // 無料プランに支払いサイクルは無いので月払い扱いに戻す。
    // プランを自分で選んだ時点で無料体験は終了扱い（購入または明示的なダウングレード）
    setSettings((prev) => ({
      ...prev,
      currentPlan: plan,
      billingCycle: plan === 'free' ? 'monthly' : cycle,
      trialEndsAt: undefined,
    }));
  }

  function markOnboardingSeen() {
    setSettings((prev) => {
      // 初回だけ7日間のPro無料体験を開始する（8日目に自動で無料プランへ）。
      // 良さを先に体験してもらう（2026-07-16 ゆず判断で無料先行リリースでも付与する。
      // 体験中はAI上限が月1500回になるが、サーバー側の端末150回/日・全体500回/日の
      // ガードが効いているため原価は暴走しない。7日後の自動ダウングレードは
      // 設定読み込み時のtrialEndsAt期限切れ判定が行う）
      const startTrial = !prev.trialUsed && prev.currentPlan === 'free';
      return {
        ...prev,
        hasSeenOnboarding: true,
        // AI必須のため、オンボーディング完了＝外部AI送信への情報提供済み同意として日時を記録
        aiConsentAt: prev.aiConsentAt ?? new Date().toISOString(),
        ...(startTrial
          ? {
              currentPlan: 'pro' as PlanKey,
              trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              trialUsed: true,
            }
          : {}),
      };
    });
  }

  function setAutoLearn(value: boolean) {
    setSettings((prev) => ({ ...prev, autoLearn: value }));
  }

  function setTimezone(tz: string) {
    setAppTimeZone(tz); // 以降の日付計算に即時反映
    // 住んでいる国に応じて表示言語も自動で合わせる（対応外の国は英語）
    const lang = languageForCountry(tz);
    setSettings((prev) => ({ ...prev, timezone: tz, ...(lang ? { language: lang } : {}) }));
  }

  function setProactiveNotify(value: boolean) {
    setSettings((prev) => ({ ...prev, proactiveNotify: value }));
  }

  function setNotifyHour(hour: number) {
    setSettings((prev) => ({ ...prev, notifyHour: hour }));
  }

  function setAppLock(value: boolean) {
    setSettings((prev) => ({ ...prev, appLock: value }));
  }

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoaded,
        setAiLearningConsent,
        setLanguage,
        setTheme,
        markRetentionOfferUsed,
        setCurrentPlan,
        markOnboardingSeen,
        setTimezone,
        setProactiveNotify,
        setNotifyHour,
        setAppLock,
        setAutoLearn,
      }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
