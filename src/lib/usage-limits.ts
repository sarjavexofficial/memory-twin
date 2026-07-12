import AsyncStorage from '@react-native-async-storage/async-storage';

// 無料プランの回数制限（端末内カウント）。プラン比較表の表記と必ず対応させること
// - 履歴インポート: 3回まで
// - 月次レポート: 全体で1回だけ閲覧できる（お試し）

export const FREE_IMPORT_LIMIT = 3;

const IMPORT_COUNT_KEY = 'memory-twin:import-count';
const REPORT_USED_KEY = 'memory-twin:monthly-report-used';

export async function getImportCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(IMPORT_COUNT_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function incrementImportCount(): Promise<void> {
  const n = await getImportCount();
  AsyncStorage.setItem(IMPORT_COUNT_KEY, String(n + 1)).catch(() => {});
}

export async function hasUsedFreeMonthlyReport(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(REPORT_USED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function markFreeMonthlyReportUsed(): Promise<void> {
  AsyncStorage.setItem(REPORT_USED_KEY, 'true').catch(() => {});
}
