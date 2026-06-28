const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const outDir = path.join(root, 'screens');
fs.mkdirSync(outDir, { recursive: true });

const screens = [
  ['idle', '01-idle-board.png'],
  ['panels', '02-panels-open.png'],
  ['warlord', '03-warlord-card-detail.png'],
  ['command', '04-command-card-detail.png'],
  ['attack', '05-attack-preview.png'],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const html = 'file:///' + path.join(root, 'mockup.html').replace(/\\/g, '/');

  for (const [screen, filename] of screens) {
    await page.goto(`${html}?screen=${screen}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outDir, filename), fullPage: false });
  }

  await browser.close();
  console.log(outDir);
})();
