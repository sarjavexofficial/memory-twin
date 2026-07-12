import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AiConfigError, transcribeAudio } from '@/lib/ai';
import { useStrings } from '@/lib/i18n';
import { AppPalette } from '@/constants/app-colors';
import { makeThemed, useTheme } from '@/lib/theme';
import { useSettings } from '@/store/settings-context';

type VoiceState = 'idle' | 'recording' | 'processing';

// 表示言語に対応するWeb音声認識のロケール
const WEB_SPEECH_LANG: Record<string, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  zh: 'zh-CN',
  ko: 'ko-KR',
  fr: 'fr-FR',
  pt: 'pt-BR',
};

type Props = {
  // 文字起こし結果を親の入力欄へ渡す
  onText: (text: string) => void;
  // trueならアイコンだけの小型ボタン（検索欄など）。エラーはonErrorへ渡す
  compact?: boolean;
  onError?: (message: string) => void;
  disabled?: boolean;
};

// 音声入力ボタン。iPhoneでは録音→AIで文字起こし、Webではブラウザの音声認識を使う
export function VoiceInputButton({ onText, compact, onError, disabled }: Props) {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const { settings } = useSettings();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const webRecognitionRef = useRef<{ stop: () => void } | null>(null);
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);

  function reportError(message: string) {
    if (onError) onError(message);
    else setError(message);
  }

  async function toggleNative() {
    if (state === 'processing') return;
    if (state === 'idle') {
      setError(null);
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        reportError(L.voiceNeedsPermission);
        return;
      }
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setState('recording');
      } catch (e) {
        reportError(`${L.voiceErrorGeneric} ${(e as Error).message}`);
      }
      return;
    }
    // 録音停止 → AIで文字起こし
    setState('processing');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri) throw new Error(L.voiceNoRecording);
      const base64 = await new File(recorder.uri).base64();
      const text = await transcribeAudio(base64, 'audio/mp4', settings.language);
      if (text) onText(text);
    } catch (e) {
      reportError(e instanceof AiConfigError ? e.message : `${L.voiceErrorGeneric} ${(e as Error).message}`);
    } finally {
      setState('idle');
    }
  }

  function toggleWeb() {
    if (state === 'recording') {
      webRecognitionRef.current?.stop();
      return;
    }
    // Web版はブラウザ標準の音声認識（対応ブラウザのみ・AI利用枠を消費しない）
    const SpeechRecognitionImpl =
      (globalThis as any).webkitSpeechRecognition ?? (globalThis as any).SpeechRecognition;
    if (!SpeechRecognitionImpl) {
      reportError(L.voiceErrorWeb);
      return;
    }
    setError(null);
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = WEB_SPEECH_LANG[settings.language] ?? 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    let finalText = '';
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
    };
    recognition.onerror = () => {
      reportError(L.voiceErrorGeneric);
      setState('idle');
    };
    recognition.onend = () => {
      if (finalText.trim()) onText(finalText.trim());
      setState('idle');
    };
    webRecognitionRef.current = recognition;
    recognition.start();
    setState('recording');
  }

  const handlePress = Platform.OS === 'web' ? toggleWeb : toggleNative;
  const isRecording = state === 'recording';
  const isProcessing = state === 'processing';

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled || isProcessing}
        hitSlop={8}
        style={[styles.compactButton, isRecording && styles.compactButtonRecording]}>
        {isProcessing ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <Ionicons
            name={isRecording ? 'stop' : 'mic-outline'}
            size={18}
            color={isRecording ? '#ffffff' : AppColors.muted}
          />
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePress}
        disabled={disabled || isProcessing}
        style={[styles.pillButton, isRecording && styles.pillButtonRecording, (disabled || isProcessing) && styles.pillDisabled]}>
        {isProcessing ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <Ionicons
            name={isRecording ? 'stop' : 'mic-outline'}
            size={16}
            color={isRecording ? '#ffffff' : AppColors.primary}
          />
        )}
        <Text style={[styles.pillText, isRecording && styles.pillTextRecording]}>
          {isProcessing ? L.voiceProcessing : isRecording ? L.voiceStop : L.voiceButton}
        </Text>
      </Pressable>
      {isRecording && <Text style={styles.hint}>{L.voiceRecordingHint}</Text>}
      {Platform.OS !== 'web' && isRecording && <Text style={styles.note}>{L.voiceNote}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
    container: { gap: 6 },
    pillButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      borderWidth: 1.5,
      borderColor: AppColors.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      minHeight: 40,
    },
    pillButtonRecording: { backgroundColor: AppColors.danger, borderColor: AppColors.danger },
    pillDisabled: { opacity: 0.6 },
    pillText: { fontSize: 13, fontWeight: '700', color: AppColors.primary },
    pillTextRecording: { color: '#ffffff' },
    compactButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactButtonRecording: { backgroundColor: AppColors.danger },
    hint: { fontSize: 12, color: AppColors.danger, fontWeight: '600' },
    note: { fontSize: 11, color: AppColors.muted, lineHeight: 16 },
    error: { fontSize: 12, color: AppColors.danger, lineHeight: 17 },
  });

const themed = makeThemed(makeStyles);
