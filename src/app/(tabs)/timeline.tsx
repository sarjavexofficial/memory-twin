import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlowBackground, TitleAccent } from '@/components/futuristic';
import { AppPalette } from '@/constants/app-colors';
import { confirmAsync } from '@/lib/confirm';
import { displayTag, useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';
import { MOOD_EMOJIS } from '@/lib/journal-data';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';

type TimelineItem = {
  key: string;
  date: string;
  kind: 'journal' | 'person';
  text: string;
  moodEmoji?: string;
  sleepHours?: number;
  tags?: string[];
  personId?: string;
  personName?: string;
  entryId?: string;
  source?: string;
  project?: string;
};

export default function TimelineScreen() {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { entries, deleteEntry } = useJournal();
  const { people } = usePeople();
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');

  function monthLabel(key: string) {
    const [y, m] = key.split('-');
    return L.monthLabel(Number(y), Number(m));
  }

  const items = useMemo<TimelineItem[]>(() => {
    const list: TimelineItem[] = [];
    for (const e of entries) {
      list.push({
        key: `j-${e.id}`,
        date: e.date,
        kind: 'journal',
        text: e.text,
        moodEmoji: e.mood ? MOOD_EMOJIS[e.mood - 1] : undefined,
        sleepHours: e.sleepHours,
        tags: e.tags,
        entryId: e.id,
        source: e.source,
        project: e.project,
      });
    }
    for (const p of people) {
      for (const m of p.memos) {
        list.push({
          key: `p-${p.id}-${m.id}`,
          date: m.date,
          kind: 'person',
          text: m.text,
          tags: m.tags,
          personId: p.id,
          personName: p.name,
        });
      }
    }
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries, people]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(item.date.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [items]);

  const availableProjects = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.project) set.add(item.project);
    return Array.from(set).sort();
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items.filter(
        (i) =>
          (selectedMonth === 'all' || i.date.startsWith(selectedMonth)) &&
          (selectedProject === 'all' || i.project === selectedProject),
      ),
    [items, selectedMonth, selectedProject],
  );

  async function handleDeleteEntry(entryId: string) {
    const proceed = await confirmAsync(L.deleteEntryTitle, L.deleteEntryMessage);
    if (proceed) deleteEntry(entryId);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <GlowBackground />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{L.tabTimeline}</Text>
        <TitleAccent />
        <Text style={styles.desc}>{L.timelineDesc}</Text>

        <Pressable style={styles.analysisLink} onPress={() => router.push('/review')}>
          <Ionicons name="calendar-outline" size={20} color={AppColors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.analysisTitle}>{L.reviewLinkTitle}</Text>
            <Text style={styles.analysisDesc}>{L.reviewLinkDesc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={AppColors.muted} />
        </Pressable>

        <Pressable style={styles.analysisLink} onPress={() => router.push('/compare-past')}>
          <Ionicons name="hourglass-outline" size={20} color={AppColors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.analysisTitle}>{L.pastCompareLinkTitle}</Text>
            <Text style={styles.analysisDesc}>{L.pastCompareLinkDesc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={AppColors.muted} />
        </Pressable>

        <Pressable style={styles.analysisLink} onPress={() => router.push('/insights')}>
          <Ionicons name="stats-chart-outline" size={20} color={AppColors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.analysisTitle}>{L.insightsTitle}</Text>
            <Text style={styles.analysisDesc}>{L.insightsLinkDesc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={AppColors.muted} />
        </Pressable>

        <Pressable style={styles.analysisLink} onPress={() => router.push('/echoes')}>
          <Ionicons name="ear-outline" size={20} color={AppColors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.analysisTitle}>{L.echoesTitle}</Text>
            <Text style={styles.analysisDesc}>{L.echoesLinkDesc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={AppColors.muted} />
        </Pressable>

        {availableMonths.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.monthScroll}
            contentContainerStyle={styles.monthRow}>
            <Pressable
              style={[styles.monthChip, selectedMonth === 'all' && styles.monthChipSelected]}
              onPress={() => setSelectedMonth('all')}>
              <Text style={[styles.monthChipText, selectedMonth === 'all' && styles.monthChipTextSelected]}>
                {L.filterAll}
              </Text>
            </Pressable>
            {availableMonths.map((mk) => (
              <Pressable
                key={mk}
                style={[styles.monthChip, selectedMonth === mk && styles.monthChipSelected]}
                onPress={() => setSelectedMonth(mk)}>
                <Text style={[styles.monthChipText, selectedMonth === mk && styles.monthChipTextSelected]}>
                  {monthLabel(mk)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {availableProjects.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.monthScroll}
            contentContainerStyle={styles.monthRow}>
            <Pressable
              style={[styles.projectChip, selectedProject === 'all' && styles.projectChipSelected]}
              onPress={() => setSelectedProject('all')}>
              <Text
                style={[styles.projectChipText, selectedProject === 'all' && styles.projectChipTextSelected]}>
                {L.filterAll}
              </Text>
            </Pressable>
            {availableProjects.map((p) => (
              <Pressable
                key={p}
                style={[styles.projectChip, selectedProject === p && styles.projectChipSelected]}
                onPress={() => setSelectedProject(p)}>
                <Ionicons
                  name="folder-outline"
                  size={12}
                  color={selectedProject === p ? AppColors.primary : AppColors.muted}
                />
                <Text style={[styles.projectChipText, selectedProject === p && styles.projectChipTextSelected]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {selectedMonth !== 'all' && (
          <Text style={styles.filterSummary}>
            {L.monthRecords(monthLabel(selectedMonth), filteredItems.length)}
          </Text>
        )}

        {items.length === 0 ? (
          <Text style={styles.empty}>{L.emptyTimeline}</Text>
        ) : filteredItems.length === 0 ? (
          <Text style={styles.empty}>{L.emptyMonth(monthLabel(selectedMonth))}</Text>
        ) : (
          filteredItems.map((item) => (
            <View key={item.key} style={styles.item}>
              <View style={styles.itemHeaderRow}>
                <View style={styles.itemHeaderLeft}>
                  <View
                    style={[
                      styles.kindBadge,
                      item.kind === 'journal' ? styles.kindBadgeJournal : styles.kindBadgePerson,
                    ]}>
                    <Text
                      style={[
                        styles.kindBadgeText,
                        { color: item.kind === 'journal' ? AppColors.accent : AppColors.primary },
                      ]}>
                      {item.kind === 'journal'
                        ? item.source
                          ? displayTag(item.source, L)
                          : L.badgeSelf
                        : item.personName}
                    </Text>
                  </View>
                  <Text style={styles.itemDate}>
                    {item.moodEmoji ? `${item.moodEmoji} ` : ''}
                    {item.date}
                    {item.sleepHours ? L.sleepShort(item.sleepHours) : ''}
                  </Text>
                </View>
                {item.kind === 'journal' ? (
                  <Pressable onPress={() => handleDeleteEntry(item.entryId!)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={15} color={AppColors.muted} />
                  </Pressable>
                ) : (
                  <Pressable onPress={() => router.push(`/person/${item.personId}`)} hitSlop={10}>
                    <Ionicons name="chevron-forward" size={15} color={AppColors.muted} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.itemText}>{item.text}</Text>
              {((item.tags && item.tags.length > 0) || item.project) && (
                <View style={styles.tagRow}>
                  {item.project && (
                    <View style={styles.projectTag}>
                      <Ionicons name="folder-outline" size={11} color={AppColors.primary} />
                      <Text style={styles.projectTagText}>{item.project}</Text>
                    </View>
                  )}
                  {(item.tags ?? []).map((t) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{displayTag(t, L)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.background },
  content: { padding: 20, paddingTop: 12, gap: 14, paddingBottom: 100 },
  title: { fontSize: 26, fontWeight: '800', color: AppColors.text, letterSpacing: -0.5 },
  desc: { fontSize: 13, color: AppColors.muted, lineHeight: 19, marginTop: -6 },
  analysisLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: AppColors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 14,
  },
  analysisTitle: { fontSize: 14, fontWeight: '800', color: AppColors.text },
  analysisDesc: { fontSize: 12, color: AppColors.muted, marginTop: 2 },
  monthScroll: { marginHorizontal: -20 },
  monthRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppColors.line,
  },
  monthChipSelected: { backgroundColor: AppColors.accentSoft, borderColor: AppColors.accent },
  monthChipText: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
  monthChipTextSelected: { color: AppColors.accent, fontWeight: '800' },
  filterSummary: { fontSize: 13, color: AppColors.accent, fontWeight: '700' },
  empty: { textAlign: 'center', color: AppColors.muted, fontSize: 15, marginTop: 40, lineHeight: 22 },
  item: {
    borderLeftWidth: 2,
    borderLeftColor: AppColors.line,
    paddingLeft: 14,
    paddingBottom: 8,
    gap: 5,
  },
  itemHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  kindBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  kindBadgeJournal: { backgroundColor: AppColors.accentSoft },
  kindBadgePerson: { backgroundColor: AppColors.primarySoft },
  kindBadgeText: { fontSize: 11, fontWeight: '800' },
  itemDate: { fontSize: 12, color: AppColors.muted, fontWeight: '700' },
  itemText: { fontSize: 14, color: AppColors.text, lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: AppColors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagText: { color: AppColors.success, fontSize: 12, fontWeight: '700' },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppColors.line,
  },
  projectChipSelected: { backgroundColor: AppColors.primarySoft, borderColor: AppColors.primary },
  projectChipText: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
  projectChipTextSelected: { color: AppColors.primary, fontWeight: '800' },
  projectTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: AppColors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  projectTagText: { color: AppColors.primary, fontSize: 12, fontWeight: '700' },
});

const themed = makeThemed(makeStyles);
