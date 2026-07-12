# ブランドアイコン ソース（案J ツインS）

Memory Twin のアプリアイコン一式の SVG 原本。デザインは「ツインS」:
Sarjavex の S を、点対称に組んだ2つのフック（シアン=あなた / パープル=AI分身）で構成し、
交点の白い光が「共有された記憶」を表す。配色はアプリ内シグネチャ
（`src/components/futuristic.tsx` の BRAND_GRADIENT: #8B5CF6 → #0EA5E9 系）に準拠。

## ファイル対応表

| SVG | 出力先 (assets/images/) | 用途 |
|---|---|---|
| icon-main.svg | icon.png (1024) / favicon.png (196) | iOS・共通アイコン / Web favicon |
| icon-foreground.svg | android-icon-foreground.png (1024) | Android adaptive 前景（セーフゾーン66%内） |
| icon-background.svg | android-icon-background.png (1024) | Android adaptive 背景 |
| icon-monochrome.svg | android-icon-monochrome.png (1024) | Android モノクロ（テーマアイコン） |
| splash-icon.svg | splash-icon.png (512) | スプラッシュ（背景 #070914 は app.json 側） |

## 再レンダリング手順

```
npm install sharp   # このフォルダとは別の作業フォルダ推奨（devサーバー稼働中はnpm install禁止）
node render.js      # out/ に PNG が生成される → assets/images/ に上書きコピー
```

render.js 内のパスは同一フォルダの SVG を参照する。
