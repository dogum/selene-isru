// Matched production views, using the app's existing capture bridge and Assets menu.
// node scripts/capture-visual-milestone.mjs before|after [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Expected before or after');
const base = process.argv[3] ?? 'http://127.0.0.1:4173/selene-isru/';
const out = `docs/screenshots/visual-milestone/${phase}`;
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--enable-webgl', '--enable-unsafe-swiftshader']
});
const errors = [];
const evidence = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (const site of ['equatorial', 'polar']) {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      localStorage.clear();
      localStorage.setItem('selene.graphics', JSON.stringify({ tier: 'high', brightLighting: true, daylightLock: true, bloom: true, hud: true }));
    });
    await page.goto(`${base}?site=${site}&demo=1`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.__SELENE_DEMO__?.ready(), { timeout: 60000 });
    await pause(2200);
    await page.screenshot({ path: `${out}/${site}-overview.png` });
    evidence.push(await page.evaluate(() => ({ ...window.__SELENE_DEMO__.snapshot(), hud: document.querySelector('.stage-hud')?.textContent })));
    const clickAssets = () => page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('ASSETS'))?.click());
    await clickAssets();
    const labels = await page.$$eval('[role="menuitem"]', nodes => nodes.map(n => n.textContent.trim()));
    await clickAssets();
    for (const [i, label] of labels.entries()) {
      await clickAssets();
      await page.evaluate(label => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.trim() === label)?.click(), label);
      await pause(1400);
      await page.screenshot({ path: `${out}/${site}-${i}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}.png` });
    }
    console.log(`${phase} ${site}: ${labels.length} asset views`);
    await page.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${out}/evidence.json`, JSON.stringify({ phase, browser: await browser.version(), evidence, errors }, null, 2) + '\n');
} finally { await browser.close(); }
