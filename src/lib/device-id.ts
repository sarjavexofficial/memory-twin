import AsyncStorage from '@react-native-async-storage/async-storage';

// サーバー側の利用回数制限・重複いいね防止に使う匿名の端末ID。初回に生成して端末内に保存する。
// 名前などの個人情報は一切含まず、この端末からの利用回数を数えるためだけに使う
const DEVICE_ID_KEY = 'memory-twin:device-id';
let deviceIdCache: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id).catch(() => {});
  }
  deviceIdCache = id;
  return id;
}
