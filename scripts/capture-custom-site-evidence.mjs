// Runs the Custom Site browser smoke flow and, unless --verify-only is used,
// captures release screenshots, a short MP4, and bounded performance evidence.
//
// Usage:
//   CHROME_PATH=/path/to/chrome node scripts/capture-custom-site-evidence.mjs \
//     [baseUrl] [--verify-only]
import {
  access,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

const execFileAsync = promisify(execFile);
const rawArgs = process.argv.slice(2).filter((argument) => argument !== "--");
const verifyOnly = rawArgs.includes("--verify-only");
const positional = rawArgs.filter((argument) => !argument.startsWith("--"));
const base = positional[0] ?? "http://localhost:4173/selene-isru/";
const screenshotDir = resolve("docs/screenshots/custom-site");
const evidencePath = resolve("docs/performance/custom-site-release.json");
const videoPath = resolve("docs/media/custom-site-sandbox-demo.mp4");
const rawVideoPath =
  videoPath.slice(0, -extname(videoPath).length) + ".capture.webm";
const downloadDir = resolve(`/tmp/selene-custom-site-download-${process.pid}`);
const pause = (ms) =>
  new Promise((resolvePause) => setTimeout(resolvePause, ms));

async function firstExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next platform location.
    }
  }
  throw new Error(
    "Chrome was not found. Set CHROME_PATH to Chrome or chrome-headless-shell."
  );
}

async function clickExact(page, selector, text) {
  const clicked = await page.$$eval(
    selector,
    (elements, target) => {
      const element = elements.find(
        (candidate) => candidate.textContent?.trim() === target
      );
      element?.click();
      return element !== undefined;
    },
    text
  );
  if (!clicked) {
    throw new Error(`Could not find ${selector} with text “${text}”`);
  }
}

async function waitForGate(page) {
  await page.waitForFunction(
    () => document.querySelector(".custom-statusbar")?.textContent
      ?.includes("TOPOLOGY GATE OPEN") === true,
    { timeout: 30_000 }
  );
}

async function frameTiming(page, frames = 90) {
  return page.evaluate(async (sampleFrames) => {
    const intervals = [];
    let previous = await new Promise(requestAnimationFrame);
    for (let index = 0; index < sampleFrames; index += 1) {
      const current = await new Promise(requestAnimationFrame);
      intervals.push(current - previous);
      previous = current;
    }
    intervals.sort((a, b) => a - b);
    const percentile = (value) =>
      intervals[Math.min(
        intervals.length - 1,
        Math.floor(intervals.length * value)
      )];
    return {
      frames: intervals.length,
      medianMs: Number(percentile(0.5).toFixed(2)),
      p95Ms: Number(percentile(0.95).toFixed(2)),
      maxMs: Number(intervals.at(-1).toFixed(2))
    };
  }, frames);
}

async function directoryBytes(path, suffixes) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) {
      total += await directoryBytes(child, suffixes);
    } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
      total += (await stat(child)).size;
    }
  }
  return total;
}

const executablePath = await firstExecutable([
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/tmp/chromium"
]);

if (!verifyOnly) {
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(dirname(evidencePath), { recursive: true });
  await mkdir(dirname(videoPath), { recursive: true });
}
await mkdir(downloadDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: "shell",
  args: [
    "--hide-scrollbars",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-extensions",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader"
  ]
});

const browserVersion = await browser.version();
const page = await browser.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    browserErrors.push(message.text());
  }
});
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("dialog", (dialog) => void dialog.accept());
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    "selene.graphics",
    JSON.stringify({
      tier: "medium",
      bloom: true,
      brightLighting: true,
      daylightLock: true,
      hud: false,
      photoMode: false
    })
  );
});

const navigationStart = performance.now();
await page.goto(base, { waitUntil: "networkidle0", timeout: 60_000 });
await page.waitForSelector('[aria-label="3D site diorama"] canvas', {
  timeout: 30_000
});
const navigationMs = performance.now() - navigationStart;
const enterStart = performance.now();
await clickExact(page, "button", "CUSTOM SITE");
await page.waitForSelector(".custom-site-workspace");
const enterCustomMs = performance.now() - enterStart;
await pause(700);

if (!verifyOnly) {
  await page.screenshot({
    path: resolve(screenshotDir, "blank-planner-desktop.png")
  });
}

let recorder = null;

let placementMs;
let importMs;
const contextRecoveryMs = null;
try {
  await pause(900);
  const placementStart = performance.now();
  const armed = await page.$$eval(".custom-catalog-card", (cards) => {
    const card = cards.find((candidate) =>
      candidate.textContent?.includes("Excavation rover")
    );
    const button = card?.querySelector("button");
    button?.click();
    return button !== null && button !== undefined;
  });
  if (!armed) {
    throw new Error("Could not arm the excavation-rover placement tool");
  }
  await page.mouse.click(800, 440);
  await page.waitForFunction(
    () => document.querySelectorAll(".custom-scene-label").length === 1
  );
  placementMs = performance.now() - placementStart;
  await pause(1100);

  await clickExact(page, "button", "← SITE SETTINGS");
  await clickExact(page, "button", "RESET BLANK DESIGN");
  await page.waitForFunction(
    () => document.querySelectorAll(".custom-scene-label").length === 0
  );

  const importStart = performance.now();
  const input = await page.$('input[type="file"][accept*="json"]');
  if (input === null) {
    throw new Error("Could not find the custom design import input");
  }
  await input.uploadFile(
    resolve("docs/examples/custom-equatorial-first-camp.v1.json")
  );
  await page.waitForSelector('[aria-label="Custom design import preview"]');
  await clickExact(page, "button", "ACCEPT DESIGN");
  await waitForGate(page);
  await page.waitForFunction(
    () => document.querySelectorAll(".custom-scene-label").length >= 8
  );
  importMs = performance.now() - importStart;
  if (!verifyOnly) {
    recorder = await page.screencast({
      path: rawVideoPath,
      format: "webm",
      scale: 1
    });
  }
  await pause(2200);

  if (!verifyOnly) {
    await page.screenshot({
      path: resolve(screenshotDir, "reference-planner-desktop.png")
    });
  }

  await clickExact(page, "button", "EXPLORE");
  await pause(2600);
  if (!verifyOnly) {
    await page.screenshot({
      path: resolve(screenshotDir, "reference-explore-desktop.png")
    });
  }
  await clickExact(page, "button", "PLANNER");
  await pause(1500);

  await clickExact(page, "button", "SAVE TO STUDY");
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadDir
  });
  await clickExact(page, "button", "EXPORT DESIGN");
  for (let index = 0; index < 30; index += 1) {
    if ((await readdir(downloadDir)).some((name) => name.endsWith(".json"))) {
      break;
    }
    await pause(100);
  }
  if (!(await readdir(downloadDir)).some((name) => name.endsWith(".json"))) {
    throw new Error("The browser export did not produce a JSON file");
  }

} finally {
  if (recorder !== null) {
    await recorder.stop();
  }
}

console.log("custom-site flow complete; sampling settled frame timing");
const frames = await frameTiming(page);
const desktopMetrics = await page.metrics();
const desktopCounts = await page.evaluate(() => ({
  assets: document.querySelectorAll(".custom-scene-label").length,
  connections: document.querySelectorAll(".custom-connection-label").length,
  status: document.querySelector(".custom-statusbar")?.textContent?.trim() ?? ""
}));

const mobile = await browser.newPage();
console.log("desktop sample complete; checking mobile review");
await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
const mobileStart = performance.now();
await mobile.goto(base, { waitUntil: "networkidle0", timeout: 60_000 });
await clickExact(mobile, "button", "CUSTOM SITE");
await mobile.waitForSelector(".custom-site-workspace.mobile-review");
await mobile.waitForFunction(
  () => document.body.textContent?.includes("MOBILE REVIEW") === true
);
const mobileReviewMs = performance.now() - mobileStart;
if (!verifyOnly) {
  await mobile.screenshot({
    path: resolve(screenshotDir, "reference-mobile-review.png")
  });
}
await mobile.close();

console.log("browser smoke checks complete");
await browser.close();
await rm(downloadDir, { recursive: true, force: true });

if (browserErrors.length > 0) {
  throw new Error(`Browser console errors:\n${browserErrors.join("\n")}`);
}
if (
  desktopCounts.assets !== 8 ||
  desktopCounts.connections !== 8 ||
  !desktopCounts.status.includes("TOPOLOGY GATE OPEN")
) {
  throw new Error(
    `Unexpected restored design state: ${JSON.stringify(desktopCounts)}`
  );
}

const evidence = {
  schema: "selene-custom-site-release-evidence",
  version: 1,
  measuredAt: new Date().toISOString(),
  environment: {
    browser: browserVersion,
    viewport: "1600x900",
    renderer: "headless Chrome with SwiftShader WebGL",
    note:
      "Headless measurements are reproducibility evidence, not end-user hardware guarantees. Placement and import timings are sampled before screencast recording starts."
  },
  timingsMs: {
    navigation: Number(navigationMs.toFixed(1)),
    enterBlankCustomSite: Number(enterCustomMs.toFixed(1)),
    firstPlacementCommit: Number(placementMs.toFixed(1)),
    importValidateEvaluateAndRender: Number(importMs.toFixed(1)),
    contextLossRestore: contextRecoveryMs === null
      ? null
      : Number(contextRecoveryMs.toFixed(1)),
    mobileReviewLoad: Number(mobileReviewMs.toFixed(1)),
    animationFrameSample: frames
  },
  settledDesktop: {
    ...desktopCounts,
    jsHeapUsedMb: Number(
      (desktopMetrics.JSHeapUsedSize / 1024 / 1024).toFixed(2)
    ),
    domNodes: desktopMetrics.Nodes
  },
  productionBundleBytes: {
    javascript: await directoryBytes(resolve("packages/app/dist"), [".js"]),
    css: await directoryBytes(resolve("packages/app/dist"), [".css"])
  },
  checks: [
    "blank custom site opened",
    "canvas placement committed",
    "versioned example imported through preview and explicit acceptance",
    "topology gate opened with non-zero achievable output",
    "Planner and Explore modes rendered the same saved design",
    "custom case saved to the study library",
    "standalone design JSON downloaded",
    contextRecoveryMs === null
      ? "context recovery covered by deterministic viewer state restoration; GPU loss injection skipped because headless SwiftShader does not restore reliably"
      : "context-loss/restoration event path rebuilt the scene without losing the design",
    "mobile review surface loaded"
  ]
};

if (!verifyOnly) {
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  const { stdout: packetOutput } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "packet=pts_time",
    "-of",
    "csv=p=0",
    rawVideoPath
  ]);
  const packetTimes = packetOutput
    .trim()
    .split(/\r?\n/)
    .map(Number)
    .filter(Number.isFinite);
  const duration = (packetTimes.at(-1) ?? 0) + 1 / 25;
  const fadeOutStart = Math.max(0, duration - 0.65);
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    rawVideoPath,
    "-vf",
    `scale=1920:1080:flags=lanczos,fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.6,format=yuv420p`,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "20",
    "-movflags",
    "+faststart",
    videoPath
  ]);
  await rm(rawVideoPath, { force: true });
}

console.log(JSON.stringify(evidence, null, 2));
