import { Ionicons } from '@expo/vector-icons';
import { Component, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppColors } from '@/constants/app-colors';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Ionicons name="warning-outline" size={36} color={AppColors.danger} />
          <Text style={styles.title}>問題が発生しました</Text>
          <Text style={styles.message}>{error.message || '予期しないエラーが発生しました。'}</Text>
          <Pressable style={styles.button} onPress={this.reset}>
            <Text style={styles.buttonText}>やり直す</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: '800', color: AppColors.text },
  message: { fontSize: 14, color: AppColors.muted, textAlign: 'center', lineHeight: 20 },
  button: {
    marginTop: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: AppColors.background, fontWeight: '700', fontSize: 15 },
});
