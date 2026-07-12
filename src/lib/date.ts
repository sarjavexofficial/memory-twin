import { useEffect, useState } from 'react';

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// ---- 住んでいる国のタイムゾーン ----
// 設定画面で選んだ国のタイムゾーン（IANA名）。'auto'/未設定なら端末のタイムゾーンに従う。
// SettingsProviderが起動時と変更時に setAppTimeZone を呼んで反映する。
let appTimeZone: string | null = null;

export function setAppTimeZone(tz: string | null | undefined) {
  appTimeZone = tz && tz !== 'auto' ? tz : null;
}

export function getAppTimeZone(): string | null {
  return appTimeZone;
}

// 指定タイムゾーンでの YYYY-MM-DD（en-CAロケールはこの形式で出力される）
function formatDateInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// アプリ基準の日付 (YYYY-MM-DD)。国設定があればその国、なければ端末のタイムゾーン。
// toISOString()はUTCのため、日本では朝9時まで前日になってしまう。日付は必ずこちらを使う
export function formatLocalDate(d: Date): string {
  if (appTimeZone) {
    try {
      return formatDateInTimeZone(d, appTimeZone);
    } catch {
      // 不正なタイムゾーン名などの場合は端末基準にフォールバック
    }
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocal(): string {
  return formatLocalDate(new Date());
}

export function currentMonthLocal(): string {
  return todayLocal().slice(0, 7); // YYYY-MM
}

export function daysAgoLocal(days: number): string {
  return formatLocalDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

// 指定タイムゾーンのUTCオフセット（ミリ秒）を求める
function utcOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // "24"時が返る環境対策
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// アプリ基準タイムゾーンで「次にhour時00分になる実時刻」を返す（通知のスケジュールに使う）
export function nextOccurrenceAtHour(hour: number): Date {
  const now = new Date();
  if (!appTimeZone) {
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  try {
    for (let addDay = 0; addDay <= 1; addDay++) {
      const dateStr = formatLocalDate(new Date(now.getTime() + addDay * 24 * 60 * 60 * 1000));
      // その国の壁時計 hour:00 をUTC実時刻へ変換
      const wallClockAsUtc = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`);
      const instant = new Date(wallClockAsUtc.getTime() - utcOffsetMs(appTimeZone, wallClockAsUtc));
      if (instant > now) return instant;
    }
  } catch {
    // Intl非対応環境では端末時刻にフォールバック
  }
  const fallback = new Date(now);
  fallback.setHours(hour, 0, 0, 0);
  if (fallback <= now) fallback.setDate(fallback.getDate() + 1);
  return fallback;
}

// 画面を開いたまま日付をまたいでも表示が切り替わるフック（30秒ごとに日付変化を確認）
export function useTodayLocal(): string {
  const [date, setDate] = useState(todayLocal());
  useEffect(() => {
    const timer = setInterval(() => {
      const now = todayLocal();
      setDate((prev) => (prev === now ? prev : now));
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, []);
  return date;
}
