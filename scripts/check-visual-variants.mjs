// Production smoke coverage for alternate architectures, tiers, mobile and photo mode.
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'docs/screenshots/visual-milestone/variants';
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--enable-unsafe-swiftshader']
});
const evidence = [], errors = [];
const cases = [
  { name: 'equatorial-solar', site: 'equatorial', tier: 'high', query: 'targetKgPerDay=10&MshieldKg=8000&SEstorage=1500&Rarray=5', asset: 'Power hub' },
  { name: 'polar-solar-sabatier', site: 'polar', tier: 'ultra', query: 'targetKgPerDay=10&MshieldKg=8000&enableSabatier=true', asset: 'Receiver + Sabatier' },
  { name: 'equatorial-mobile-low', site: 'equatorial', tier: 'low', mobile: true },
  { name: 'polar-mobile-medium', site: 'polar', tier: 'medium', mobile: true },
  { name: 'polar-dark-photo', site: 'polar', tier: 'high', dark: true }
];
try {
  for (const item of cases) {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(`${item.name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${item.name}: ${m.text()}`); });
    await page.setViewport({ width: item.mobile ? 390 : 1440, height: item.mobile ? 844 : 1000, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(item => {
      localStorage.clear();
      localStorage.setItem('selene.graphics', JSON.stringify({ tier: item.tier, brightLighting: !item.dark, daylightLock: true, bloom: true, hud: true }));
    }, item);
    await page.goto(`http://127.0.0.1:4173/selene-isru/?site=${item.site}&demo=1&${item.query ?? ''}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__SELENE_DEMO__?.ready(), { timeout: 60000 });
    if (item.asset) {
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('ASSETS'))?.click());
      const found = await page.evaluate(label => {
        const button = [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.trim().toLowerCase() === label.toLowerCase());
        button?.click(); return !!button;
      }, item.asset);
      if (!found) throw new Error(`Missing asset menu entry: ${item.asset}`);
    }
    if (item.dark) {
      await page.evaluate(() => {
        const prefs = { ...JSON.parse(localStorage.getItem('selene.graphics')), photoMode: true };
        document.body.classList.add('selene-photo-mode');
        window.dispatchEvent(new CustomEvent('selene:graphics', { detail: prefs }));
      });
      await page.waitForSelector('[aria-label="Exit photo mode"]');
    }
    await new Promise(resolve => setTimeout(resolve, 1800));
    await page.screenshot({ path: `${out}/${item.name}.png` });
    evidence.push(await page.evaluate(item => ({ ...item, snapshot: window.__SELENE_DEMO__.snapshot(), hud: document.querySelector('.stage-hud')?.textContent, inspector: document.querySelector('.reactor-inspector')?.textContent }), item));
    if (item.dark) {
      await page.click('[aria-label="Exit photo mode"]');
      await page.waitForFunction(() => !document.body.classList.contains('selene-photo-mode'));
    }
    console.log(`PASS ${item.name}`);
    await page.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${out}/evidence.json`, JSON.stringify({ browser: await browser.version(), evidence, errors }, null, 2) + '\n');
} finally { await browser.close(); }
