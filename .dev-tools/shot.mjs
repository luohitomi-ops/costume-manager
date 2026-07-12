import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:3000';
const out = process.argv[3] || 'shot.png';
const width = Number(process.argv[4] || 1280);
const height = Number(process.argv[5] || 900);
const clipSelector = process.argv[6]; // optional CSS selector to crop to

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(url, { waitUntil: 'networkidle' });

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(String(err)));

if (clipSelector) {
  const el = await page.$(clipSelector);
  if (el) {
    await el.screenshot({ path: out });
  } else {
    console.error('selector not found:', clipSelector);
    await page.screenshot({ path: out, fullPage: false });
  }
} else {
  await page.screenshot({ path: out, fullPage: false });
}

console.log('saved', out, 'consoleErrors:', consoleErrors.length);
if (consoleErrors.length) console.log(consoleErrors.join('\n'));
await browser.close();
