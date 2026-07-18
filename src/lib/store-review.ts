import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// App Store標準の評価依頼（星のポップアップ）。
// 「記録が増えた＝アプリが役立っている瞬間」にだけ、節目ごとに1回お願いする。
// - 表示回数はApple側でも年3回までに制限されるため、こちらは節目管理だけ行う
// - expo-store-reviewはネイティブ部品。未搭載の旧ビルド（ビルド8等）やWebでは静かに何もしない
const ASKED_KEY = 'memorytwin.reviewAskedMilestones.v1';
const MILESTONES = [5, 20, 50];

export async function maybeAskForReview(realEntryCount: number): Promise<void> {
  if (Platform.OS === 'web') return;
  const milestone = MILESTONES.find((m) => realEntryCount === m);
  if (!milestone) return;
  try {
    const asked = JSON.parse((await AsyncStorage.getItem(ASKED_KEY)) ?? '[]') as number[];
    if (asked.includes(milestone)) return;
    const StoreReview = require('expo-store-review') as typeof import('expo-store-review');
    if (!(await StoreReview.isAvailableAsync())) return;
    // 保存完了の余韻と重ならないよう、少し置いてから出す
    await new Promise((r) => setTimeout(r, 1200));
    await StoreReview.requestReview();
    await AsyncStorage.setItem(ASKED_KEY, JSON.stringify([...asked, milestone]));
  } catch {
    // 部品が無い環境・表示失敗は無視（記録の保存自体には一切影響させない）
  }
}
