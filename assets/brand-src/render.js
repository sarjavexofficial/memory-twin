const sharp = require('sharp');
const path = require('path');

const out = path.join(__dirname, 'out');
require('fs').mkdirSync(out, { recursive: true });

// noAlpha: iOS のアプリアイコンは透過（アルファチャンネル）があると
// App Store 提出時にリジェクトされるため、不透明背景でフラット化する。
const jobs = [
  ['icon-main.svg', 'icon.png', 1024, { noAlpha: '#05070F' }],
  ['icon-foreground.svg', 'android-icon-foreground.png', 1024],
  ['icon-monochrome.svg', 'android-icon-monochrome.png', 1024],
  ['icon-background.svg', 'android-icon-background.png', 1024],
  ['splash-icon.svg', 'splash-icon.png', 512],
  ['icon-main.svg', 'favicon.png', 196],
];

(async () => {
  for (const [src, dst, size, opts = {}] of jobs) {
    let img = sharp(path.join(__dirname, src), { density: 300 }).resize(size, size);
    if (opts.noAlpha) img = img.flatten({ background: opts.noAlpha }).removeAlpha();
    await img.png().toFile(path.join(out, dst));
    console.log('rendered', dst, size + 'px', opts.noAlpha ? '(opaque)' : '');
  }
})();
