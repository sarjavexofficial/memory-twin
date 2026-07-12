const sharp = require('sharp');
const path = require('path');

const out = path.join(__dirname, 'out');
require('fs').mkdirSync(out, { recursive: true });

const jobs = [
  ['icon-main.svg', 'icon.png', 1024],
  ['icon-foreground.svg', 'android-icon-foreground.png', 1024],
  ['icon-monochrome.svg', 'android-icon-monochrome.png', 1024],
  ['icon-background.svg', 'android-icon-background.png', 1024],
  ['splash-icon.svg', 'splash-icon.png', 512],
  ['icon-main.svg', 'favicon.png', 196],
];

(async () => {
  for (const [src, dst, size] of jobs) {
    await sharp(path.join(__dirname, src), { density: 300 })
      .resize(size, size)
      .png()
      .toFile(path.join(out, dst));
    console.log('rendered', dst, size + 'px');
  }
})();
