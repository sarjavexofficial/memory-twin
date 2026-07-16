import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiSendNote } from '@/components/ai-send-note';
import { AppColors } from '@/constants/app-colors';
import { AiConfigError, ExtractedItem, extractCommitments } from '@/lib/ai';
import { buildAliasMap } from '@/lib/alias';
import { BackupPayload, classifyJsonText, materializePhotos, PickedData, readBackupZip } from '@/lib/backup';
import { FEATURES } from '@/lib/feature-flags';
import { displayTag, useStrings } from '@/lib/i18n';
import { ImportedRecord, parseAiHistory } from '@/lib/import';
import { FREE_IMPORT_LIMIT, getImportCount, incrementImportCount } from '@/lib/usage-limits';
import { useJournal } from '@/store/journal-context';
import { usePeople } from '@/store/people-context';
import { useSettings } from '@/store/settings-context';
import { useTasks } from '@/store/tasks-context';

// 解析結果のプレビュー行数。画面を簡潔に保つため冒頭3件だけ見せ、残りは件数表示にまとめる
const PREVIEW_LIMIT = 3;

export default function ImportHistoryScreen() {
  const L = useStrings();
  const { addEntries, restoreEntries } = useJournal();
  const { people, restorePeople } = usePeople();
  const { restoreTasks } = useTasks();
  const { settings } = useSettings();

  // 無料プランのインポート回数制限（3回まで）。バックアップ復元は自分のデータなので数えない
  const [importCount, setImportCount] = useState(0);
  useEffect(() => {
    getImportCount().then(setImportCount);
  }, []);
  const importLimitReached =
    settings.currentPlan === 'free' && importCount >= FREE_IMPORT_LIMIT;
  const [rawText, setRawText] = useState('');
  const [records, setRecords] = useState<ImportedRecord[] | null>(null);
  const [backup, setBackup] = useState<BackupPayload | null>(null);
  const [restored, setRestored] = useState<{ j: number; p: number; t: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [lastImported, setLastImported] = useState<ImportedRecord[] | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ExtractedItem[] | null>(null);
  const [approved, setApproved] = useState<boolean[]>([]);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  // 画面を簡潔に保つための折りたたみ: 主役は「ファイルを選ぶ」1ボタン。
  // 取得方法ガイドと貼り付け入力は、必要な人だけ開く
  const [showHowTo, setShowHowTo] = useState(false);
  const [showPaste, setShowPaste] = useState(false);

  // 取り込み直後の自動発掘（初日の魔法）でも使うため、対象レコードを引数で受け取る
  async function runExtract(target: ImportedRecord[]) {
    if (target.length === 0) return;
    setIsExtracting(true);
    setExtractError(null);
    setCandidates(null);
    setSavedCount(null);
    try {
      const items = await extractCommitments(target, 30, buildAliasMap(people));
      setCandidates(items);
      setApproved(items.map(() => true));
    } catch (e) {
      setExtractError(e instanceof AiConfigError ? e.message : (e as Error).message);
    } finally {
      setIsExtracting(false);
    }
  }

  function handleExtract() {
    if (lastImported) runExtract(lastImported);
  }

  function handleApproveSave() {
    if (!candidates) return;
    const selected = candidates.filter((_, i) => approved[i]);
    if (selected.length === 0) return;
    addEntries(
      selected.map((item) => ({
        date: item.date,
        text: `【${item.type}】${item.text}`,
        tags: [item.type],
        source: '抽出',
      })),
    );
    setSavedCount(selected.length);
    setCandidates(null);
  }

  // 読み取ったファイルの中身に応じて表示を切り替える:
  // Memory Twinのバックアップ → 復元カード / それ以外のJSON → 従来の解析プレビュー
  function applyPicked(picked: PickedData) {
    setError(null);
    setBackup(null);
    setRecords(null);
    setImportedCount(null);
    setRestored(null);
    if (picked.kind === 'backup') {
      setBackup(picked.backup);
      return;
    }
    setRawText(picked.text);
    try {
      setRecords(parseAiHistory(picked.text));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function handleParse() {
    // 貼り付けたテキストがバックアップJSONならそのまま復元カードを出す
    applyPicked(classifyJsonText(rawText));
  }

  // ファイル選択（全プラットフォーム対応）。ZIPは解凍まで自動で行うので、
  // 利用者は「エクスポートしたファイルを選ぶだけ」でよい
  async function handlePickFile() {
    setError(null);
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.zip,application/json,application/zip';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 20 * 1024 * 1024) {
            setError(L.importFileTooLarge);
            return;
          }
          try {
            if (/\.zip$/i.test(file.name)) {
              applyPicked(await readBackupZip(await file.arrayBuffer()));
            } else {
              applyPicked(classifyJsonText(await file.text()));
            }
          } catch (e) {
            setError((e as Error).message);
          }
        };
        input.click();
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['application/json', 'application/zip', 'text/plain', 'public.json', 'public.zip-archive'],
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 20 * 1024 * 1024) {
        setError(L.importFileTooLarge);
        return;
      }
      const isZip = /\.zip$/i.test(asset.name ?? '') || asset.mimeType === 'application/zip';
      if (isZip) {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        applyPicked(await readBackupZip(base64));
      } else {
        applyPicked(classifyJsonText(await FileSystem.readAsStringAsync(asset.uri)));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // 完全バックアップの復元。同じIDの記録・人物・タスクは飛ばすため、何度押しても重複しない
  async function handleRestore() {
    if (!backup) return;
    const j = restoreEntries(backup.journal);
    // 埋め込まれた写真を端末のファイルに書き戻してから人物を復元する
    const p = restorePeople(await materializePhotos(backup.people));
    const t = restoreTasks(backup.tasks ?? []);
    setRestored({ j, p, t });
    setBackup(null);
    setRawText('');
  }

  function handleImport() {
    if (!records || records.length === 0) return;
    if (importLimitReached) return; // ボタンは出し分けているが、念のため処理側でも防ぐ
    addEntries(records.map((r) => ({ date: r.date, text: r.text, source: r.source })));
    incrementImportCount();
    setImportCount((c) => c + 1);
    setImportedCount(records.length);
    setLastImported(records);
    setRecords(null);
    setRawText('');
    // 初日の魔法: 取り込みが終わったら、忘れていた約束・決定を自動で発掘する
    // （取り込みボタンの下に「AIに送信される」旨を事前表示したうえでの自動実行）
    runExtract(records);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backRow}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={AppColors.primary} />
          <Text style={styles.backButton}>{L.back}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="download-outline" size={28} color={AppColors.accent} />
        </View>
        <Text style={styles.title}>{L.importTitle}</Text>
        <Text style={styles.desc}>{L.importDesc}</Text>
        <View style={styles.noteBox}>
          <Ionicons name="shield-checkmark-outline" size={14} color={AppColors.success} />
          <Text style={styles.noteText}>{L.importLocalNote}</Text>
        </View>

        <Pressable style={styles.fileButton} onPress={handlePickFile}>
          <Ionicons name="folder-open-outline" size={16} color={AppColors.primary} />
          <Text style={styles.fileButtonText}>{L.importPickFile}</Text>
        </Pressable>

        {/* エクスポートZIPの取り方（ChatGPT/Claude）。必要な人だけ開く折りたたみ */}
        <Pressable style={styles.toggleRow} onPress={() => setShowHowTo((v) => !v)} hitSlop={6}>
          <Ionicons
            name={showHowTo ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={AppColors.muted}
          />
          <Text style={styles.toggleText}>{L.importHowTo}</Text>
        </Pressable>
        {showHowTo && (
          <View style={styles.guideBox}>
            <Text style={styles.guideText}>{L.importHowToChatGPT}</Text>
            <Text style={styles.guideText}>{L.importHowToClaude}</Text>
          </View>
        )}

        {backup && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{L.backupFound}</Text>
            <Text style={styles.extractDesc}>
              {L.backupFoundDesc(backup.journal.length, backup.people.length)}
            </Text>
            <Pressable style={styles.importButton} onPress={handleRestore}>
              <Ionicons name="refresh-circle-outline" size={16} color={AppColors.background} />
              <Text style={styles.parseButtonText}>{L.backupRestore}</Text>
            </Pressable>
          </View>
        )}

        {restored && (
          <View style={styles.doneBox}>
            <Ionicons name="checkmark-circle" size={16} color={AppColors.success} />
            <Text style={styles.doneText}>{L.backupRestored(restored.j, restored.p, restored.t)}</Text>
          </View>
        )}

        {/* 貼り付け入力は補助手段なので折りたたみ、主導線（ファイル選択）を1ボタンに保つ */}
        <Pressable style={styles.toggleRow} onPress={() => setShowPaste((v) => !v)} hitSlop={6}>
          <Ionicons
            name={showPaste ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={AppColors.muted}
          />
          <Text style={styles.toggleText}>{L.importPasteToggle}</Text>
        </Pressable>
        {showPaste && (
          <>
            <TextInput
              value={rawText}
              onChangeText={setRawText}
              placeholder={L.importPastePlaceholder}
              placeholderTextColor={AppColors.muted}
              style={styles.textArea}
              multiline
            />

            <Pressable
              style={[styles.parseButton, !rawText.trim() && styles.buttonDisabled]}
              onPress={handleParse}
              disabled={!rawText.trim()}>
              <Ionicons name="search-outline" size={16} color={AppColors.background} />
              <Text style={styles.parseButtonText}>{L.importParse}</Text>
            </Pressable>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {records && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>
              {L.importFound(records.length, records[records.length - 1].date, records[0].date)}
            </Text>
            {records.slice(0, PREVIEW_LIMIT).map((r, i) => (
              <View key={i} style={styles.recordRow}>
                <View style={styles.sourceBadge}>
                  <Text style={styles.sourceBadgeText}>{r.source}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recordDate}>{r.date}</Text>
                  <Text style={styles.recordText} numberOfLines={2}>
                    {r.text}
                  </Text>
                </View>
              </View>
            ))}
            {records.length > PREVIEW_LIMIT && (
              <Text style={styles.moreText}>{L.importMoreRecords(records.length - PREVIEW_LIMIT)}</Text>
            )}
            {importLimitReached ? (
              <>
                <Text style={styles.error}>{L.importLimitReached}</Text>
                {/* 有料プラン公開時のみアップグレード導線を出す。無料先行リリース中は案内文のみ。 */}
                {FEATURES.paidPlans && (
                  <Pressable style={styles.importButton} onPress={() => router.push('/plans')}>
                    <Ionicons name="pricetags-outline" size={16} color={AppColors.background} />
                    <Text style={styles.parseButtonText}>{L.planLink}</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <>
                <Pressable style={styles.importButton} onPress={handleImport}>
                  <Ionicons name="checkmark" size={16} color={AppColors.background} />
                  <Text style={styles.parseButtonText}>{L.importDo(records.length)}</Text>
                </Pressable>
                <Text style={styles.extractDesc}>{L.importAutoNote}</Text>
              </>
            )}
          </View>
        )}

        {importedCount !== null && (
          <View style={styles.doneBox}>
            <Ionicons name="checkmark-circle" size={16} color={AppColors.success} />
            <Text style={styles.doneText}>{L.importDoneMsg(importedCount)}</Text>
          </View>
        )}

        {lastImported && lastImported.length > 0 && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{L.extractTitle}</Text>
            <Text style={styles.extractDesc}>{L.extractDesc}</Text>
            <Pressable
              style={[styles.parseButton, isExtracting && styles.buttonDisabled]}
              onPress={handleExtract}
              disabled={isExtracting}>
              <Ionicons name="telescope-outline" size={16} color={AppColors.background} />
              <Text style={styles.parseButtonText}>
                {isExtracting ? L.extracting : L.extractButton}
              </Text>
            </Pressable>
            <AiSendNote text={L.extractSendNote} />
            {extractError && <Text style={styles.error}>{extractError}</Text>}

            {candidates && candidates.length === 0 && (
              <Text style={styles.extractDesc}>{L.extractNone}</Text>
            )}

            {candidates && candidates.length > 0 && (
              <>
                {/* 発掘結果の見出し。「宝物が見つかった」体験として演出する */}
                <Text style={styles.revealTitle}>{L.extractRevealTitle(candidates.length)}</Text>
                {candidates.map((item, i) => (
                  <Pressable
                    key={i}
                    style={styles.candidateRow}
                    onPress={() => setApproved((prev) => prev.map((v, j) => (j === i ? !v : v)))}>
                    <Ionicons
                      name={approved[i] ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={AppColors.accent}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.candidateType}>
                        {displayTag(item.type, L)} ・ {item.date}
                      </Text>
                      <Text style={styles.candidateText}>{item.text}</Text>
                    </View>
                  </Pressable>
                ))}
                <Pressable style={styles.importButton} onPress={handleApproveSave}>
                  <Ionicons name="checkmark" size={16} color={AppColors.background} />
                  <Text style={styles.parseButtonText}>
                    {L.extractApprove(approved.filter(Boolean).length)}
                  </Text>
                </Pressable>
              </>
            )}

            {savedCount !== null && (
              <View style={styles.doneBox}>
                <Ionicons name="checkmark-circle" size={16} color={AppColors.success} />
                <Text style={styles.doneText}>{L.extractSaved(savedCount)}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, minHeight: 44 },
  backRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  backButton: { color: AppColors.primary, fontWeight: '700', fontSize: 16 },
  content: { padding: 20, paddingTop: 8, gap: 14, alignItems: 'stretch', paddingBottom: 60 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AppColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: AppColors.text, textAlign: 'center' },
  desc: { fontSize: 13, color: AppColors.muted, lineHeight: 19, textAlign: 'center' },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: AppColors.successSoft,
    borderRadius: 12,
    padding: 12,
  },
  noteText: { flex: 1, fontSize: 12, color: AppColors.success, lineHeight: 17, fontWeight: '600' },
  fileButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 44,
  },
  fileButtonText: { color: AppColors.primary, fontWeight: '700', fontSize: 14 },
  textArea: {
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 12,
    padding: 14,
    minHeight: 100,
    maxHeight: 160,
    fontSize: 13,
    color: AppColors.text,
    textAlignVertical: 'top',
  },
  parseButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 44,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  parseButtonText: { color: AppColors.background, fontWeight: '700', fontSize: 15 },
  error: { color: AppColors.danger, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  resultCard: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 18,
    gap: 12,
  },
  resultTitle: { fontSize: 14, fontWeight: '800', color: AppColors.text, lineHeight: 20 },
  recordRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  sourceBadge: {
    backgroundColor: AppColors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 1,
  },
  sourceBadgeText: { fontSize: 10, fontWeight: '800', color: AppColors.primary },
  recordDate: { fontSize: 11, color: AppColors.muted, fontWeight: '700' },
  recordText: { fontSize: 13, color: AppColors.text, lineHeight: 18 },
  moreText: { fontSize: 12, color: AppColors.muted, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  toggleText: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
  guideBox: {
    backgroundColor: AppColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 12,
    gap: 8,
  },
  guideText: { fontSize: 12, color: AppColors.text, lineHeight: 18 },
  importButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.success,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 44,
    alignItems: 'center',
  },
  doneBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  doneText: { fontSize: 13, color: AppColors.success, fontWeight: '700' },
  extractDesc: { fontSize: 13, color: AppColors.muted, lineHeight: 19 },
  revealTitle: { fontSize: 15, fontWeight: '800', color: AppColors.accent },
  candidateRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  candidateType: { fontSize: 11, fontWeight: '800', color: AppColors.accent },
  candidateText: { fontSize: 13, color: AppColors.text, lineHeight: 18, marginTop: 1 },
});
