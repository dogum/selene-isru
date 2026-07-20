// Captures README/PR screenshots from a running dev server (pnpm --filter
// @selene-isru/app dev) using the locally installed Chrome.
// Usage: node scripts/capture-screens.mjs [baseUrl]
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--hide-scrollbars", "--force-device-scale-factor=2"]
});

async function shot(name, { width, height, url = BASE, prepare }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2200));
  if (prepare) {
    await prepare(page);
  }
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`captured ${name}.png`);
  await page.close();
}

await shot("equatorial", { width: 1440, height: 900 });
await shot("polar-beam", { width: 1440, height: 900, url: `${BASE}/?site=polar` });
await shot("energy-sankey", {
  width: 1440,
  height: 900,
  prepare: async (page) => {
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll(".view-tabs .view-tab")].find(
        (b) => b.textContent === "ENERGY"
      );
      tab?.click();
    });
    await new Promise((r) => setTimeout(r, 600));
  }
});
await shot("mobile-peek", { width: 375, height: 812 });

await browser.close();
