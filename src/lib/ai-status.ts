// Sarjavex AI API（無料サーバー）はしばらく使われないとスリープし、起床に最大1分ほどかかる。
// このモジュールは「AI呼び出しが長引いている＝サーバーを起こしている」状態を
// 全画面共通のバナー（ai-waking-banner）へ伝える。Reactに依存しないただの通知役。

type Listener = (waking: boolean) => void;

// 通常のAI応答では超えない長さ。これを超えたら「起こしている」案内を出す
const WAKING_THRESHOLD_MS = 5000;

const listeners = new Set<Listener>();
let pendingCalls = 0;
let wakingTimer: ReturnType<typeof setTimeout> | null = null;
let isWaking = false;

function notify(value: boolean) {
  if (isWaking === value) return;
  isWaking = value;
  listeners.forEach((fn) => fn(value));
}

export function subscribeAiWaking(fn: Listener): () => void {
  listeners.add(fn);
  fn(isWaking); // 途中から購読しても現在の状態が分かるように即時通知
  return () => {
    listeners.delete(fn);
  };
}

// AI呼び出しの開始/終了。複数の呼び出しが重なっても、最後の1件が終わるまで表示を保つ
export function aiCallStarted() {
  pendingCalls += 1;
  if (pendingCalls === 1) {
    wakingTimer = setTimeout(() => notify(true), WAKING_THRESHOLD_MS);
  }
}

export function aiCallEnded() {
  pendingCalls = Math.max(0, pendingCalls - 1);
  if (pendingCalls === 0) {
    if (wakingTimer) {
      clearTimeout(wakingTimer);
      wakingTimer = null;
    }
    notify(false);
  }
}
