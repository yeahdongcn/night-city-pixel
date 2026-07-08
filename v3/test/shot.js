// Screenshot helper: node test/shot.js <url> <out.png> [waitMs]
import { launchGL } from './browser.js';

const [url = 'http://localhost:35464/', out = 'shot.png', waitMs = '5000'] = process.argv.slice(2);

const browser = await launchGL();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(parseInt(waitMs, 10));
await page.screenshot({ path: out });
await browser.close();

console.log('saved', out);
if (errors.length) {
  console.log('--- page errors ---');
  for (const e of errors) console.log(e);
  process.exit(1);
}
