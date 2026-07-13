import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { todayLocal } from '@/lib/date';
import { Memo, Person } from '@/lib/mock-data';
import { markLegacySamplePeople, refreshSamplePeople, samplePeopleFor } from '@/lib/sample-data';
import { recordSchemaVersion, stashCorruptData } from '@/lib/storage-guard';
import { useSettings } from '@/store/settings-context';

const STORAGE_KEY = 'memory-twin:people';
const LEGACY_STORAGE_KEY = 'relationship-memory:people';

type NewPersonInput = {
  name: string;
  relation: string;
  birthday?: string;
  likes: string[];
  photoUri?: string;
  color?: string;
};

type PeopleContextValue = {
  people: Person[];
  isLoaded: boolean;
  saveError: string | null;
  dismissSaveError: () => void;
  getPersonById: (id: string) => Person | undefined;
  isDuplicateName: (name: string) => boolean;
  addPerson: (input: NewPersonInput) => Person;
  updatePerson: (personId: string, updates: Partial<Omit<Person, 'id' | 'memos'>>) => void;
  deletePerson: (personId: string) => void;
  addMemoToPerson: (personId: string, memo: Omit<Memo, 'id'>) => void;
  deleteMemo: (personId: string, memoId: string) => void;
  togglePromiseDone: (personId: string, memoId: string) => void;
  restorePeople: (imported: Person[]) => number;
  clearAllPeople: () => void;
};

const PeopleContext = createContext<PeopleContextValue | null>(null);

const AVATAR_EMOJIS = ['🙂', '🌟', '🍀', '🎈', '🐣', '🌈', '🎵', '📚'];

export function PeopleProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [people, setPeople] = useState<Person[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        let raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            raw = legacy;
            await AsyncStorage.setItem(STORAGE_KEY, legacy);
            await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        }
        // 初回は日本語で種まきし、直後の言語同期エフェクトが選択言語へ差し替える
        setPeople(raw ? markLegacySamplePeople(JSON.parse(raw) as Person[]) : samplePeopleFor('ja'));
        recordSchemaVersion();
      } catch {
        // 読めなかった原本を退避してから初期化する（保存エフェクトの上書きでデータが消えるのを防ぐ）
        await stashCorruptData(STORAGE_KEY);
        setPeople(samplePeopleFor('ja'));
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  // サンプル人物（使い方を伝えるデモ）は表示言語に追従して差し替える。
  // オンボーディングでの言語選択にも、あとから設定で変えた場合にも同じ仕組みで対応する
  useEffect(() => {
    if (!isLoaded) return;
    setPeople((prev) => refreshSamplePeople(prev, settings.language));
  }, [isLoaded, settings.language]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(people))
      .then(() => setSaveError(null))
      .catch(() => setSaveError('データの保存に失敗しました。変更が端末に残らない可能性があります。'));
  }, [people, isLoaded]);

  function getPersonById(id: string) {
    return people.find((p) => p.id === id);
  }

  function isDuplicateName(name: string) {
    const target = name.trim();
    if (!target) return false;
    return people.some((p) => p.name.trim() === target);
  }

  function addPerson(input: NewPersonInput): Person {
    const newPerson: Person = {
      id: Date.now().toString(),
      name: input.name,
      relation: input.relation,
      avatarEmoji: AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)],
      photoUri: input.photoUri,
      color: input.color,
      birthday: input.birthday || undefined,
      likes: input.likes,
      dislikes: [],
      lastContact: todayLocal(),
      memos: [],
    };
    setPeople((prev) => [newPerson, ...prev]);
    return newPerson;
  }

  // 以降の編集系操作では sample フラグを外す = ユーザー自身のデータに昇格し、言語切替で上書きされなくなる
  function updatePerson(personId: string, updates: Partial<Omit<Person, 'id' | 'memos'>>) {
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, ...updates, sample: undefined } : p)));
  }

  function deletePerson(personId: string) {
    setPeople((prev) => prev.filter((p) => p.id !== personId));
  }

  function addMemoToPerson(personId: string, memo: Omit<Memo, 'id'>) {
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId
          ? {
              ...p,
              sample: undefined,
              lastContact: memo.date > p.lastContact ? memo.date : p.lastContact,
              memos: [{ id: Date.now().toString(), ...memo }, ...p.memos],
            }
          : p,
      ),
    );
  }

  function deleteMemo(personId: string, memoId: string) {
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId ? { ...p, sample: undefined, memos: p.memos.filter((m) => m.id !== memoId) } : p,
      ),
    );
  }

  function togglePromiseDone(personId: string, memoId: string) {
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId
          ? {
              ...p,
              sample: undefined,
              memos: p.memos.map((m) =>
                m.id === memoId && m.promise ? { ...m, promise: { ...m.promise, done: !m.promise.done } } : m,
              ),
            }
          : p,
      ),
    );
  }

  // バックアップからの復元。既にある人物（同じID）は飛ばして追加分だけ取り込む。
  // 復元した人物はユーザー自身のデータとして扱う（sampleフラグを外し、言語切替で消えないようにする）
  function restorePeople(imported: Person[]): number {
    let added = 0;
    setPeople((prev) => {
      const existing = new Set(prev.map((p) => p.id));
      const fresh = imported
        .filter((p) => p && typeof p.id === 'string' && !existing.has(p.id))
        .map((p) => ({ ...p, sample: undefined }));
      added = fresh.length;
      return fresh.length > 0 ? [...fresh, ...prev] : prev;
    });
    return added;
  }

  return (
    <PeopleContext.Provider
      value={{
        people,
        isLoaded,
        saveError,
        dismissSaveError: () => setSaveError(null),
        getPersonById,
        isDuplicateName,
        addPerson,
        updatePerson,
        deletePerson,
        addMemoToPerson,
        deleteMemo,
        togglePromiseDone,
        restorePeople,
        clearAllPeople: () => setPeople([]),
      }}>
      {children}
    </PeopleContext.Provider>
  );
}

export function usePeople() {
  const ctx = useContext(PeopleContext);
  if (!ctx) throw new Error('usePeople must be used within PeopleProvider');
  return ctx;
}
