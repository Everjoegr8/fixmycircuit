// Renders build/icon.svg to build/icon.png (512 px) for electron-builder.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../build/icon.svg'), 'utf8');
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.locator('svg').screenshot({ path: path.join(__dirname, '../build/icon.png'), omitBackground: true });
  await b.close();
})();
