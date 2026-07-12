// AIの返答言語の共有ホルダー。
// UIの表示言語（settings-context）とAIプロンプト（ai.ts）の橋渡しだけを行う小さなモジュール。
// 双方から直接importし合うと循環参照になるため、依存ゼロのファイルとして独立させている。

import type { Language } from '@/store/settings-context';

const LANGUAGE_NAMES: Record<Language, string> = {
  ja: '日本語',
  en: '英語（English）',
  zh: '簡体字中国語（简体中文）',
  ko: '韓国語（한국어）',
  fr: 'フランス語（français）',
  pt: 'ポルトガル語（português）',
};

let current: Language = 'ja';

export function setAiResponseLanguage(lang: Language) {
  current = lang;
}

// プロンプトに差し込む言語指示。日本語（既定）のときは何も足さない
export function languageInstruction(): string {
  if (current === 'ja') return '';
  return `重要: ユーザーの表示言語は${LANGUAGE_NAMES[current]}です。出力するテキスト（JSONの値を含む）はすべて${LANGUAGE_NAMES[current]}で書いてください。`;
}
