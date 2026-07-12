import { Platform, ViewStyle } from 'react-native';

// デザインコンセプト: 近未来感（深い宇宙紺＋ネオンの発光）× 親しみやすさ（柔らかいラベンダー・大きな角丸）
export const DarkColors = {
  background: '#060A17',
  card: '#0E1630',
  text: '#F6F7FB',
  muted: '#9AA6C4',
  primary: '#A78BFA',
  primarySoft: 'rgba(167, 139, 250, 0.16)',
  accent: '#3DDCF2',
  accentSoft: 'rgba(61, 220, 242, 0.14)',
  success: '#3DDC97',
  successSoft: 'rgba(61, 220, 151, 0.14)',
  line: 'rgba(148, 163, 255, 0.18)',
  danger: '#FB7185',
  dangerSoft: 'rgba(251, 113, 133, 0.16)',
} as const;

export type AppPalette = { [K in keyof typeof DarkColors]: string };

export const LightColors: AppPalette = {
  background: '#F2F3FC',
  card: '#FFFFFF',
  text: '#171B2E',
  muted: '#6C7494',
  primary: '#7C3AED',
  primarySoft: 'rgba(124, 58, 237, 0.10)',
  accent: '#0891B2',
  accentSoft: 'rgba(8, 145, 178, 0.10)',
  success: '#059669',
  successSoft: 'rgba(5, 150, 105, 0.12)',
  line: 'rgba(124, 58, 237, 0.16)',
  danger: '#E11D48',
  dangerSoft: 'rgba(225, 29, 72, 0.10)',
};

// テーマ未対応の画面はダーク配色のまま（順次 useTheme へ移行する）
export const AppColors = DarkColors;

// 主要ボタンやカードに使う「ネオンの発光」効果（iOS/Webは色付きシャドウ、Androidはelevation）
export function glow(color: string, radius = 14, opacity = 0.45): ViewStyle {
  if (Platform.OS === 'android') return { elevation: 6 };
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 0 },
  };
}

// 人物の「関係性」タグに選べる色
export const RELATION_COLORS = ['#8B5CF6', '#22D3EE', '#34D399', '#FBBF24', '#FB7185', '#60A5FA'] as const;
