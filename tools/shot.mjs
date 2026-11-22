// Screenshots of the running game in headless Chrome (the dev server must be up): node tools/shot.mjs <query> <out-prefix> [count] [gap ms]
import { chromium } from 'playwright-core';
const [q = '?test', out = '/tmp/shot', n = '3', gap = '250'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5174/' + q);
await page.waitForTimeout(3500);
await page.evaluate(() => window.__game?.debug?.resume?.());
for (let i = 0; i < +n; i++) { await page.screenshot({ path: `${out}${i + 1}.png` }); await page.waitForTimeout(+gap); }
await browser.close();
