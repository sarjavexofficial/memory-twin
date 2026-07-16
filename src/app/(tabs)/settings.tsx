import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountSection } from '@/components/account-section';
import { AiSendNote } from '@/components/ai-send-note';
import { GlowBackground, GradientButton, TitleAccent } from '@/components/futuristic';
import { AppPalette } from '@/constants/app-colors';
import { AiConfigError, learnUserProfile } from '@/lib/ai';
import {
  AiProfile,
  buildLearningExcerpts,
  buildLearningStats,
  clearAiProfile,
  countLearnableRecords,
  getAiProfile,
  isProfileStale,
  saveAiProfile,
} from '@/lib/ai-profile';
import { getAiUsage, PLAN_AI_LIMITS } from '@/lib/ai-usage';
import { materializePhotos } from '@/lib/backup';
import {
  CloudBackupDecryptError,
  CloudBackupNotFoundError,
  CloudBackupRateLimitError,
  downloadCloudBackup,
  isWeakPassphrase,
  MIN_PASSPHRASE_LENGTH,
  uploadCloudBackup,
} from '@/lib/cloud-backup';
import { clearCachedPassphrase, getCachedPassphrase, saveCachedPassphrase } from '@/lib/cloud-sync-cache';
import { confirmAsync } from '@/lib/confirm';
import { FEATURES } from '@/lib/feature-flags';
import { candidateMessage, previewBestCandidate } from '@/lib/daily-message';
import {
  cancelProactiveNotifications,
  requestNotifyPermission,
  scheduleProactiveMessage,
} from '@/lib/notifications';
import { embedPhotos, exportAllData } from '@/lib/export';
import { LANGUAGE_OPTIONS, useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { useAuth } from '@/store/auth-context';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { ThemeName, useSettings } from '@/store/settings-context';
import { useTasks } from '@/store/tasks-context';

// 運営への問い合わせ先（メールが開けない端末でも読めるよう、画面上にも表示する）
const SUPPORT_EMAIL = 'sarjavex.official@gmail.com';

function formatConsentDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SettingsScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { people, clearAllPeople, restorePeople } = usePeople();
  const { entries, clearAllEntries, restoreEntries } = useJournal();
  const { tasks, clearAllTasks, restoreTasks } = useTasks();
  const {
    settings,
    setAiLearningConsent,
    setLanguage,
    setTheme,
    setTimezone,
    setProactiveNotify,
    setNotifyHour,
    setAppLock,
    setAutoLearn,
  } = useSettings();

  const THEMES: { key: ThemeName; label: string }[] = [
    { key: 'dark', label: L.themeDark },
    { key: 'light', label: L.themeLight },
  ];
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [contactErr, setContactErr] = useState<string | null>(null);
  const [aiUsedCount, setAiUsedCount] = useState<number | null>(null);

  // AIの理解ノート（使うほどAIが本人を学ぶ機能）の状態
  const [aiProfile, setAiProfile] = useState<AiProfile | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [learnError, setLearnError] = useState<string | null>(null);

  // 他画面でAIを使った後も最新の回数を見せるため、タブを開くたびに読み直す
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAiUsage().then((usage) => {
        if (active) setAiUsedCount(usage.count);
      });
      getAiProfile().then((p) => {
        if (active) setAiProfile(p);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const recordCount = entries.length + people.reduce((sum, p) => sum + p.memos.length, 0);
  const consentDate = formatConsentDate(settings.aiLearningConsentUpdatedAt);

  // AIからの話しかけ（通知）設定
  const NOTIFY_HOURS = [7, 8, 9, 21];
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifyInfo, setNotifyInfo] = useState<string | null>(null);

  async function rescheduleNotification(hour: number) {
    const candidate = await previewBestCandidate(people, entries, tasks.length > 0);
    if (candidate) {
      await scheduleProactiveMessage(candidateMessage(candidate, L), hour);
      setNotifyInfo(L.notifyScheduled(hour));
    } else {
      await cancelProactiveNotifications();
      setNotifyInfo(null);
    }
  }

  async function handleToggleNotify(next: boolean) {
    setNotifyError(null);
    setNotifyInfo(null);
    if (!next) {
      setProactiveNotify(false);
      await cancelProactiveNotifications();
      return;
    }
    if (Platform.OS === 'web') {
      setNotifyError(L.notifyWebNote);
      return;
    }
    const granted = await requestNotifyPermission();
    if (!granted) {
      setNotifyError(L.notifyPermissionDenied);
      return;
    }
    setProactiveNotify(true);
    await rescheduleNotification(settings.notifyHour ?? 8);
  }

  async function handleSelectNotifyHour(hour: number) {
    setNotifyHour(hour);
    if (settings.proactiveNotify && Platform.OS !== 'web') {
      await rescheduleNotification(hour);
    }
  }

  const privacyItems = [
    { icon: 'phone-portrait-outline' as const, title: L.privacyLocalTitle, desc: L.privacyLocalDesc },
    { icon: 'sparkles-outline' as const, title: L.privacyAiTitle, desc: L.privacyAiDesc },
    { icon: 'megaphone-outline' as const, title: L.privacyAdsTitle, desc: L.privacyAdsDesc },
  ];

  // アプリロック(Face ID/パスコード)。ONにする前に、この端末で本人確認が使えるかを確かめる
  const [appLockErr, setAppLockErr] = useState<string | null>(null);

  async function handleToggleAppLock(next: boolean) {
    setAppLockErr(null);
    if (!next) {
      setAppLock(false);
      return;
    }
    if (Platform.OS === 'web') {
      setAppLockErr(L.appLockWebNote);
      return;
    }
    // 生体認証が未登録でも端末パスコードがあれば認証は成立するため、レベルで判定する
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      setAppLockErr(L.appLockUnavailable);
      return;
    }
    setAppLock(true);
  }

  async function handleToggleAiLearning(next: boolean) {
    if (next) {
      const proceed = await confirmAsync(L.consentEnableTitle, L.consentEnableMessage);
      if (!proceed) return;
      setAiLearningConsent(true);
    } else {
      const proceed = await confirmAsync(L.consentDisableTitle, L.consentDisableMessage);
      if (!proceed) return;
      setAiLearningConsent(false);
    }
  }

  async function handleExport() {
    setExportDone(false);
    setExportError(null);
    try {
      await exportAllData(people, entries, tasks);
      setExportDone(true);
    } catch {
      setExportError(L.exportFailed);
    }
  }

  // 暗号化クラウドバックアップ（合言葉ベースのE2E方式・アカウント紐付け。cloud-backup.ts参照）
  // 保管場所をアカウントごとに分けるため、サインイン中のみ利用できる
  const { account } = useAuth();
  const [cloudPass, setCloudPass] = useState('');
  // 合言葉は打ち間違えると復元できないため、入力内容を目視確認できる表示切替を付ける
  const [showCloudPass, setShowCloudPass] = useState(false);
  const [cloudBusy, setCloudBusy] = useState<'save' | 'restore' | null>(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  const [cloudErr, setCloudErr] = useState<string | null>(null);
  // 自動クラウド同期: 一度手動でバックアップ/復元に成功した合言葉を端末に記憶しているかどうか
  const [passRemembered, setPassRemembered] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (FEATURES.autoCloudSync && account) {
        getCachedPassphrase(account).then((cached) => {
          if (active) setPassRemembered(!!cached);
        });
      } else {
        setPassRemembered(false);
      }
      return () => {
        active = false;
      };
    }, [account]),
  );

  async function handleForgetCloudPass() {
    if (!account) return;
    await clearCachedPassphrase(account);
    setPassRemembered(false);
  }

  async function handleCloudBackup() {
    const pass = cloudPass.trim();
    setCloudMsg(null);
    setCloudErr(null);
    if (!account) {
      setCloudErr(L.cloudBackupNeedSignIn);
      return;
    }
    if (pass.length < MIN_PASSPHRASE_LENGTH) {
      setCloudErr(L.cloudBackupTooShort);
      return;
    }
    // 合言葉がそのまま暗号鍵になるため、推測されやすいものは保存前に弾く
    if (isWeakPassphrase(pass)) {
      setCloudErr(L.cloudBackupWeakPass);
      return;
    }
    setCloudBusy('save');
    try {
      // 写真もデータとして埋め込んでから暗号化する（ZIPエクスポートと同じ扱い）
      await uploadCloudBackup(account, pass, {
        people: await embedPhotos(people),
        journal: entries,
        tasks,
      });
      if (FEATURES.autoCloudSync) {
        await saveCachedPassphrase(account, pass);
        setPassRemembered(true);
      }
      setCloudMsg(L.cloudBackupSaved);
    } catch (e) {
      if (e instanceof CloudBackupRateLimitError) setCloudErr(L.cloudBackupRateLimited);
      else setCloudErr((e as Error).message);
    } finally {
      setCloudBusy(null);
    }
  }

  async function handleCloudRestore() {
    const pass = cloudPass.trim();
    setCloudMsg(null);
    setCloudErr(null);
    if (!account) {
      setCloudErr(L.cloudBackupNeedSignIn);
      return;
    }
    if (pass.length < MIN_PASSPHRASE_LENGTH) {
      setCloudErr(L.cloudBackupTooShort);
      return;
    }
    setCloudBusy('restore');
    try {
      const backup = await downloadCloudBackup(account, pass);
      // ZIPからの復元と同じ経路: 既存データに追加され、同じIDは重複しない
      const j = restoreEntries(backup.journal);
      const p = restorePeople(await materializePhotos(backup.people));
      const t = restoreTasks(backup.tasks ?? []);
      if (FEATURES.autoCloudSync) {
        await saveCachedPassphrase(account, pass);
        setPassRemembered(true);
      }
      setCloudMsg(L.backupRestored(j, p, t));
    } catch (e) {
      if (e instanceof CloudBackupNotFoundError) setCloudErr(L.cloudBackupNotFound);
      else if (e instanceof CloudBackupDecryptError) setCloudErr(L.cloudBackupWrongPass);
      else if (e instanceof CloudBackupRateLimitError) setCloudErr(L.cloudBackupRateLimited);
      else setCloudErr((e as Error).message);
    } finally {
      setCloudBusy(null);
    }
  }

  // お問い合わせ: 標準メール→Gmailアプリ→共有シートの順に試す。
  // メールアプリ未設定のiPhoneでも、どれかの経路で必ずアドレスに辿り着けるようにする
  async function handleContact() {
    setContactErr(null);
    if (Platform.OS === 'web') {
      // ブラウザは「メーラーが開けたか」を検知できないため、開く試みと合わせて常にコピー案内を出す
      try {
        window.location.href = `mailto:${SUPPORT_EMAIL}`;
      } catch {
        // mailtoがブロックされても下の案内文で連絡先には辿り着ける
      }
      setContactErr(L.contactMailFailed);
      return;
    }
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
      return;
    } catch {
      // 標準メールが未設定（Mailアプリ削除済みなど）
    }
    try {
      await Linking.openURL(`googlegmail://co?to=${SUPPORT_EMAIL}`);
      return;
    } catch {
      // Gmailアプリも入っていない
    }
    try {
      await Share.share({ message: SUPPORT_EMAIL });
    } catch {
      setContactErr(L.contactMailFailed);
    }
  }

  // 学習の材料はai-profile.tsの共通ロジックで作る（自動学習と同じ・サンプルデータ除外）
  const learnableCount = useMemo(() => countLearnableRecords(people, entries), [people, entries]);

  async function handleLearnProfile() {
    setLearnError(null);
    setIsLearning(true);
    try {
      // 前回の理解を渡して「上書き」ではなく「育てる」。学習のたびに理解が積み上がる
      const summary = await learnUserProfile(
        buildLearningExcerpts(people, entries),
        buildLearningStats(people, entries),
        aiProfile?.summary ?? null,
        settings.language,
      );
      setAiProfile(await saveAiProfile(summary, learnableCount));
      getAiUsage().then((usage) => setAiUsedCount(usage.count));
    } catch (e) {
      setLearnError(e instanceof AiConfigError ? e.message : (e as Error).message);
    } finally {
      setIsLearning(false);
    }
  }

  async function handleClearProfile() {
    const proceed = await confirmAsync(L.aiProfileClearTitle, L.aiProfileClearMessage);
    if (!proceed) return;
    await clearAiProfile();
    setAiProfile(null);
  }

  async function handleDeleteAll() {
    const proceed = await confirmAsync(L.deleteAllTitle, L.deleteAllMessage(people.length, recordCount));
    if (!proceed) return;
    clearAllPeople();
    clearAllEntries();
    clearAllTasks();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <GlowBackground />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{L.settingsTitle}</Text>
        <TitleAccent style={{ marginTop: -8 }} />

        <AccountSection />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.languageSection}</Text>
          <View style={styles.langRow}>
            {LANGUAGE_OPTIONS.map((lang) => (
              <Pressable
                key={lang.key}
                style={[styles.langChip, settings.language === lang.key && styles.langChipSelected]}
                onPress={() => setLanguage(lang.key)}>
                <Text
                  style={[
                    styles.langChipText,
                    settings.language === lang.key && styles.langChipTextSelected,
                  ]}>
                  {lang.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.countrySection}</Text>
          <Text style={styles.dataSummary}>{L.countryDesc}</Text>
          <View style={styles.countryWrap}>
            {[{ tz: 'auto', label: L.countryAuto }, ...L.countries].map((c) => {
              const selected = (settings.timezone ?? 'auto') === c.tz;
              return (
                <Pressable
                  key={c.tz}
                  style={[styles.countryChip, selected && styles.countryChipSelected]}
                  onPress={() => setTimezone(c.tz)}>
                  <Text style={[styles.countryChipText, selected && styles.countryChipTextSelected]}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.notifySection}</Text>
          <View style={styles.privacyRow}>
            <Ionicons
              name="notifications-outline"
              size={18}
              color={AppColors.accent}
              style={styles.privacyIcon}
            />
            <View style={{ flex: 1 }}>
              <View style={styles.consentTitleRow}>
                <Text style={styles.privacyTitle}>{L.notifyToggleTitle}</Text>
                <Switch
                  value={!!settings.proactiveNotify}
                  onValueChange={handleToggleNotify}
                  trackColor={{ false: AppColors.line, true: AppColors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
              <Text style={styles.privacyDesc}>{L.notifyToggleDesc}</Text>
            </View>
          </View>
          {settings.proactiveNotify && (
            <>
              <Text style={styles.dataSummary}>{L.notifyHourLabel}</Text>
              <View style={styles.countryWrap}>
                {NOTIFY_HOURS.map((h) => {
                  const selected = (settings.notifyHour ?? 8) === h;
                  return (
                    <Pressable
                      key={h}
                      style={[styles.countryChip, selected && styles.countryChipSelected]}
                      onPress={() => handleSelectNotifyHour(h)}>
                      <Text style={[styles.countryChipText, selected && styles.countryChipTextSelected]}>
                        {L.notifyHourOption(h)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {notifyInfo && <Text style={styles.successText}>{notifyInfo}</Text>}
          {notifyError && <Text style={styles.errorText}>{notifyError}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.themeSection}</Text>
          <View style={styles.langRow}>
            {THEMES.map((t) => (
              <Pressable
                key={t.key}
                style={[styles.langChip, settings.theme === t.key && styles.langChipSelected]}
                onPress={() => setTheme(t.key)}>
                <Ionicons
                  name={t.key === 'dark' ? 'moon-outline' : 'sunny-outline'}
                  size={15}
                  color={settings.theme === t.key ? AppColors.primary : AppColors.muted}
                />
                <Text
                  style={[styles.langChipText, settings.theme === t.key && styles.langChipTextSelected]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 有料プラン公開時(paidPlans=true)はプラン表示＋アップグレード導線を出す。
            無料先行リリース中は課金UIを出さず、今月のAI利用状況だけを表示する。 */}
        {FEATURES.paidPlans ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{L.planSection}</Text>
            <Text style={styles.dataSummary}>
              {L.planCurrent(
                settings.currentPlan === 'standard'
                  ? '⭐ Standard'
                  : settings.currentPlan === 'pro'
                    ? '⚡ Pro'
                    : '🌱 Free',
              )}
            </Text>
            {aiUsedCount !== null && (
              <Text style={styles.dataSummary}>
                {L.aiUsage(aiUsedCount, PLAN_AI_LIMITS[settings.currentPlan] ?? PLAN_AI_LIMITS.free)}
              </Text>
            )}
            {/* Pro無料体験中は残り日数を出す（期限が意識されるほど転換率が上がる） */}
            {settings.trialEndsAt && (
              <Text style={[styles.dataSummary, { color: AppColors.primary, fontWeight: '700' }]}>
                {L.trialBadge(
                  Math.max(
                    1,
                    Math.ceil((new Date(settings.trialEndsAt).getTime() - Date.now()) / 86400000),
                  ),
                )}
              </Text>
            )}
            {/* Standardで上限の8割に達したら、その場でProを案内する */}
            {settings.currentPlan === 'standard' &&
              aiUsedCount !== null &&
              aiUsedCount >= PLAN_AI_LIMITS.standard * 0.8 && (
                <Text style={[styles.dataSummary, { color: AppColors.accent, fontWeight: '700' }]}>
                  {L.aiUsageUpsell}
                </Text>
              )}
            <Pressable style={styles.actionButton} onPress={() => router.push('/plans')}>
              <Ionicons name="pricetags-outline" size={16} color={AppColors.primary} />
              <Text style={styles.actionButtonText}>{L.planLink}</Text>
            </Pressable>
          </View>
        ) : (
          aiUsedCount !== null && (
            <View style={styles.card}>
              <Text style={styles.dataSummary}>
                {L.aiUsage(aiUsedCount, PLAN_AI_LIMITS.free)}
              </Text>
            </View>
          )
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.aiProfileSection}</Text>
          <Text style={styles.dataSummary}>{L.aiProfileDesc}</Text>
          {aiProfile ? (
            <View style={styles.profileBox}>
              <Text style={styles.profileLabel}>{L.aiProfileLabel}</Text>
              <Text style={styles.profileText}>{aiProfile.summary}</Text>
              <Text style={styles.profileMeta}>
                {L.aiProfileLearnedAt(aiProfile.updatedAt, aiProfile.learnedFromCount)}
              </Text>
            </View>
          ) : (
            <Text style={styles.dataSummary}>{L.aiProfileEmpty}</Text>
          )}
          {aiProfile && isProfileStale(aiProfile, learnableCount) && (
            <Text style={styles.profileHint}>{L.aiProfileStaleHint}</Text>
          )}
          <AiSendNote text={L.aiProfileSendNote} />
          <GradientButton
            label={L.aiProfileLearnButton}
            iconName="school-outline"
            onPress={handleLearnProfile}
            loading={isLearning}
            disabled={learnableCount === 0}
          />
          {/* 自動学習はPro限定・オプトイン。無料先行リリース中は入口ごと非表示（paidPlans参照）。
              手動の「理解ノートを更新」ボタン(上のGradientButton)は無料でも使える。 */}
          {FEATURES.paidPlans && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: AppColors.text }}>
                  {L.autoLearnLabel}
                </Text>
                <Text style={styles.exportHintText}>{L.autoLearnNote}</Text>
              </View>
              {settings.currentPlan === 'pro' ? (
                <Switch value={!!settings.autoLearn} onValueChange={setAutoLearn} />
              ) : (
                <Pressable onPress={() => router.push('/plans')} hitSlop={8}>
                  <Text style={{ color: AppColors.primary, fontWeight: '700', fontSize: 12 }}>
                    {L.autoLearnProOnly}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          {learnError && <Text style={styles.errorText}>{learnError}</Text>}
          {aiProfile && (
            <Pressable onPress={handleClearProfile} hitSlop={8}>
              <Text style={styles.profileClearText}>{L.aiProfileClear}</Text>
            </Pressable>
          )}
        </View>

        {/* AI必須のため、AI利用と外部送信の内容を設定でも常時確認できるようにする */}
        <View style={styles.card}>
          <View style={styles.aiDisclosureHeader}>
            <Ionicons name="sparkles-outline" size={18} color={AppColors.primary} />
            <Text style={styles.cardTitle}>{L.aiDisclosureTitle}</Text>
          </View>
          <Text style={styles.privacyDesc}>{L.aiDisclosureDesc}</Text>
          <Pressable
            onPress={() => Linking.openURL('https://sarjavexofficial.github.io/privacy.html')}
            hitSlop={8}>
            <Text style={styles.aiDisclosureLink}>{L.onboardingPolicyLink}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.privacySection}</Text>
          {privacyItems.map((item) => (
            <View key={item.title} style={styles.privacyRow}>
              <Ionicons name={item.icon} size={18} color={AppColors.accent} style={styles.privacyIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.privacyTitle}>{item.title}</Text>
                <Text style={styles.privacyDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}

          <View style={styles.consentDivider} />

          <View style={styles.privacyRow}>
            <Ionicons name="school-outline" size={18} color={AppColors.accent} style={styles.privacyIcon} />
            <View style={{ flex: 1 }}>
              <View style={styles.consentTitleRow}>
                <Text style={styles.privacyTitle}>{L.consentTitle}</Text>
                <Switch
                  value={settings.aiLearningConsent}
                  onValueChange={handleToggleAiLearning}
                  trackColor={{ false: AppColors.line, true: AppColors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
              <Text style={styles.privacyDesc}>
                {L.consentDesc}
                {settings.aiLearningConsent ? L.consentOn : L.consentOff}
              </Text>
              {consentDate && <Text style={styles.consentHistory}>{L.consentLastChanged(consentDate)}</Text>}
            </View>
          </View>

          <View style={styles.consentDivider} />

          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={18} color={AppColors.accent} style={styles.privacyIcon} />
            <View style={{ flex: 1 }}>
              <View style={styles.consentTitleRow}>
                <Text style={styles.privacyTitle}>{L.appLockTitle}</Text>
                <Switch
                  value={!!settings.appLock}
                  onValueChange={handleToggleAppLock}
                  trackColor={{ false: AppColors.line, true: AppColors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
              <Text style={styles.privacyDesc}>{L.appLockDesc}</Text>
              {appLockErr && <Text style={styles.errorText}>{appLockErr}</Text>}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.dataSection}</Text>
          <Text style={styles.dataSummary}>{L.dataSummary(people.length, recordCount)}</Text>

          <Pressable style={styles.actionButton} onPress={() => router.push('/import-history')}>
            <Ionicons name="cloud-download-outline" size={16} color={AppColors.primary} />
            <Text style={styles.actionButtonText}>{L.importLink}</Text>
          </Pressable>

          <Pressable style={styles.actionButton} onPress={handleExport}>
            <Ionicons name="download-outline" size={16} color={AppColors.primary} />
            <Text style={styles.actionButtonText}>{L.exportButton}</Text>
          </Pressable>
          <Text style={styles.exportHintText}>{L.exportHint}</Text>
          {exportDone && <Text style={styles.successText}>{L.exportDone}</Text>}
          {exportError && <Text style={styles.errorText}>{exportError}</Text>}

          <Pressable style={styles.dangerButton} onPress={handleDeleteAll}>
            <Ionicons name="trash-outline" size={16} color={AppColors.danger} />
            <Text style={styles.dangerButtonText}>{L.deleteAllButton}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.cloudBackupSection}</Text>
          <Text style={styles.dataSummary}>{L.cloudBackupDesc}</Text>
          {!account ? (
            // 保管場所はアカウントに紐づくため、サインインするまで操作できない
            <Text style={styles.exportHintText}>{L.cloudBackupNeedSignIn}</Text>
          ) : (
            <>
              <View style={styles.passInputRow}>
                <TextInput
                  style={styles.passInputField}
                  value={cloudPass}
                  onChangeText={(t) => {
                    setCloudPass(t);
                    setCloudMsg(null);
                    setCloudErr(null);
                  }}
                  placeholder={L.cloudBackupPassPlaceholder}
                  placeholderTextColor={AppColors.muted}
                  secureTextEntry={!showCloudPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable hitSlop={10} onPress={() => setShowCloudPass((v) => !v)}>
                  <Ionicons
                    name={showCloudPass ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={AppColors.muted}
                  />
                </Pressable>
              </View>
              <GradientButton
                label={L.cloudBackupSave}
                iconName="cloud-upload-outline"
                onPress={handleCloudBackup}
                loading={cloudBusy === 'save'}
                disabled={cloudBusy !== null}
              />
              <Pressable
                style={styles.actionButton}
                onPress={handleCloudRestore}
                disabled={cloudBusy !== null}>
                <Ionicons name="cloud-download-outline" size={16} color={AppColors.primary} />
                <Text style={styles.actionButtonText}>
                  {cloudBusy === 'restore' ? '…' : L.cloudBackupRestore}
                </Text>
              </Pressable>
              {passRemembered && (
                <View style={styles.rememberedRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={AppColors.success} />
                  <Text style={styles.rememberedText}>{L.cloudSyncRemembered}</Text>
                  <Pressable onPress={handleForgetCloudPass} hitSlop={6}>
                    <Text style={styles.rememberedForget}>{L.cloudSyncForget}</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
          {cloudMsg && <Text style={styles.successText}>{cloudMsg}</Text>}
          {cloudErr && <Text style={styles.errorText}>{cloudErr}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.aboutSection}</Text>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{L.aboutName}</Text>
            <Text style={styles.aboutValue}>Memory Twin</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{L.aboutCompany}</Text>
            <Text style={styles.aboutValue}>Sarjavex</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{L.aboutVersion}</Text>
            <Text style={styles.aboutValue}>{L.aboutVersionValue}</Text>
          </View>
          {/* ストア審査(UGCガイドライン)対応: 運営への連絡手段をアプリ内に明記する */}
          <Pressable style={styles.actionButton} onPress={handleContact}>
            <Ionicons name="mail-outline" size={16} color={AppColors.primary} />
            <Text style={styles.actionButtonText}>{L.contactButton}</Text>
          </Pressable>
          {/* selectable: 長押しでコピーできるように（メールアプリが無い端末の最終手段） */}
          <Text style={styles.contactEmail} selectable>
            {SUPPORT_EMAIL}
          </Text>
          {contactErr && <Text style={styles.errorText}>{contactErr}</Text>}

          {/* ストア審査(3.1.2)対応: ポリシーと利用規約へのリンクをアプリ内に明記する */}
          <Pressable
            style={styles.actionButton}
            onPress={() => Linking.openURL('https://sarjavexofficial.github.io/privacy.html')}>
            <Ionicons name="shield-checkmark-outline" size={16} color={AppColors.primary} />
            <Text style={styles.actionButtonText}>{L.privacyPolicyLink}</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() =>
              Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')
            }>
            <Ionicons name="document-text-outline" size={16} color={AppColors.primary} />
            <Text style={styles.actionButtonText}>{L.termsLink}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.background },
  content: { padding: 20, paddingTop: 12, gap: 16, paddingBottom: 100 },
  title: { fontSize: 26, fontWeight: '800', color: AppColors.text, letterSpacing: -0.5 },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 18,
    gap: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: AppColors.text },
  // 6言語が1行に押し込まれて文字が隣の枠に被らないよう、3列×2行に折り返す
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  langChip: {
    flexBasis: '30%',
    flexGrow: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: AppColors.line,
  },
  langChipSelected: { borderColor: AppColors.primary, backgroundColor: AppColors.primarySoft },
  langChipText: { fontSize: 14, color: AppColors.muted, fontWeight: '600' },
  langChipTextSelected: { color: AppColors.primary, fontWeight: '800' },
  countryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: AppColors.line,
  },
  countryChipSelected: { borderColor: AppColors.primary, backgroundColor: AppColors.primarySoft },
  countryChipText: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
  countryChipTextSelected: { color: AppColors.primary, fontWeight: '800' },
  privacyRow: { flexDirection: 'row', gap: 12 },
  privacyIcon: { marginTop: 2 },
  privacyTitle: { fontSize: 14, fontWeight: '700', color: AppColors.text },
  privacyDesc: { fontSize: 12, color: AppColors.muted, lineHeight: 17, marginTop: 2 },
  consentDivider: { height: 1, backgroundColor: AppColors.line },
  consentTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiDisclosureHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiDisclosureLink: { fontSize: 13, color: AppColors.primary, fontWeight: '700' },
  consentHistory: { fontSize: 11, color: AppColors.muted, marginTop: 4 },
  dataSummary: { fontSize: 13, color: AppColors.muted },
  actionButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 44,
  },
  actionButtonText: { color: AppColors.primary, fontWeight: '700', fontSize: 14 },
  successText: { fontSize: 13, color: AppColors.success, textAlign: 'center' },
  exportHintText: { fontSize: 12, color: AppColors.muted, lineHeight: 17, marginTop: -6 },
  errorText: { fontSize: 13, color: AppColors.danger, textAlign: 'center' },
  dangerButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: AppColors.danger,
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 44,
  },
  dangerButtonText: { color: AppColors.danger, fontWeight: '700', fontSize: 14 },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between' },
  contactEmail: { fontSize: 12, color: AppColors.muted, textAlign: 'center', marginTop: -6 },
  profileBox: {
    backgroundColor: AppColors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 12,
    gap: 6,
  },
  profileLabel: { fontSize: 11, fontWeight: '800', color: AppColors.accent },
  profileText: { fontSize: 13, color: AppColors.text, lineHeight: 20 },
  profileMeta: { fontSize: 11, color: AppColors.muted },
  profileHint: { fontSize: 12, color: AppColors.primary, lineHeight: 17 },
  profileClearText: { fontSize: 13, color: AppColors.muted, textAlign: 'center', textDecorationLine: 'underline' },
  passInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    backgroundColor: AppColors.background,
  },
  passInputField: { flex: 1, paddingVertical: 11, color: AppColors.text, fontSize: 14 },
  rememberedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rememberedText: { flex: 1, fontSize: 11, color: AppColors.success, fontWeight: '600' },
  rememberedForget: { fontSize: 11, color: AppColors.muted, textDecorationLine: 'underline' },
  aboutLabel: { fontSize: 14, color: AppColors.muted, fontWeight: '600' },
  aboutValue: { fontSize: 14, color: AppColors.text },
});

const themed = makeThemed(makeStyles);
