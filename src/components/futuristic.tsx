import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { glow } from '@/constants/app-colors';
import { useThemeName } from '@/lib/theme';

// アプリ全体の「近未来」シグネチャ配色（紫→シアンのグラデーション）
export const BRAND_GRADIENT = ['#8B5CF6', '#0EA5E9'] as const;
const ORB_PURPLE = '#8B5CF6';
const ORB_CYAN = '#22D3EE';

// 画面背景に浮かぶ光のオーブ。コンテンツの背面に絶対配置で敷く
export function GlowBackground() {
  const isLight = useThemeName() === 'light';
  const strength = isLight ? 0.5 : 1;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[`rgba(139, 92, 246, ${0.30 * strength})`, 'rgba(139, 92, 246, 0)']}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 1, y: 1 }}
        style={[styles.orb, { width: 340, height: 340, borderRadius: 170, top: -120, right: -100 }]}
      />
      <LinearGradient
        colors={[`rgba(34, 211, 238, ${0.20 * strength})`, 'rgba(34, 211, 238, 0)']}
        start={{ x: 0.8, y: 0.2 }}
        end={{ x: 0, y: 1 }}
        style={[styles.orb, { width: 300, height: 300, borderRadius: 150, top: 260, left: -140 }]}
      />
      <LinearGradient
        colors={[`rgba(139, 92, 246, ${0.16 * strength})`, 'rgba(139, 92, 246, 0)']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.orb, { width: 260, height: 260, borderRadius: 130, bottom: -80, right: -60 }]}
      />
    </View>
  );
}

// 画面タイトルの下に敷く、短いグラデーションバー
export function TitleAccent({ style }: { style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={[ORB_CYAN, ORB_PURPLE]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.titleAccent, style]}
    />
  );
}

type GradientButtonProps = {
  label: string;
  onPress: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  children?: ReactNode;
};

// 主要CTA用のグラデーションボタン（紫→シアン、発光付き）
export function GradientButton({
  label,
  onPress,
  iconName,
  iconRight,
  loading,
  disabled,
  style,
}: GradientButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.buttonWrap, glow(ORB_PURPLE), isDisabled && styles.buttonDisabled, style]}>
      <LinearGradient
        colors={BRAND_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.buttonInner}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          iconName && <Ionicons name={iconName} size={16} color="#FFFFFF" />
        )}
        <Text style={styles.buttonText}>{label}</Text>
        {iconRight && !loading && <Ionicons name={iconRight} size={17} color="#FFFFFF" />}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute' },
  titleAccent: { width: 52, height: 4, borderRadius: 2, marginTop: 6 },
  buttonWrap: { borderRadius: 14 },
  buttonDisabled: { opacity: 0.5 },
  buttonInner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
