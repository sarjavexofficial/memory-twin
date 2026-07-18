import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { DatePickerField } from '@/components/date-picker-field';
import { GlowBackground, GradientButton, TitleAccent } from '@/components/futuristic';
import { AppPalette, glow } from '@/constants/app-colors';
import { organizeJournalEntry } from '@/lib/ai';
import { buildAliasMap } from '@/lib/alias';
import { maybeAutoLearn } from '@/lib/auto-learn';
import { daysUntilBirthday } from '@/lib/birthday';
import { FEATURES } from '@/lib/feature-flags';
import { computeStreak } from '@/lib/streak';
import { maybeAskForReview } from '@/lib/store-review';
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
import { UserTask } from '@/lib/task-data';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { useSettings } from '@/store/settings-context';
import { useTasks } from '@/store/tasks-context';

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Today Recallの期限バッジ用: 期限切れ/今日/3日以内を区別する（それ以外はバッジなし）
function dueDaysLeft(dueDate: string | undefined, today: string): number | null {
  if (!dueDate) return null;
  const diff = Math.round((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000);
  return Number.isNaN(diff) ? null : diff;
}

type PromiseItem = { person: Person; memo: Memo };

// 完了・削除直後のフォローアップバナーの状態。約束の完了 / タスクの完了 / タスクの削除で
// 文言と「元に戻す」の挙動が変わるため、種類ごとに必要な情報を持つ
type JustAction =
  | { kind: 'promise'; personId: string; memoId: string; personName: string; action: string }
  | { kind: 'task-done'; taskId: string; title: string }
  | { kind: 'task-deleted'; task: UserTask };

export default function TodayScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { people, isLoaded, togglePromiseDone } = usePeople();
  const { entries, addEntry } = useJournal();
  const { tasks, isLoaded: tasksLoaded, addTask, toggleTaskDone, deleteTask, restoreTask } = useTasks();
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

  // サンプル（デモ）の人物・記録は、本人のデータが1件でもできたら
  // Recall・疎遠リスト・ひとことの対象から外す（架空の約束が永久に居座るのを防ぐ）。
  // 自分のタスクも「本人のデータ」として数える
  const hasRealData = useMemo(
    () => people.some((p) => !p.sample) || entries.some((e) => !e.sample) || tasks.length > 0,
    [people, entries, tasks],
  );

  // 能動メッセージ: 1日最大1件。候補がしきい値未満なら何も表示しない（話さない判断）
  const [dailyMessage, setDailyMessage] = useState<DailyMessageRecord | null>(null);
  const [showReason, setShowReason] = useState(false);

  useEffect(() => {
    if (!isLoaded || !tasksLoaded) return;
    let active = true;
    // タスクの有無はdaily-messageからは見えないため、ヒントとして渡す
    getTodayMessage(people, entries, tasks.length > 0).then((record) => {
      if (active) setDailyMessage(record);
    });
    return () => {
      active = false;
    };
    // todayStr: 日付が変わったら翌日分を再判断する
  }, [isLoaded, tasksLoaded, people, entries, tasks, todayStr]);

  async function handleMessageFeedback(feedback: 'helpful' | 'unnecessary') {
    if (!dailyMessage) return;
    const updated = await saveMessageFeedback(dailyMessage, feedback);
    setDailyMessage(updated);
  }

  // 話題にした約束が完了・削除されたら、そのひとことは役目を終えたので隠す
  // （完了したのに「連絡しませんか？」と言い続けるのを防ぐ。1日1件の原則は維持）
  const dailyCandidateValid = useMemo(() => {
    const c = dailyMessage?.candidate;
    if (!c) return false;
    if (c.category === 'overdue-promise' || c.category === 'upcoming-promise' || c.category === 'undated-promise') {
      const person = people.find((p) => p.id === c.personId);
      const memo = person?.memos.find((m) => m.date === c.sourceDate);
      if (!memo?.promise || memo.promise.done) return false;
      // 当日中に本人のデータができたら、サンプル人物を話題にした固定済みメッセージも隠す
      if (person?.sample && hasRealData) return false;
    }
    if (c.category === 'stale-person') {
      const person = people.find((p) => p.id === c.personId);
      if (person?.sample && hasRealData) return false;
    }
    return true;
  }, [dailyMessage, people, hasRealData]);

  // 通知ONのとき、最新の候補で「次の話しかけ」を予約し直す（候補がなければ通知しない）
  useEffect(() => {
    if (!isLoaded || !settingsLoaded || Platform.OS === 'web') return;
    if (!settings.proactiveNotify) return;
    (async () => {
      const candidate = await previewBestCandidate(people, entries, tasks.length > 0);
      if (candidate) {
        await scheduleProactiveMessage(candidateMessage(candidate, L, people), settings.notifyHour ?? 8);
      } else {
        await cancelProactiveNotifications();
      }
    })();
  }, [isLoaded, settingsLoaded, settings.proactiveNotify, settings.notifyHour, people, entries, tasks, todayStr, L]);

  // Pro限定の自動学習（設定タブでON=オプトイン）: 記録が増えるたびに条件を確認し、裏で理解ノートを更新
  useEffect(() => {
    if (!isLoaded || !settingsLoaded) return;
    if (settings.currentPlan !== 'pro' || !settings.autoLearn) return;
    maybeAutoLearn(people, entries, settings.language);
  }, [isLoaded, settingsLoaded, settings.currentPlan, settings.autoLearn, settings.language, people, entries]);

  function messageText(c: DailyCandidate): string {
    return candidateMessage(c, L, people);
  }

  function messageReason(c: DailyCandidate): string {
    switch (c.category) {
      case 'overdue-promise':
        return L.dailyReasonOverdue;
      case 'upcoming-promise':
        return L.dailyReasonUpcoming;
      case 'undated-promise':
        return L.dailyReasonUndated;
      case 'stale-person':
        return L.dailyReasonStale;
      case 'short-sleep':
        return L.dailyReasonSleep;
    }
  }
  // Today Recall: Free=1日1件、Standard=最大3件、Pro=最大10件
  const recallLimit =
    settings.currentPlan === 'pro' ? 10 : settings.currentPlan === 'standard' ? 5 : 3;
  const [text, setText] = useState('');
  const [mood, setMood] = useState(3);
  const [sleepHours, setSleepHours] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [useAiTagging, setUseAiTagging] = useState(true);
  // 手動タグ入力（カンマ・読点・空白区切り）。AIタグと併用できる
  const [tagsInput, setTagsInput] = useState('');
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

  // 連続記録（サンプルデータ除外）。todayStr依存で日付が変わっても正しく再計算される
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const streak = useMemo(() => computeStreak(entries), [entries, todayStr]);

  const pendingPromises = useMemo<PromiseItem[]>(() => {
    const items: PromiseItem[] = [];
    for (const person of people) {
      if (hasRealData && person.sample) continue;
      for (const memo of person.memos) {
        if (memo.promise && !memo.promise.done) items.push({ person, memo });
      }
    }
    items.sort((a, b) => (a.memo.promise!.dueDate ?? '9999').localeCompare(b.memo.promise!.dueDate ?? '9999'));
    return items;
  }, [people, hasRealData]);

  // 自分のタスク: ユーザーが「◯月◯日までにこれをやる」と期限を決めて登録したもの。
  // AIが拾う約束と違い自分で決めた期限なので、Recall欄では最優先で表示する
  const pendingTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);

  // タスク追加フォーム（Recall欄の中で開閉するインライン形式）
  const [addingTask, setAddingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState(todayLocal());
  const [taskPersonId, setTaskPersonId] = useState<string | undefined>(undefined);

  // タスクに紐づけられる人物はユーザー自身が登録した人だけ（デモ用のサンプル人物は出さない）
  const taskPeopleOptions = useMemo(() => people.filter((p) => !p.sample), [people]);

  function openTaskForm() {
    setTaskTitle('');
    setTaskDue(todayLocal());
    setTaskPersonId(undefined);
    setAddingTask(true);
  }

  function handleAddTask() {
    const title = taskTitle.trim();
    if (!title) return;
    addTask({ title, dueDate: taskDue, personId: taskPersonId });
    setAddingTask(false);
  }

  // 完了直後のフォローアップ: 「どうだったか」をその場でメモに残す導線＋押し間違いの取り消し
  const [justDone, setJustDone] = useState<JustAction | null>(null);

  function handlePromiseDone(item: PromiseItem) {
    togglePromiseDone(item.person.id, item.memo.id);
    setJustDone({
      kind: 'promise',
      personId: item.person.id,
      memoId: item.memo.id,
      personName: item.person.name,
      action: item.memo.promise!.action,
    });
  }

  function handleTaskDone(task: UserTask) {
    toggleTaskDone(task.id);
    setJustDone({ kind: 'task-done', taskId: task.id, title: task.title });
  }

  // 削除は長押し。確認ダイアログの代わりに「元に戻す」で取り消せるようにする
  function handleTaskDelete(task: UserTask) {
    deleteTask(task.id);
    setJustDone({ kind: 'task-deleted', task });
  }

  function handleUndo() {
    if (!justDone) return;
    if (justDone.kind === 'promise') togglePromiseDone(justDone.personId, justDone.memoId);
    else if (justDone.kind === 'task-done') toggleTaskDone(justDone.taskId);
    else restoreTask(justDone.task);
    setJustDone(null);
  }

  // 誕生日リコール: 7日以内に誕生日が来る人（当日=0日を含む）。約束と並ぶ「今日の記憶」
  const upcomingBirthdays = useMemo(() => {
    const list: { person: Person; month: number; day: number; daysUntil: number }[] = [];
    for (const person of people) {
      if (hasRealData && person.sample) continue;
      const b = daysUntilBirthday(person.birthday, todayStr);
      if (b && b.daysUntil <= 7) list.push({ person, ...b });
    }
    return list.sort((a, b) => a.daysUntil - b.daysUntil);
  }, [people, todayStr, hasRealData]);

  // Recall欄の配分: 自分で期限を決めたタスク → AIが拾った約束 → 誕生日 の優先順で枠を埋める。
  // あふれた分は「他N件」に集計
  const recallRows = useMemo(() => {
    const taskRows = pendingTasks.slice(0, recallLimit);
    const promiseRows = pendingPromises.slice(0, Math.max(0, recallLimit - taskRows.length));
    const birthdayRows = upcomingBirthdays.slice(
      0,
      Math.max(0, recallLimit - taskRows.length - promiseRows.length),
    );
    const hidden =
      pendingTasks.length +
      pendingPromises.length +
      upcomingBirthdays.length -
      taskRows.length -
      promiseRows.length -
      birthdayRows.length;
    return { taskRows, promiseRows, birthdayRows, hidden };
  }, [pendingTasks, pendingPromises, upcomingBirthdays, recallLimit]);

  const stalePeople = useMemo(
    () =>
      people.filter(
        (p) =>
          !(hasRealData && p.sample) &&
          !p.muteStale &&
          daysSince(p.lastContact) >= STALE_THRESHOLD_DAYS,
      ),
    [people, hasRealData],
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
        const result = await organizeJournalEntry(text.trim(), buildAliasMap(people));
        tags = result.tags;
      } catch {
        // AI未設定・失敗時はタグなしで保存
      }
    }
    // 手動タグを先頭に置き、AIタグと重複したら手動側を優先する
    const manualTags = tagsInput
      .split(/[,、\s]+/)
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    tags = [...new Set([...manualTags, ...tags])];
    addEntry({
      date: date.trim() || todayStr,
      text: text.trim(),
      mood,
      sleepHours: sleepHours.trim() ? Number(sleepHours.trim()) : undefined,
      tags,
      project: selectedProject,
    });
    // 自分の記録が節目の数に達した「役立っている瞬間」にだけ、App Storeの評価をお願いする
    maybeAskForReview(entries.filter((e) => !e.sample).length + 1);
    setText('');
    setSleepHours('');
    setTagsInput('');
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

        {dailyMessage?.candidate && dailyCandidateValid && (
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
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{L.recordToday}</Text>
            {/* 連続記録の炎。今日書いた直後は称賛、未記録なら「今日も書けばn日」で後押し */}
            {streak.recordedToday && streak.current >= 2 && (
              <View style={styles.streakChip}>
                <Text style={styles.streakChipText}>{L.streakBadge(streak.current)}</Text>
              </View>
            )}
          </View>
          {streak.recordedToday && streak.current === 1 && (
            <Text style={styles.streakHint}>{L.streakStart}</Text>
          )}
          {!streak.recordedToday && streak.current >= 1 && (
            <Text style={styles.streakHint}>{L.streakKeepHint(streak.current + 1)}</Text>
          )}
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
          <TextInput
            value={tagsInput}
            onChangeText={setTagsInput}
            placeholder={L.tagsPlaceholder}
            placeholderTextColor={AppColors.muted}
            style={styles.input}
            autoCapitalize="none"
          />
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

        {!isLoaded || !tasksLoaded ? (
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

            {/* Today Recall: タスク追加の入口を兼ねるため、中身が空でも常に表示する */}
            <View style={styles.card}>
                <View style={styles.digestHeaderRow}>
                  <Ionicons name="checkmark-done-outline" size={16} color={AppColors.accent} />
                  <Text style={styles.digestTitle}>{L.todoList}</Text>
                </View>
                {justDone && (
                  <View style={styles.doneBanner}>
                    <Text style={styles.doneBannerText}>
                      {justDone.kind === 'task-deleted'
                        ? L.taskDeletedMsg(justDone.task.title)
                        : L.recallDoneMsg(
                            justDone.kind === 'promise' ? justDone.action : justDone.title,
                          )}
                    </Text>
                    <View style={styles.doneBannerActions}>
                      {justDone.kind === 'promise' ? (
                        <Pressable
                          onPress={() => {
                            const target = justDone;
                            setJustDone(null);
                            router.push(`/person/${target.personId}`);
                          }}>
                          <Text style={styles.doneBannerLink}>
                            {L.recallDoneMemoLink(justDone.personName)}
                          </Text>
                        </Pressable>
                      ) : (
                        <View />
                      )}
                      <Pressable onPress={handleUndo}>
                        <Text style={styles.doneBannerUndo}>{L.recallUndo}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                {recallRows.taskRows.map((task) => {
                  // 期限バッジは約束と同じ基準（3日以内・当日・期限切れ）で表示する
                  const daysLeft = dueDaysLeft(task.dueDate, todayStr);
                  const person = task.personId
                    ? people.find((p) => p.id === task.personId)
                    : undefined;
                  return (
                    <Pressable
                      key={`task-${task.id}`}
                      style={styles.promiseRow}
                      onPress={() => person && router.push(`/person/${person.id}`)}
                      onLongPress={() => handleTaskDelete(task)}
                      delayLongPress={500}>
                      <Pressable hitSlop={10} onPress={() => handleTaskDone(task)}>
                        <Ionicons name="ellipse-outline" size={20} color={AppColors.accent} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.promiseAction} numberOfLines={1}>
                          {task.title}
                        </Text>
                        <Text style={styles.promiseSub}>
                          {person ? person.name : L.taskSelf}
                          {L.promiseDue(task.dueDate)}
                        </Text>
                      </View>
                      {daysLeft != null && daysLeft <= 3 && (
                        <View
                          style={[
                            styles.dueBadge,
                            daysLeft > 0 ? styles.dueBadgeSoon : styles.dueBadgeDanger,
                          ]}>
                          <Text
                            style={[
                              styles.dueBadgeText,
                              daysLeft > 0 ? styles.dueBadgeTextSoon : styles.dueBadgeTextDanger,
                            ]}>
                            {daysLeft < 0
                              ? L.recallOverdue
                              : daysLeft === 0
                                ? L.recallDueToday
                                : L.recallDueSoon(daysLeft)}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
                {recallRows.promiseRows.map((item) => {
                  // 期限が近い/過ぎた約束だけバッジで目立たせる（3日超先はバッジなしで静かに）
                  const daysLeft = dueDaysLeft(item.memo.promise!.dueDate, todayStr);
                  return (
                    <Pressable
                      key={item.memo.id}
                      style={styles.promiseRow}
                      onPress={() => router.push(`/person/${item.person.id}`)}>
                      <Pressable hitSlop={10} onPress={() => handlePromiseDone(item)}>
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
                      {/* サンプル行は初期デモ状態でしか出ないが、架空の約束だと分かる目印を付ける */}
                      {item.person.sample && (
                        <View style={[styles.dueBadge, styles.sampleBadge]}>
                          <Text style={[styles.dueBadgeText, styles.sampleBadgeText]}>
                            {L.recallSampleBadge}
                          </Text>
                        </View>
                      )}
                      {daysLeft != null && daysLeft <= 3 && (
                        <View
                          style={[
                            styles.dueBadge,
                            daysLeft > 0 ? styles.dueBadgeSoon : styles.dueBadgeDanger,
                          ]}>
                          <Text
                            style={[
                              styles.dueBadgeText,
                              daysLeft > 0 ? styles.dueBadgeTextSoon : styles.dueBadgeTextDanger,
                            ]}>
                            {daysLeft < 0
                              ? L.recallOverdue
                              : daysLeft === 0
                                ? L.recallDueToday
                                : L.recallDueSoon(daysLeft)}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
                {recallRows.birthdayRows.map(({ person, month, day, daysUntil }) => (
                  <Pressable
                    key={`bday-${person.id}`}
                    style={styles.promiseRow}
                    onPress={() => router.push(`/person/${person.id}`)}>
                    <Ionicons name="gift-outline" size={20} color={AppColors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promiseAction} numberOfLines={1}>
                        {daysUntil === 0 ? L.recallBirthdayToday : L.recallBirthdayIn(daysUntil)}
                      </Text>
                      <Text style={styles.promiseSub}>
                        {person.name} ・ {month}/{day}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {recallRows.hidden > 0 && (
                  <Text style={styles.digestMore}>{L.todoMore(recallRows.hidden)}</Text>
                )}
                {/* 上限に隠れた記憶がある瞬間が、いちばんProの価値が伝わる場所 */}
                {FEATURES.paidPlans && settings.currentPlan !== 'pro' && recallRows.hidden > 0 && (
                  <Pressable style={styles.proUpsellRow} onPress={() => router.push('/plans')}>
                    <Ionicons name="flash-outline" size={13} color={AppColors.primary} />
                    <Text style={styles.proUpsellText}>{L.recallProUpsell}</Text>
                  </Pressable>
                )}
                {recallRows.taskRows.length === 0 &&
                  recallRows.promiseRows.length === 0 &&
                  recallRows.birthdayRows.length === 0 &&
                  !justDone && <Text style={styles.recallEmptyText}>{L.recallEmpty}</Text>}
                {!addingTask ? (
                  <Pressable style={styles.taskAddRow} onPress={openTaskForm}>
                    <Ionicons name="add-circle-outline" size={16} color={AppColors.primary} />
                    <Text style={styles.taskAddText}>{L.taskAddButton}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.taskForm}>
                    <TextInput
                      value={taskTitle}
                      onChangeText={setTaskTitle}
                      placeholder={L.taskTitlePlaceholder}
                      placeholderTextColor={AppColors.muted}
                      style={styles.input}
                      onSubmitEditing={handleAddTask}
                    />
                    <Text style={styles.taskFormLabel}>{L.taskDueLabel}</Text>
                    <DatePickerField value={taskDue} onChange={setTaskDue} />
                    {taskPeopleOptions.length > 0 && (
                      <>
                        <Text style={styles.taskFormLabel}>{L.taskPersonLabel}</Text>
                        <View style={styles.projectRow}>
                          <Pressable
                            style={[
                              styles.projectChip,
                              taskPersonId === undefined && styles.projectChipSelected,
                            ]}
                            onPress={() => setTaskPersonId(undefined)}>
                            <Text
                              style={[
                                styles.projectChipText,
                                taskPersonId === undefined && styles.projectChipTextSelected,
                              ]}>
                              {L.taskPersonNone}
                            </Text>
                          </Pressable>
                          {taskPeopleOptions.map((p) => (
                            <Pressable
                              key={p.id}
                              style={[
                                styles.projectChip,
                                taskPersonId === p.id && styles.projectChipSelected,
                              ]}
                              onPress={() => setTaskPersonId(p.id)}>
                              <Text
                                style={[
                                  styles.projectChipText,
                                  taskPersonId === p.id && styles.projectChipTextSelected,
                                ]}>
                                {p.avatarEmoji} {p.name}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    )}
                    <View style={styles.taskFormButtons}>
                      <Pressable style={styles.taskCancelButton} onPress={() => setAddingTask(false)}>
                        <Text style={styles.taskCancelText}>{L.personCancel}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.taskCreateButton, !taskTitle.trim() && styles.saveButtonDisabled]}
                        disabled={!taskTitle.trim()}
                        onPress={handleAddTask}>
                        <Text style={styles.taskCreateButtonText}>{L.taskCreate}</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.taskHint}>{L.taskDeleteHint}</Text>
                  </View>
                )}
              </View>

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
  // 下端はセーフエリア＋タブバー高＋余裕を確保（最下部のボタンが隠れない）
  content: { padding: 20, paddingTop: 12, gap: 16, paddingBottom: 120 },
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
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  streakChip: {
    backgroundColor: AppColors.dangerSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  streakChipText: { fontSize: 12, fontWeight: '800', color: AppColors.danger },
  streakHint: { fontSize: 12, color: AppColors.danger, fontWeight: '700', marginTop: -4 },
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
  dueBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  sampleBadge: { backgroundColor: AppColors.primarySoft },
  sampleBadgeText: { color: AppColors.muted },
  dueBadgeDanger: { backgroundColor: AppColors.dangerSoft },
  dueBadgeSoon: { backgroundColor: AppColors.accentSoft },
  dueBadgeText: { fontSize: 11, fontWeight: '800' },
  dueBadgeTextDanger: { color: AppColors.danger },
  dueBadgeTextSoon: { color: AppColors.accent },
  doneBanner: { backgroundColor: AppColors.successSoft, borderRadius: 10, padding: 10, gap: 8 },
  doneBannerText: { fontSize: 13, color: AppColors.text, lineHeight: 18 },
  doneBannerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  doneBannerLink: { fontSize: 13, color: AppColors.primary, fontWeight: '700', flexShrink: 1 },
  doneBannerUndo: { fontSize: 13, color: AppColors.muted, fontWeight: '700' },
  proUpsellRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  proUpsellText: { fontSize: 12, color: AppColors.primary, fontWeight: '700' },
  recallEmptyText: { fontSize: 13, color: AppColors.muted, lineHeight: 19 },
  taskAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, minHeight: 32 },
  taskAddText: { fontSize: 13, color: AppColors.primary, fontWeight: '700' },
  taskForm: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: AppColors.line,
    paddingTop: 12,
  },
  taskFormLabel: { fontSize: 12, fontWeight: '800', color: AppColors.muted },
  taskFormButtons: { flexDirection: 'row', gap: 10 },
  taskCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.line,
    borderRadius: 10,
    paddingVertical: 11,
    minHeight: 42,
  },
  taskCancelText: { color: AppColors.muted, fontWeight: '700', fontSize: 13 },
  taskCreateButton: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    minHeight: 42,
  },
  taskCreateButtonText: { color: AppColors.background, fontWeight: '700', fontSize: 13 },
  taskHint: { fontSize: 11, color: AppColors.muted, lineHeight: 15 },
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
