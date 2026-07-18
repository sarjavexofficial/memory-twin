import { useState } from 'react';
import { Pressable, StyleProp, Text, TextStyle } from 'react-native';

import { useStrings } from '@/lib/i18n';

// 設定画面などの長い説明文を、最初は数行に畳んで「詳しく見る」で全文を開ける共通部品。
// 短い文（畳む意味がない長さ）はそのまま表示して開閉リンクを出さない。
const COLLAPSE_THRESHOLD = 64;

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
  lines?: number;
};

export function ExpandableText({ text, style, linkColor, lines = 2 }: Props) {
  const L = useStrings();
  const [open, setOpen] = useState(false);
  if (text.length <= COLLAPSE_THRESHOLD) return <Text style={style}>{text}</Text>;
  return (
    <>
      <Text style={style} numberOfLines={open ? undefined : lines}>
        {text}
      </Text>
      <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8}>
        <Text style={{ color: linkColor, fontSize: 12, fontWeight: '700', marginTop: -6 }}>
          {open ? L.showLess : L.showMore}
        </Text>
      </Pressable>
    </>
  );
}
