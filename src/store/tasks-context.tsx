import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { todayLocal } from '@/lib/date';
import { stashCorruptData } from '@/lib/storage-guard';
import { UserTask } from '@/lib/task-data';

const STORAGE_KEY = 'memory-twin:tasks';

type NewTaskInput = {
  title: string;
  dueDate: string; // YYYY-MM-DD
  personId?: string;
};

type TasksContextValue = {
  tasks: UserTask[];
  isLoaded: boolean;
  saveError: string | null;
  dismissSaveError: () => void;
  addTask: (input: NewTaskInput) => void;
  toggleTaskDone: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
  restoreTask: (task: UserTask) => void;
  restoreTasks: (imported: UserTask[]) => number;
  clearAllTasks: () => void;
};

const TasksContext = createContext<TasksContextValue | null>(null);

// 期限が近い順（同じ日なら先に作った順）に保つ。表示側でそのまま使える
function sortTasks(list: UserTask[]): UserTask[] {
  return [...list].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt),
  );
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // タスクにはサンプル（デモ）データを用意しない: 空の状態から自分で追加してもらう機能のため
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        setTasks(raw ? sortTasks(JSON.parse(raw) as UserTask[]) : []);
      } catch {
        // 読めなかった原本を退避してから初期化する（保存エフェクトの上書きでデータが消えるのを防ぐ）
        await stashCorruptData(STORAGE_KEY);
        setTasks([]);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
      .then(() => setSaveError(null))
      .catch(() => setSaveError('タスクの保存に失敗しました。変更が端末に残らない可能性があります。'));
  }, [tasks, isLoaded]);

  function addTask(input: NewTaskInput) {
    const task: UserTask = {
      id: Date.now().toString(),
      title: input.title,
      dueDate: input.dueDate,
      personId: input.personId,
      done: false,
      createdAt: todayLocal(),
    };
    setTasks((prev) => sortTasks([...prev, task]));
  }

  function toggleTaskDone(taskId: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, done: !t.done, doneAt: !t.done ? todayLocal() : undefined }
          : t,
      ),
    );
  }

  function deleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  // 削除の「元に戻す」用。削除時に持っていたタスクをそのまま書き戻す
  function restoreTask(task: UserTask) {
    setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : sortTasks([...prev, task])));
  }

  // バックアップからの復元。既にあるタスク（同じID）は飛ばすため、何度復元しても重複しない
  function restoreTasks(imported: UserTask[]): number {
    let added = 0;
    setTasks((prev) => {
      const existing = new Set(prev.map((t) => t.id));
      const fresh = imported.filter((t) => t && typeof t.id === 'string' && !existing.has(t.id));
      added = fresh.length;
      return fresh.length > 0 ? sortTasks([...prev, ...fresh]) : prev;
    });
    return added;
  }

  return (
    <TasksContext.Provider
      value={{
        tasks,
        isLoaded,
        saveError,
        dismissSaveError: () => setSaveError(null),
        addTask,
        toggleTaskDone,
        deleteTask,
        restoreTask,
        restoreTasks,
        clearAllTasks: () => setTasks([]),
      }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within TasksProvider');
  return ctx;
}
