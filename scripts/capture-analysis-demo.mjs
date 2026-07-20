// Records a short, reproducible browser tour of the engineering-analysis sprint.
// Usage: pnpm demo:analysis -- [baseUrl] [outputPath]
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const BASE = args[0] ?? "http://localhost:5173";
const OUTPUT = resolve(args[1] ?? "docs/media/analysis-sprint-demo.webm");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));

await mkdir(dirname(OUTPUT), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: [
    "--hide-scrollbars",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-extensions"
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30_000 });
await pause(1_800);

async function clickText(selector, text) {
  const clicked = await page.$$eval(selector, (elements, target) => {
    const element = elements.find((candidate) => candidate.textContent?.trim().includes(target));
    element?.click();
    return element !== undefined;
  }, text);
  if (!clicked) throw new Error(`Could not find ${selector} containing “${text}”`);
}

const recorder = await page.screencast({ path: OUTPUT, format: "webm", scale: 0.75 });

try {
  await pause(1_000);

  // Selected-subsystem flow and contextual controls.
  await clickText("button", "ASSETS");
  await clickText("[role=menuitem]", "MRE reactor");
  await page.waitForSelector('[aria-label="MOLTEN REGOLITH ELECTROLYSIS inspector"]');
  await pause(2_400);

  await clickText("button", "CLOSE");
  await clickText('[role="tab"]', "TRADE STUDY");
  await page.waitForSelector('[aria-label="Trade study workspace"]');
  await pause(1_500);

  // Scenarios, Pareto, uncertainty, and engineering report.
  await clickText('[role="tab"]', "PARETO");
  await pause(1_600);
  await clickText('[role="tab"]', "UNCERTAINTY");
  await pause(1_600);
  await clickText('[role="tab"]', "REPORT");
  await pause(1_800);

  await page.click('[aria-label="Close panel"]');
  await clickText("button", "BRIEF");
  await page.waitForSelector('[aria-label="Mission brief optimizer"]');
  await clickText("button", "RUN DESIGN SEARCH");
  await page.waitForFunction(() => document.body.innerText.includes("RECOMMENDED BOUNDED DESIGN"));
  await pause(1_000);
  await page.$eval(".mission-brief-body", (element) => {
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  });
  await pause(2_200);
} finally {
  await recorder.stop();
  await browser.close();
}

console.log(`recorded ${OUTPUT}`);
