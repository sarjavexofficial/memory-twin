import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlowBackground, GradientButton } from '@/components/futuristic';
import { AppPalette, glow } from '@/constants/app-colors';
import { LANGUAGE_OPTIONS, useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { useSettings } from '@/store/settings-context';

export default function OnboardingScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { markOnboardingSeen, setLanguage, setTimezone, settings } = useSettings();

  const features = [
    {
      icon: 'cloud-download-outline' as const,
      title: L.onboardingFeature1Title,
      desc: L.onboardingFeature1Desc,
    },
    {
      icon: 'search-outline' as const,
      title: L.onboardingFeature2Title,
      desc: L.onboardingFeature2Desc,
    },
    {
      icon: 'calendar-outline' as const,
      title: L.onboardingFeature3Title,
      desc: L.onboardingFeature3Desc,
    },
  ];

  function handleStart() {
    markOnboardingSeen();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <GlowBackground />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 双子の三日月（アプリアイコンと同じモチーフ） */}
        <View style={styles.logoRow}>
          <Text
            style={[
              styles.logoMoon,
              { color: AppColors.accent, textShadowColor: AppColors.accent, textShadowRadius: 18 },
            ]}>
            ☾
          </Text>
          <View style={styles.logoCore} />
          <Text
            style={[
              styles.logoMoon,
              { color: AppColors.primary, textShadowColor: AppColors.primary, textShadowRadius: 18 },
            ]}>
            ☽
          </Text>
        </View>
        <Text style={styles.appName}>Memory Twin</Text>
        <Text style={styles.tagline}>{L.onboardingTagline}</Text>
        <Text style={styles.lead}>{L.onboardingLead}</Text>

        {/* 最初に住んでいる国と言語を選ばせる（日付の切り替わり・通知時刻・表示言語の基準になる） */}
        <View style={styles.localeCard}>
          <Text style={styles.localeTitle}>{L.countrySection}</Text>
          <View style={styles.chipWrap}>
            {L.countries.map((c) => {
              const selected = settings.timezone === c.tz;
              return (
                <Pressable
                  key={c.tz}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setTimezone(c.tz)}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.localeTitle}>{L.languageSection}</Text>
          <View style={styles.chipWrap}>
            {LANGUAGE_OPTIONS.map((lang) => {
              const selected = settings.language === lang.key;
              return (
                <Pressable
                  key={lang.key}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setLanguage(lang.key)}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{lang.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.localeNote}>{L.localeChangeableNote}</Text>
        </View>

        <View style={styles.featureList}>
          {features.map((f) => (
            <View key={f.title} style={styles.featureCard}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={20} color={AppColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed-outline" size={14} color={AppColors.success} />
          <Text style={styles.privacyText}>{L.onboardingPrivacy}</Text>
        </View>

        {/* AI必須のため、開始前に外部AI（Gemini）へのデータ送信を明示して同意を得る */}
        <View style={styles.aiCard}>
          <View style={styles.aiCardHeader}>
            <Ionicons name="sparkles-outline" size={15} color={AppColors.primary} />
            <Text style={styles.aiCardTitle}>{L.aiDisclosureTitle}</Text>
          </View>
          <Text style={styles.aiCardDesc}>{L.aiDisclosureDesc}</Text>
          <Pressable
            onPress={() => Linking.openURL('https://sarjavexofficial.github.io/privacy.html')}
            hitSlop={8}>
            <Text style={styles.aiCardLink}>{L.onboardingPolicyLink}</Text>
          </Pressable>
        </View>

        <GradientButton
          label={L.onboardingStart}
          iconRight="arrow-forward"
          onPress={handleStart}
          style={{ marginTop: 'auto' }}
        />
        <Text style={styles.consentNote}>{L.onboardingAiConsentNote}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: AppColors.background },
    content: { padding: 24, paddingTop: 48, gap: 16, paddingBottom: 40, flexGrow: 1 },
    logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    logoMoon: { fontSize: 52, fontWeight: '700', lineHeight: 60 },
    logoCore: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: AppColors.text,
      opacity: 0.9,
    },
    appName: {
      fontSize: 22,
      fontWeight: '800',
      color: AppColors.muted,
      textAlign: 'center',
      letterSpacing: 2,
      marginTop: -6,
    },
    tagline: {
      fontSize: 30,
      fontWeight: '900',
      color: AppColors.text,
      textAlign: 'center',
      lineHeight: 40,
      letterSpacing: -0.5,
    },
    lead: { fontSize: 14, color: AppColors.muted, lineHeight: 22, textAlign: 'center' },
    localeCard: {
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
      gap: 10,
      marginTop: 8,
    },
    localeTitle: { fontSize: 13, fontWeight: '800', color: AppColors.accent },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: AppColors.line,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: AppColors.background,
    },
    chipSelected: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
    chipText: { fontSize: 12, color: AppColors.text, fontWeight: '600' },
    chipTextSelected: { color: '#ffffff', fontWeight: '800' },
    localeNote: { fontSize: 11, color: AppColors.muted },
    featureList: { gap: 12, marginTop: 8 },
    featureCard: {
      flexDirection: 'row',
      gap: 14,
      alignItems: 'center',
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.line,
      padding: 16,
    },
    featureIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: AppColors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text },
    featureDesc: { fontSize: 12, color: AppColors.muted, lineHeight: 18, marginTop: 2 },
    privacyRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    privacyText: { flex: 1, fontSize: 12, color: AppColors.muted, lineHeight: 18 },
    aiCard: {
      backgroundColor: AppColors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: AppColors.primary,
      padding: 16,
      gap: 8,
    },
    aiCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    aiCardTitle: { fontSize: 14, fontWeight: '800', color: AppColors.primary },
    aiCardDesc: { fontSize: 12, color: AppColors.text, lineHeight: 19 },
    aiCardLink: { fontSize: 13, color: AppColors.primary, fontWeight: '700' },
    consentNote: { fontSize: 11, color: AppColors.muted, lineHeight: 16, textAlign: 'center', marginTop: 8 },
    startButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      backgroundColor: AppColors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      minHeight: 52,
      marginTop: 'auto',
      ...glow(AppColors.primary),
    },
    startButtonText: { color: AppColors.background, fontWeight: '800', fontSize: 16 },
  });

const themed = makeThemed(makeStyles);
