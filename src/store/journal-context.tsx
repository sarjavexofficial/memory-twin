import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { JournalEntry } from '@/lib/journal-data';
import { markLegacySampleJournal, refreshSampleJournal, sampleJournalFor } from '@/lib/sample-data';
import { useSettings } from '@/store/settings-context';

const STORAGE_KEY = 'memory-twin:journal';

type NewEntryInput = {
  date: string;
  text: string;
  mood?: number;
  sleepHours?: number;
  tags?: string[];
  source?: string;
  project?: string;
};

type JournalContextValue = {
  entries: JournalEntry[];
  isLoaded: boolean;
  saveError: string | null;
  dismissSaveError: () => void;
  addEntry: (input: NewEntryInput) => void;
  addEntries: (inputs: NewEntryInput[]) => void;
  restoreEntries: (imported: JournalEntry[]) => number;
  deleteEntry: (entryId: string) => void;
  clearAllEntries: () => void;
};

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        // 初回は日本語で種まきし、直後の言語同期エフェクトが選択言語へ差し替える
        setEntries(raw ? markLegacySampleJournal(JSON.parse(raw) as JournalEntry[]) : sampleJournalFor('ja'));
      } catch {
        setEntries(sampleJournalFor('ja'));
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  // サンプル日記（デモ）は表示言語に追従して差し替える。ユーザーが追加した記録は対象外
  useEffect(() => {
    if (!isLoaded) return;
    setEntries((prev) => refreshSampleJournal(prev, settings.language));
  }, [isLoaded, settings.language]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
      .then(() => setSaveError(null))
      .catch(() => setSaveError('記録の保存に失敗しました。変更が端末に残らない可能性があります。'));
  }, [entries, isLoaded]);

  function addEntry(input: NewEntryInput) {
    setEntries((prev) =>
      [{ id: Date.now().toString(), ...input }, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)),
    );
  }

  function addEntries(inputs: NewEntryInput[]) {
    setEntries((prev) => {
      const base = Date.now();
      const added = inputs.map((input, i) => ({ id: `${base}-${i}`, ...input }));
      return [...added, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1));
    });
  }

  // バックアップからの復元。IDを保ったまま取り込み、既にある記録（同じID）は飛ばす。
  // 何度復元しても重複しないので、機械に詳しくない人が繰り返し押しても安全
  function restoreEntries(imported: JournalEntry[]): number {
    let added = 0;
    setEntries((prev) => {
      const existing = new Set(prev.map((e) => e.id));
      const fresh = imported
        .filter((e) => e && typeof e.id === 'string' && !existing.has(e.id))
        .map((e) => ({ ...e, sample: undefined }));
      added = fresh.length;
      return fresh.length > 0
        ? [...fresh, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1))
        : prev;
    });
    return added;
  }

  function deleteEntry(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  return (
    <JournalContext.Provider
      value={{
        entries,
        isLoaded,
        saveError,
        dismissSaveError: () => setSaveError(null),
        addEntry,
        addEntries,
        restoreEntries,
        deleteEntry,
        clearAllEntries: () => setEntries([]),
      }}>
      {children}
    </JournalContext.Provider>
  );
}

export function useJournal() {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal must be used within JournalProvider');
  return ctx;
}
