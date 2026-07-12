import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { DatePickerField } from '@/components/date-picker-field';
import { GlowBackground, GradientButton, TitleAccent } from '@/components/futuristic';
import { VoiceInputButton } from '@/components/voice-input-button';
import { AppPalette, glow } from '@/constants/app-colors';
import { organizeJournalEntry } from '@/lib/ai';
import {
  candidateMessage,
  DailyCandidate,
  DailyMessageRecord,
  getTodayMessage,
  previewBestCandidate,
  saveMessageFeedback,
} from '@/lib/daily-message';
import { cancelProactiveNotifications, scheduleProactiveMessage } from '@/lib/notifications';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { MOOD_EMOJIS } from '@/lib/journal-data';
import { Memo, Person, STALE_THRESHOLD_DAYS } from '@/lib/mock-data';
import { daysAgoLocal, todayLocal, useTodayLocal } from '@/lib/date';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { useSettings } from '@/store/settings-context';

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

type PromiseItem = { person: Person; memo: Memo };

export default function TodayScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { people, isLoaded, togglePromiseDone } = usePeople();
  const { entries, addEntry } = useJournal();
  const { settings, isLoaded: settingsLoaded } = useSettings();

  // 日付をまたいだら自動で当日に切り替わる
  const todayStr = useTodayLocal();
  const [date, setDate] = useState(todayLocal());
  const prevTodayRef = useRef(todayStr);

  // 開きっぱなしで日付が変わったとき、ユーザーが手動変更していなければ入力欄の日付も進める
  useEffect(() => {
    const prevToday = prevTodayRef.current;
    if (prevToday !== todayStr) {
      prevTodayRef.current = todayStr;
      setDate((prev) => (prev === prevToday ? todayStr : prev));
    }
  }, [todayStr]);

  // 初回起動時のみオンボーディングを表示する
  useEffect(() => {
    if (settingsLoaded && !settings.hasSeenOnboarding) {
      router.push('/onboarding');
    }
  }, [settingsLoaded, settings.hasSeenOnboarding]);

  // 能動メッセージ: 1日最大1件。候補がしきい値未満なら何も表示しない（話さない判断）
  const [dailyMessage, setDailyMessage] = useState<DailyMessageRecord | null>(null);
  const [showReason, setShowReason] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    let active = true;
    getTodayMessage(people, entries).then((record) => {
      if (active) setDailyMessage(record);
    });
    return () => {
      active = false;
    };
    // todayStr: 日付が変わったら翌日分を再判断する
  }, [isLoaded, people, entries, todayStr]);

  async function handleMessageFeedback(feedback: 'helpful' | 'unnecessary') {
    if (!dailyMessage) return;
    const updated = await saveMessageFeedback(dailyMessage, feedback);
    setDailyMessage(updated);
  }

  // 通知ONのとき、最新の候補で「次の話しかけ」を予約し直す（候補がなければ通知しない）
  useEffect(() => {
    if (!isLoaded || !settingsLoaded || Platform.OS === 'web') return;
    if (!settings.proactiveNotify) return;
    (async () => {
      const candidate = await previewBestCandidate(people, entries);
      if (candidate) {
        await scheduleProactiveMessage(candidateMessage(candidate, L, people), settings.notifyHour ?? 8);
      } else {
        await cancelProactiveNotifications();
      }
    })();
  }, [isLoaded, settingsLoaded, settings.proactiveNotify, settings.notifyHour, people, entries, todayStr, L]);

  function messageText(c: DailyCandidate): string {
    return candidateMessage(c, L, people);
  }

  function messageReason(c: DailyCandidate): string {
    switch (c.category) {
      case 'overdue-promise':
        return L.dailyReasonOverdue;
      case 'upcoming-promise':
        return L.dailyReasonUpcoming;
      case 'stale-person':
        return L.dailyReasonStale;
      case 'short-sleep':
        return L.dailyReasonSleep;
    }
  }
  // Today Recall: Free=1日1件、Standard=最大3件、Pro=最大10件
  const recallLimit =
    settings.currentPlan === 'pro' ? 10 : settings.currentPlan === 'standard' ? 3 : 1;
  const [text, setText] = useState('');
  const [mood, setMood] = useState(3);
  const [sleepHours, setSleepHours] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [useAiTagging, setUseAiTagging] = useState(true);
  const [savedMessage, setSavedMessage] = useState(false);
  // プロジェクト分類: 既存の記録から候補を集め、その場で新規作成もできる
  const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined);
  const [newProjects, setNewProjects] = useState<string[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.project) set.add(e.project);
    for (const p of newProjects) set.add(p);
    return Array.from(set).sort();
  }, [entries, newProjects]);

  function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;
    if (!projectOptions.includes(name)) setNewProjects((prev) => [...prev, name]);
    setSelectedProject(name);
    setNewProjectName('');
    setCreatingProject(false);
  }

  const pendingPromises = useMemo<PromiseItem[]>(() => {
    const items: PromiseItem[] = [];
    for (const person of people) {
      for (const memo of person.memos) {
        if (memo.promise && !memo.promise.done) items.push({ person, memo });
      }
    }
    items.sort((a, b) => (a.memo.promise!.dueDate ?? '9999').localeCompare(b.memo.promise!.dueDate ?? '9999'));
    return items;
  }, [people]);

  const stalePeople = useMemo(
    () => people.filter((p) => daysSince(p.lastContact) >= STALE_THRESHOLD_DAYS),
    [people],
  );

  // あの日のあなた: 1年前（なければ半年前）の「今日」に近い日記を探して再会させる（端末内だけ・無料）
  // ぴったり同じ日に書いているとは限らないので、±10日の中で最も近い記録を拾う
  const reunion = useMemo(() => {
    const findNear = (daysAgo: number) => {
      const target = new Date(daysAgoLocal(daysAgo)).getTime();
      let best: (typeof entries)[number] | null = null;
      let bestDiff = 10 * 24 * 60 * 60 * 1000 + 1;
      for (const e of entries) {
        const diff = Math.abs(new Date(e.date).getTime() - target);
        if (diff < bestDiff) {
          best = e;
          bestDiff = diff;
        }
      }
      return best;
    };
    const yearAgo = findNear(365);
    if (yearAgo) return { entry: yearAgo, label: 'year' as const };
    const halfAgo = findNear(183);
    if (halfAgo) return { entry: halfAgo, label: 'half' as const };
    return null;
  }, [entries, todayStr]);

  async function handleSave() {
    if (!text.trim()) return;
    setIsSaving(true);
    setSavedMessage(false);
    let tags: string[] = [];
    if (useAiTagging) {
      try {
        const result = await organizeJournalEntry(text.trim());
        tags = result.tags;
      } catch {
        // AI未設定・失敗時はタグなしで保存
      }
    }
    addEntry({
      date: date.trim() || todayStr,
      text: text.trim(),
      mood,
      sleepHours: sleepHours.trim() ? Number(sleepHours.trim()) : undefined,
      tags,
      project: selectedProject,
    });
    setText('');
    setSleepHours('');
    setMood(3);
    setIsSaving(false);
    setSavedMessage(true);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <GlowBackground />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{L.tabToday}</Text>
        <TitleAccent />
        <Text style={styles.subtitle}>{todayStr}</Text>

        {dailyMessage?.candidate && (
          <View style={styles.dailyCard}>
            <View style={styles.dailyHeaderRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={15} color={AppColors.primary} />
              <Text style={styles.dailyTitle}>{L.dailyTitle}</Text>
            </View>
            <Text style={styles.dailyText}>{messageText(dailyMessage.candidate)}</Text>

            <Pressable style={styles.dailyWhyRow} onPress={() => setShowReason((v) => !v)}>
              <Ionicons
                name={showReason ? 'chevron-down' : 'chevron-forward'}
                size={13}
                color={AppColors.muted}
              />
              <Text style={styles.dailyWhyText}>{L.dailyWhy}</Text>
            </Pressable>
            {showReason && (
              <View style={styles.dailyReasonBox}>
                <Text style={styles.dailyReasonText}>{messageReason(dailyMessage.candidate)}</Text>
                <Text style={styles.dailySourceLabel}>{L.dailySourceLabel}</Text>
                <Text style={styles.dailySourceText}>
                  ・[{dailyMessage.candidate.sourceDate}] {dailyMessage.candidate.sourceText}
                </Text>
                <Text style={styles.dailyLocalNote}>{L.dailyLocalNote}</Text>
              </View>
            )}

            {dailyMessage.feedback ? (
              <Text style={styles.dailyThanks}>
                {dailyMessage.feedback === 'helpful' ? L.dailyThanksHelpful : L.dailyThanksUnnecessary}
              </Text>
            ) : (
              <View style={styles.dailyFeedbackRow}>
                <Pressable
                  style={styles.dailyFeedbackButton}
                  onPress={() => handleMessageFeedback('helpful')}>
                  <Ionicons name="thumbs-up-outline" size={14} color={AppColors.success} />
                  <Text style={[styles.dailyFeedbackText, { color: AppColors.success }]}>
                    {L.dailyHelpful}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.dailyFeedbackButton}
                  onPress={() => handleMessageFeedback('unnecessary')}>
                  <Ionicons name="thumbs-down-outline" size={14} color={AppColors.muted} />
                  <Text style={styles.dailyFeedbackText}>{L.dailyNotNeeded}</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L.recordToday}</Text>
          <View style={styles.moodRow}>
            {MOOD_EMOJIS.map((emoji, i) => (
              <Pressable
                key={emoji}
                style={[styles.moodButton, mood === i + 1 && styles.moodButtonSelected]}
                onPress={() => setMood(i + 1)}>
                <Text style={styles.moodEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <DatePickerField value={date} onChange={setDate} />
            </View>
            <TextInput
              value={sleepHours}
              onChangeText={setSleepHours}
              placeholder={L.sleepPlaceholder}
              placeholderTextColor={AppColors.muted}
              keyboardType="numeric"
              style={[styles.input, { width: 100 }]}
            />
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={L.entryPlaceholder}
            placeholderTextColor={AppColors.muted}
            style={styles.textArea}
            multiline
          />
          <VoiceInputButton
            onText={(t) => setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))}
            disabled={isSaving}
          />
          <View style={styles.projectSection}>
            <Text style={styles.projectLabel}>{L.projectLabel}</Text>
            <View style={styles.projectRow}>
              <Pressable
                style={[styles.projectChip, selectedProject === undefined && styles.projectChipSelected]}
                onPress={() => setSelectedProject(undefined)}>
                <Text
                  style={[
                    styles.projectChipText,
                    selectedProject === undefined && styles.projectChipTextSelected,
                  ]}>
                  {L.projectNone}
                </Text>
              </Pressable>
              {projectOptions.map((p) => (
                <Pressable
                  key={p}
                  style={[styles.projectChip, selectedProject === p && styles.projectChipSelected]}
                  onPress={() => setSelectedProject(p)}>
                  <Ionicons
                    name="folder-outline"
                    size={12}
                    color={selectedProject === p ? AppColors.primary : AppColors.muted}
                  />
                  <Text
                    style={[styles.projectChipText, selectedProject === p && styles.projectChipTextSelected]}>
                    {p}
                  </Text>
                </Pressable>
              ))}
              <Pressable style={styles.projectChip} onPress={() => setCreatingProject((v) => !v)}>
                <Text style={styles.projectChipText}>{L.projectNew}</Text>
              </Pressable>
            </View>
            {creatingProject && (
              <View style={styles.projectCreateRow}>
                <TextInput
                  value={newProjectName}
                  onChangeText={setNewProjectName}
                  placeholder={L.projectNamePlaceholder}
                  placeholderTextColor={AppColors.muted}
                  style={[styles.input, { flex: 1 }]}
                  onSubmitEditing={handleCreateProject}
                />
                <Pressable
                  style={[styles.projectCreateButton, !newProjectName.trim() && styles.saveButtonDisabled]}
                  onPress={handleCreateProject}
                  disabled={!newProjectName.trim()}>
                  <Text style={styles.projectCreateButtonText}>{L.projectCreate}</Text>
                </Pressable>
              </View>
            )}
          </View>
          <Pressable style={styles.aiToggleRow} onPress={() => setUseAiTagging((v) => !v)}>
            <Ionicons
              name={useAiTagging ? 'checkbox' : 'square-outline'}
              size={18}
              color={AppColors.accent}
            />
            <Text style={styles.aiToggleText}>{L.aiTagging}</Text>
          </Pressable>
          {useAiTagging && <AiSendNote text={L.aiTagNote} />}
          <GradientButton
            label={isSaving ? L.savingButton : L.recordButton}
            iconName="add"
            onPress={handleSave}
            loading={isSaving}
            disabled={!text.trim()}
          />
          {savedMessage && (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={15} color={AppColors.success} />
              <Text style={styles.savedText}>{L.savedMessage}</Text>
            </View>
          )}
        </View>

        {!isLoaded ? (
          <ActivityIndicator color={AppColors.primary} />
        ) : (
          <>
            {reunion && (
              <View style={styles.reunionCard}>
                <View style={styles.digestHeaderRow}>
                  <Ionicons name="hourglass-outline" size={16} color={AppColors.primary} />
                  <Text style={styles.reunionTitle}>{L.reunionTitle}</Text>
                </View>
                <Text style={styles.reunionAgo}>
                  {reunion.label === 'year' ? L.pastCompareYearLabel : L.pastCompareHalfLabel} ・{' '}
                  {reunion.entry.date}
                </Text>
                <Text style={styles.reunionText}>{reunion.entry.text}</Text>
                <Pressable style={styles.reunionLink} onPress={() => router.push('/compare-past')}>
                  <Text style={styles.reunionLinkText}>{L.reunionCompareLink}</Text>
                  <Ionicons name="chevron-forward" size={14} color={AppColors.primary} />
                </Pressable>
              </View>
            )}

            {pendingPromises.length > 0 && (
              <View style={styles.card}>
                <View style={styles.digestHeaderRow}>
                  <Ionicons name="checkmark-done-outline" size={16} color={AppColors.accent} />
                  <Text style={styles.digestTitle}>{L.todoList}</Text>
                </View>
                {pendingPromises.slice(0, recallLimit).map((item) => (
                  <Pressable
                    key={item.memo.id}
                    style={styles.promiseRow}
                    onPress={() => router.push(`/person/${item.person.id}`)}>
                    <Pressable
                      hitSlop={10}
                      onPress={() => togglePromiseDone(item.person.id, item.memo.id)}>
                      <Ionicons name="ellipse-outline" size={20} color={AppColors.accent} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promiseAction} numberOfLines={1}>
                        {item.memo.promise!.action}
                      </Text>
                      <Text style={styles.promiseSub}>
                        {item.person.name}
                        {item.memo.promise!.dueDate ? L.promiseDue(item.memo.promise!.dueDate) : ''}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {pendingPromises.length > recallLimit && (
                  <Text style={styles.digestMore}>{L.todoMore(pendingPromises.length - recallLimit)}</Text>
                )}
              </View>
            )}

            {stalePeople.length > 0 && (
              <View style={styles.card}>
                <View style={styles.digestHeaderRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={AppColors.danger} />
                  <Text style={[styles.digestTitle, styles.digestTitleDanger]}>{L.staleTitle}</Text>
                </View>
                <View style={styles.staleChipRow}>
                  {stalePeople.map((p) => (
                    <Pressable
                      key={p.id}
                      style={styles.staleChip}
                      onPress={() => router.push(`/person/${p.id}`)}>
                      <Text style={styles.staleChipEmoji}>{p.avatarEmoji}</Text>
                      <Text style={styles.staleChipText}>{p.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.background },
  content: { padding: 20, paddingTop: 12, gap: 16, paddingBottom: 100 },
  title: { fontSize: 26, fontWeight: '800', color: AppColors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: AppColors.muted, fontWeight: '700', marginTop: -10 },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 18,
    gap: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: AppColors.text },
  dailyCard: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: AppColors.primary,
    padding: 16,
    gap: 10,
    ...glow(AppColors.primary, 12, 0.25),
  },
  dailyHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dailyTitle: { fontSize: 12, fontWeight: '800', color: AppColors.primary },
  dailyText: { fontSize: 14, color: AppColors.text, lineHeight: 21 },
  dailyWhyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dailyWhyText: { fontSize: 12, color: AppColors.muted, fontWeight: '700' },
  dailyReasonBox: { backgroundColor: AppColors.primarySoft, borderRadius: 10, padding: 10, gap: 5 },
  dailyReasonText: { fontSize: 12, color: AppColors.text, lineHeight: 17 },
  dailySourceLabel: { fontSize: 11, fontWeight: '800', color: AppColors.primary, marginTop: 2 },
  dailySourceText: { fontSize: 12, color: AppColors.muted, lineHeight: 17 },
  dailyLocalNote: { fontSize: 11, color: AppColors.muted, lineHeight: 15, marginTop: 2 },
  dailyFeedbackRow: { flexDirection: 'row', gap: 10 },
  dailyFeedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
  },
  dailyFeedbackText: { fontSize: 12, color: AppColors.muted, fontWeight: '700' },
  dailyThanks: { fontSize: 12, color: AppColors.success, fontWeight: '600', lineHeight: 17 },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between' },
  moodButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.line,
  },
  moodButtonSelected: { borderColor: AppColors.accent, backgroundColor: AppColors.accentSoft },
  moodEmoji: { fontSize: 22 },
  rowFields: { flexDirection: 'row', gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: AppColors.text,
  },
  inputError: { borderColor: AppColors.danger },
  dateError: { color: AppColors.danger, fontSize: 12, lineHeight: 16 },
  textArea: {
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    color: AppColors.text,
    textAlignVertical: 'top',
  },
  projectSection: { gap: 8 },
  projectLabel: { fontSize: 12, fontWeight: '800', color: AppColors.muted },
  projectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: AppColors.line,
  },
  projectChipSelected: { borderColor: AppColors.primary, backgroundColor: AppColors.primarySoft },
  projectChipText: { fontSize: 12, color: AppColors.muted, fontWeight: '600' },
  projectChipTextSelected: { color: AppColors.primary, fontWeight: '800' },
  projectCreateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  projectCreateButton: {
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  projectCreateButtonText: { color: AppColors.background, fontWeight: '700', fontSize: 13 },
  aiToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiToggleText: { fontSize: 13, color: AppColors.text, fontWeight: '600' },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    minHeight: 44,
    alignItems: 'center',
    ...glow(AppColors.accent),
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: AppColors.background, fontWeight: '700', fontSize: 15 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedText: { fontSize: 13, color: AppColors.success, fontWeight: '600' },
  digestHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  digestTitle: { fontSize: 13, fontWeight: '800', color: AppColors.accent },
  // あの日のあなた（過去の日記との再会カード）
  reunionCard: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: AppColors.primary,
    padding: 16,
    gap: 8,
  },
  reunionTitle: { fontSize: 13, fontWeight: '800', color: AppColors.primary },
  reunionAgo: { fontSize: 12, color: AppColors.muted, fontWeight: '700' },
  reunionText: { fontSize: 14, color: AppColors.text, lineHeight: 21 },
  reunionLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-end' },
  reunionLinkText: { fontSize: 13, color: AppColors.primary, fontWeight: '700' },
  digestTitleDanger: { color: AppColors.danger },
  digestMore: { fontSize: 12, color: AppColors.muted },
  promiseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  promiseAction: { fontSize: 14, color: AppColors.text, fontWeight: '600' },
  promiseSub: { fontSize: 12, color: AppColors.muted, marginTop: 1 },
  staleChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  staleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppColors.dangerSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  staleChipEmoji: { fontSize: 14 },
  staleChipText: { fontSize: 13, color: AppColors.danger, fontWeight: '700' },
});

const themed = makeThemed(makeStyles);
