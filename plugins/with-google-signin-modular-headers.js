// GoogleサインインのためにPodfileへ2行だけ足す設定プラグイン。
//
// なぜ必要か:
// @react-native-google-signin は GoogleSignIn 9.x に依存し、それが AppCheckCore を連れてくる。
// AppCheckCore は Swift 製だが、依存する GoogleUtilities / RecaptchaInterop は
// モジュールを定義しないObjC製のため、静的ライブラリとして統合できずCocoaPodsが止まる:
//   [!] The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`,
//       which do not define modules.
//
// 対処としてCocoaPods自身が2つの選択肢を提示する:
//   ①Podfile全体に use_modular_headers! を適用する
//   ②問題の依存だけ :modular_headers => true を指定する
// ①は他のネイティブ依存（RevenueCat・Hermes等）のビルド方法まで変えてしまうため、
// 影響範囲の小さい②を選んでいる。
//
// ExpoはiOSプロジェクトを毎回生成する（ios/ はリポジトリに置かない）ので、
// Podfileへの追記はこのプラグインで毎ビルド自動的に行う。

const fs = require('fs');
const path = require('path');

const { createRunOncePlugin, withDangerousMod } = require('expo/config-plugins');

const MARKER = "pod 'GoogleUtilities', :modular_headers => true";
const POD_LINES = [
  "  # Googleサインイン: AppCheckCore(Swift)から読めるようモジュールを生成させる",
  `  ${MARKER}`,
  "  pod 'RecaptchaInterop', :modular_headers => true",
].join('\n');

function withGoogleSignInModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes(MARKER)) return cfg; // 既に入っている

      // アプリ本体の target ブロックの直後に差し込む（最初の1つだけ）
      const targetLine = /^target\s+['"][^'"]+['"]\s+do\s*$/m;
      if (!targetLine.test(contents)) {
        throw new Error(
          '[with-google-signin-modular-headers] Podfileのtargetブロックが見つかりませんでした。' +
            'Podfileの書式が変わった可能性があります。',
        );
      }
      const next = contents.replace(targetLine, (line) => `${line}\n${POD_LINES}`);
      fs.writeFileSync(podfilePath, next);
      return cfg;
    },
  ]);
}

module.exports = createRunOncePlugin(
  withGoogleSignInModularHeaders,
  'with-google-signin-modular-headers',
  '1.0.0',
);
