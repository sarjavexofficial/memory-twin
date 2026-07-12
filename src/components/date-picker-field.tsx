import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppPalette } from '@/constants/app-colors';
import { useStrings } from '@/lib/i18n';
import { makeThemed, useTheme } from '@/lib/theme';

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

type WheelProps = {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

// 南京錠のダイヤルのように回して選ぶホイール。スクロール停止位置かタップで選択される
function Wheel({ items, selectedIndex, onSelect }: WheelProps) {
  const { styles } = useTheme(themed);
  const ref = useRef<ScrollView>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 選択中の項目が中央に来るよう初期位置へ
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  function settle(offsetY: number) {
    const idx = Math.min(items.length - 1, Math.max(0, Math.round(offsetY / ITEM_HEIGHT)));
    if (idx !== selectedIndex) onSelect(idx);
    ref.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
  }

  return (
    <View style={styles.wheel}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: (ITEM_HEIGHT * (VISIBLE_ROWS - 1)) / 2 }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScroll={(e) => {
          // Webではモメンタム終了イベントが来ないことがあるため、スクロールが止まったら確定する
          if (Platform.OS !== 'web') return;
          const y = e.nativeEvent.contentOffset.y;
          if (scrollTimer.current) clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(() => settle(y), 160);
        }}
        scrollEventThrottle={16}>
        {items.map((label, i) => (
          <Pressable
            key={label}
            style={styles.wheelItem}
            onPress={() => {
              onSelect(i);
              ref.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true });
            }}>
            <Text style={[styles.wheelItemText, i === selectedIndex && styles.wheelItemTextSelected]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.centerBand} />
    </View>
  );
}

type DatePickerFieldProps = {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function DatePickerField({ value, onChange, disabled }: DatePickerFieldProps) {
  const { styles, AppColors } = useTheme(themed);
  const L = useStrings();
  const [open, setOpen] = useState(false);

  const parsed = new Date(value);
  const valid = !Number.isNaN(parsed.getTime());
  const now = new Date();
  const initYear = valid ? parsed.getFullYear() : now.getFullYear();
  const initMonth = valid ? parsed.getMonth() + 1 : now.getMonth() + 1;
  const initDay = valid ? parsed.getDate() : now.getDate();

  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  const [day, setDay] = useState(initDay);

  const currentYear = now.getFullYear();
  const years = Array.from({ length: currentYear - 1990 + 2 }, (_, i) => 1990 + i); // 1990〜来年
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const dayCount = daysInMonth(year, month);
  const days = Array.from({ length: dayCount }, (_, i) => i + 1);
  const clampedDay = Math.min(day, dayCount);

  function handleOpen() {
    if (disabled) return;
    setYear(initYear);
    setMonth(initMonth);
    setDay(initDay);
    setOpen(true);
  }

  function handleConfirm() {
    onChange(`${year}-${pad(month)}-${pad(clampedDay)}`);
    setOpen(false);
  }

  return (
    <>
      <Pressable style={[styles.field, disabled && styles.fieldDisabled]} onPress={handleOpen}>
        <Ionicons name="calendar-outline" size={15} color={AppColors.accent} />
        <Text style={styles.fieldText}>
          {valid ? L.dateDisplay(initYear, initMonth, initDay) : value || L.dateSelect}
        </Text>
        <Ionicons name="chevron-down" size={13} color={AppColors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{L.dateSelect}</Text>
            <View style={styles.wheelRow}>
              <View style={styles.wheelColumn}>
                <Text style={styles.wheelLabel}>{L.dateYear}</Text>
                <Wheel
                  items={years.map((y) => `${y}`)}
                  selectedIndex={years.indexOf(year)}
                  onSelect={(i) => setYear(years[i])}
                />
              </View>
              <View style={styles.wheelColumn}>
                <Text style={styles.wheelLabel}>{L.dateMonth}</Text>
                <Wheel
                  items={months.map((m) => `${m}`)}
                  selectedIndex={month - 1}
                  onSelect={(i) => setMonth(months[i])}
                />
              </View>
              <View style={styles.wheelColumn}>
                <Text style={styles.wheelLabel}>{L.dateDay}</Text>
                <Wheel
                  items={days.map((d) => `${d}`)}
                  selectedIndex={clampedDay - 1}
                  onSelect={(i) => setDay(days[i])}
                />
              </View>
            </View>
            <View style={styles.buttonRow}>
              <Pressable style={styles.cancelButton} onPress={() => setOpen(false)}>
                <Text style={styles.cancelButtonText}>{L.personCancel}</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmButtonText}>
                  {L.dateConfirm(year, month, clampedDay)}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (AppColors: AppPalette) =>
  StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: AppColors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  fieldDisabled: { opacity: 0.5 },
  fieldText: { flex: 1, fontSize: 14, color: AppColors.text, fontWeight: '600' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: AppColors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 20,
    gap: 14,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: AppColors.text, textAlign: 'center' },
  wheelRow: { flexDirection: 'row', gap: 10 },
  wheelColumn: { flex: 1, gap: 6 },
  wheelLabel: { fontSize: 12, fontWeight: '700', color: AppColors.muted, textAlign: 'center' },
  wheel: { height: ITEM_HEIGHT * VISIBLE_ROWS, position: 'relative' },
  wheelItem: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelItemText: { fontSize: 16, color: AppColors.muted },
  wheelItemTextSelected: { fontSize: 18, fontWeight: '800', color: AppColors.accent },
  centerBand: {
    position: 'absolute',
    top: (ITEM_HEIGHT * (VISIBLE_ROWS - 1)) / 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: AppColors.accent,
    backgroundColor: AppColors.accentSoft,
    borderRadius: 8,
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.line,
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 44,
  },
  cancelButtonText: { color: AppColors.muted, fontWeight: '700', fontSize: 14 },
  confirmButton: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 44,
  },
  confirmButtonText: { color: AppColors.background, fontWeight: '700', fontSize: 14 },
});

const themed = makeThemed(makeStyles);
