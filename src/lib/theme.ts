import { AppPalette, DarkColors, LightColors } from '@/constants/app-colors';
import { useSettings } from '@/store/settings-context';

// 画面ごとにダーク/ライト両方のStyleSheetを事前生成し、テーマ設定に応じて切り替える
export function makeThemed<T>(make: (colors: AppPalette) => T) {
  return {
    dark: { styles: make(DarkColors), AppColors: DarkColors as AppPalette },
    light: { styles: make(LightColors), AppColors: LightColors },
  };
}

export function useTheme<T>(themed: { dark: T; light: T }): T {
  const { settings } = useSettings();
  return themed[settings.theme];
}

export function useThemeName() {
  const { settings } = useSettings();
  return settings.theme;
}
