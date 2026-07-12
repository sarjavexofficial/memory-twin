// 誕生日（自由入力の文字列）の解析と「次の誕生日まであと何日か」の計算。
// 対応する書き方: 「3月14日」「3월 14일」「3/14」「03-14」「March 14」「14 mars」など。
// 読み取れない書き方は静かに無視する（誕生日リコールに出ないだけで、他機能に影響しない）

const MONTH_NAMES: Record<string, number> = {
  // 英語
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // フランス語
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  // ポルトガル語
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function valid(month: number, day: number): { month: number; day: number } | null {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : null;
}

export function parseBirthday(raw: string | undefined): { month: number; day: number } | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  // 日本語・中国語「3月14日」
  let m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (m) return valid(Number(m[1]), Number(m[2]));
  // 韓国語「3월 14일」
  m = s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (m) return valid(Number(m[1]), Number(m[2]));
  // 数字だけ「3/14」「03-14」「3.14」
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return valid(Number(m[1]), Number(m[2]));
  // 「march 14」形式
  m = s.match(/([a-zà-ÿ]+)\s+(\d{1,2})/);
  if (m && MONTH_NAMES[m[1]]) return valid(MONTH_NAMES[m[1]], Number(m[2]));
  // 「14 mars」形式
  m = s.match(/(\d{1,2})\s+(?:de\s+)?([a-zà-ÿ]+)/);
  if (m && MONTH_NAMES[m[2]]) return valid(MONTH_NAMES[m[2]], Number(m[1]));
  return null;
}

// 今日（YYYY-MM-DD・国設定基準）から見て、次の誕生日まで何日あるか（年またぎ対応・当日は0）
export function daysUntilBirthday(
  birthday: string | undefined,
  today: string,
): { month: number; day: number; daysUntil: number } | null {
  const p = parseBirthday(birthday);
  if (!p) return null;
  const [y, tm, td] = today.split('-').map(Number);
  if (!y || !tm || !td) return null;
  const t = Date.UTC(y, tm - 1, td);
  let b = Date.UTC(y, p.month - 1, p.day);
  if (b < t) b = Date.UTC(y + 1, p.month - 1, p.day);
  return { ...p, daysUntil: Math.round((b - t) / 86400000) };
}
