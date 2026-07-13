import AsyncStorage from '@react-native-async-storage/async-storage';

// 「アップデートしたらデータが消えた」を防ぐための保全レイヤー。
// - スキーマ世代番号: 将来データ形式を変えるとき、読み込み側が世代を見て安全に移行するための土台
// - 破損データの退避: 読めなかった原本をサンプルで上書きして消してしまう前に、別キーへ逃がす

const SCHEMA_KEY = 'memory-twin:schema-version';
export const CURRENT_SCHEMA_VERSION = 1;

// 起動時に現行世代を記録する。将来、形式変更したバージョンはここで旧世代→新世代の移行を行う
export async function recordSchemaVersion(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(SCHEMA_KEY);
    if (v !== String(CURRENT_SCHEMA_VERSION)) {
      await AsyncStorage.setItem(SCHEMA_KEY, String(CURRENT_SCHEMA_VERSION));
    }
  } catch {
    // 記録に失敗しても起動は続行する（次回起動時に再試行される）
  }
}

// 壊れて読めなかったデータを初期化で上書きする前に原本を退避する（後から手動復旧できる）
export async function stashCorruptData(storageKey: string): Promise<void> {
  try {
    const broken = await AsyncStorage.getItem(storageKey);
    if (broken) await AsyncStorage.setItem(`${storageKey}:corrupt-backup`, broken);
  } catch {
    // 退避自体の失敗時は何もできないが、元データの上書きは呼び出し側の初期化処理に委ねる
  }
}
