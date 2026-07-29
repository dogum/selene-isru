// Records a deterministic, detailed Custom Site story and a 2× fast cut.
//
// Usage:
//   pnpm demo:custom-cinematic -- [baseUrl] [detailedOutput] [fastOutput]
//
// Set CHROME_PATH when Chrome is not installed in a standard location.
// Requires ffmpeg and ffprobe on PATH.
import { access, mkdir, rm } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const BASE = args[0] ?? "http://localhost:4173/selene-isru/";
const DETAILED_OUTPUT = resolve(
  args[1] ?? "docs/media/custom-site-cinematic-60s.mp4"
);
const FAST_OUTPUT = resolve(
  args[2] ?? "docs/media/custom-site-cinematic-30s.mp4"
);
const RAW_OUTPUT =
  DETAILED_OUTPUT.slice(0, -extname(DETAILED_OUTPUT).length) + ".capture.webm";
const TARGET_DURATION_S = 60;
const FAST_DURATION_S = 30;
const execFileAsync = promisify(execFile);
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

function run(command, commandArgs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with code ${String(code)}`));
    });
  });
}

async function probeDuration(path) {
  const ffprobe = process.env.FFPROBE_PATH ?? "ffprobe";
  const { stdout } = await execFileAsync(
    ffprobe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path
    ]
  );
  const duration = Number(stdout.trim());
  if (Number.isFinite(duration) && duration > 0) {
    return duration;
  }
  const { stdout: packetOutput } = await execFileAsync(ffprobe, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "packet=pts_time",
    "-of",
    "csv=p=0",
    path
  ]);
  const packetTimes = packetOutput
    .trim()
    .split(/\r?\n/)
    .map(Number)
    .filter(Number.isFinite);
  const lastPacketTime = packetTimes.at(-1);
  if (lastPacketTime === undefined || lastPacketTime <= 0) {
    throw new Error(`Could not measure video duration for ${path}`);
  }
  return lastPacketTime + 1 / 25;
}

async function setCaption(page, caption) {
  await page.evaluate((nextCaption) => {
    window.__SELENE_CINEMATIC__?.setCaption(nextCaption);
  }, caption);
}

async function refreshMetrics(page) {
  const metrics = await page.evaluate(() =>
    window.__SELENE_DEMO__?.customSnapshot()
  );
  if (metrics === undefined) {
    throw new Error("Custom Site demo bridge is unavailable");
  }
  await page.evaluate((nextMetrics) => {
    window.__SELENE_CINEMATIC__?.setMetrics(nextMetrics);
  }, metrics);
  return metrics;
}

async function setStage(page, stage, assets, connections) {
  await page.evaluate((nextStage) => {
    window.__SELENE_DEMO__?.setCustomStage(nextStage);
  }, stage);
  await page.waitForFunction(
    (expectedAssets, expectedConnections) =>
      document.querySelectorAll(".custom-scene-label").length === expectedAssets &&
      document.querySelectorAll(".custom-connection-label").length ===
        expectedConnections,
    { timeout: 30_000 },
    assets,
    connections
  );
  await refreshMetrics(page);
}

async function animateCamera(page, from, to, durationMs) {
  const steps = Math.max(2, Math.round(durationMs / 50));
  for (let index = 0; index <= steps; index += 1) {
    const raw = index / steps;
    const progress = raw * raw * (3 - 2 * raw);
    const position = from.position.map(
      (value, axis) => value + (to.position[axis] - value) * progress
    );
    const target = from.target.map(
      (value, axis) => value + (to.target[axis] - value) * progress
    );
    await page.evaluate(
      ({ nextPosition, nextTarget }) => {
        window.__SELENE_DEMO__?.setCameraPose(nextPosition, nextTarget);
      },
      { nextPosition: position, nextTarget: target }
    );
    await pause(durationMs / steps);
  }
}

await mkdir(dirname(DETAILED_OUTPUT), { recursive: true });
await mkdir(dirname(FAST_OUTPUT), { recursive: true });
await rm(RAW_OUTPUT, { force: true });

const executablePath = await firstExecutable([
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/tmp/chromium"
]);

console.log("launching headless Chrome for Custom Site cinematic capture");
const browser = await puppeteer.launch({
  executablePath,
  headless: "shell",
  timeout: 120_000,
  protocolTimeout: 600_000,
  args: [
    "--hide-scrollbars",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-extensions",
    "--disable-site-isolation-trials",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--window-size=1600,900"
  ]
});
console.log("headless Chrome ready; opening production preview");

const page = await browser.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));
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

const demoUrl = new URL(BASE);
demoUrl.searchParams.set("demo", "1");
await page.goto(demoUrl.href, {
  waitUntil: "domcontentloaded",
  timeout: 60_000
});
console.log("production preview loaded; waiting for Custom Site demo bridge");
await page.waitForSelector('[aria-label="3D site diorama"] canvas', {
  timeout: 30_000
});
await page.waitForFunction(() => window.__SELENE_DEMO__?.ready() === true, {
  timeout: 60_000
});
await setStage(page, 0, 0, 0);
await page.waitForSelector(".custom-site-workspace");

await page.addStyleTag({
  content: `
    #selene-cinematic-overlay {
      position: fixed;
      z-index: 1000;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      font-family: "Space Grotesk", system-ui, sans-serif;
    }
    #selene-cinematic-overlay::before {
      position: absolute;
      inset: 48px 0 auto;
      height: 112px;
      content: "";
      background: linear-gradient(180deg, rgba(3, 6, 10, .82), rgba(3, 6, 10, 0));
    }
    .cinematic-brand {
      position: absolute;
      top: 72px;
      right: 36px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #f4f7fa;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: .08em;
    }
    .cinematic-brand::before {
      width: 10px;
      height: 10px;
      border: 2px solid #ff7a1a;
      content: "";
    }
    .cinematic-brand span {
      color: #8390a0;
      font: 500 10px/1 "IBM Plex Mono", monospace;
      letter-spacing: .12em;
    }
    .cinematic-caption {
      position: absolute;
      bottom: 116px;
      left: 286px;
      width: min(650px, calc(100vw - 650px));
      padding: 22px 25px 23px 28px;
      border: 1px solid rgba(255, 255, 255, .16);
      border-left: 4px solid #ff7a1a;
      background: rgba(6, 10, 16, .9);
      box-shadow: 0 18px 60px rgba(0, 0, 0, .42);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity .28s ease, transform .28s ease, left .45s ease;
      backdrop-filter: blur(12px);
    }
    .cinematic-caption.show {
      opacity: 1;
      transform: translateY(0);
    }
    .cinematic-caption header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      color: #ff9d55;
      font: 600 10px/1 "IBM Plex Mono", monospace;
      letter-spacing: .13em;
    }
    .cinematic-caption h1 {
      margin: 10px 0 7px;
      color: #f4f7fa;
      font-size: 30px;
      line-height: 1.08;
      letter-spacing: -.025em;
    }
    .cinematic-caption p {
      max-width: 62ch;
      margin: 0;
      color: #b7c0cb;
      font: 400 13px/1.55 "IBM Plex Mono", monospace;
    }
    .cinematic-metrics {
      position: absolute;
      top: 116px;
      right: 36px;
      display: grid;
      grid-template-columns: repeat(4, auto);
      gap: 1px;
      border: 1px solid rgba(255, 255, 255, .12);
      background: rgba(255, 255, 255, .12);
    }
    .cinematic-metrics > div {
      min-width: 102px;
      padding: 9px 11px;
      background: rgba(6, 10, 16, .88);
    }
    .cinematic-metrics span,
    .cinematic-metrics strong {
      display: block;
    }
    .cinematic-metrics span {
      color: #758294;
      font: 500 8px/1 "IBM Plex Mono", monospace;
      letter-spacing: .1em;
    }
    .cinematic-metrics strong {
      margin-top: 6px;
      color: #ecf1f5;
      font-size: 13px;
    }
    .cinematic-metrics .open strong { color: #4ade80; }
    .cinematic-metrics .closed strong { color: #ff6565; }
    body[data-cinematic-focus="true"] .custom-site-workspace {
      grid-template-columns: 0 1fr 0;
    }
    body[data-cinematic-focus="true"] .custom-catalog,
    body[data-cinematic-focus="true"] .custom-inspector,
    body[data-cinematic-focus="true"] .custom-planner-toolbar {
      visibility: hidden;
      opacity: 0;
    }
    body[data-cinematic-focus="true"] .cinematic-caption {
      left: 42px;
      width: 650px;
    }
  `
});

await page.evaluate(() => {
  const root = document.createElement("div");
  root.id = "selene-cinematic-overlay";
  root.innerHTML = `
    <div class="cinematic-brand">SELENE-ISRU <span>CUSTOM SITE</span></div>
    <div class="cinematic-metrics" aria-label="Cinematic Custom Site metrics">
      <div><span>ASSETS</span><strong data-metric="assets">0</strong></div>
      <div><span>ROUTES</span><strong data-metric="connections">0</strong></div>
      <div class="closed" data-metric-state><span>TOPOLOGY</span><strong data-metric="topology">CLOSED</strong></div>
      <div><span>OUTPUT</span><strong data-metric="output">0 KG/DAY</strong></div>
    </div>
    <section class="cinematic-caption">
      <header><span data-caption="kicker"></span><span data-caption="step"></span></header>
      <h1 data-caption="title"></h1>
      <p data-caption="body"></p>
    </section>
  `;
  document.body.append(root);
  const caption = root.querySelector(".cinematic-caption");
  window.__SELENE_CINEMATIC__ = {
    setCaption(next) {
      caption.classList.remove("show");
      root.querySelector('[data-caption="kicker"]').textContent = next.kicker;
      root.querySelector('[data-caption="step"]').textContent = next.step;
      root.querySelector('[data-caption="title"]').textContent = next.title;
      root.querySelector('[data-caption="body"]').textContent = next.body;
      requestAnimationFrame(() => caption.classList.add("show"));
    },
    setMetrics(next) {
      root.querySelector('[data-metric="assets"]').textContent =
        String(next.assets);
      root.querySelector('[data-metric="connections"]').textContent =
        String(next.connections);
      root.querySelector('[data-metric="topology"]').textContent =
        next.topologyValid ? "OPEN" : "CLOSED";
      root.querySelector('[data-metric="output"]').textContent =
        `${Math.round(next.achievableOutputKgPerDay).toLocaleString()} KG/DAY`;
      const state = root.querySelector("[data-metric-state]");
      state.classList.toggle("open", next.topologyValid);
      state.classList.toggle("closed", !next.topologyValid);
    }
  };
});
await refreshMetrics(page);
await pause(800);

let recorder = null;
try {
  recorder = await page.screencast({
    path: RAW_OUTPUT,
    format: "webm",
    scale: 1
  });

  await setCaption(page, {
    kicker: "CUSTOM SITE · FROM BLANK TERRAIN",
    step: "01 / 07",
    title: "Build a lunar industry from first principles.",
    body:
      "Begin with deterministic Equatorial terrain, a versioned design document, and an honest zero-output topology gate."
  });
  await pause(7_000);

  await setStage(page, 1, 3, 2);
  await page.evaluate(() =>
    window.__SELENE_DEMO__?.setCameraPose([0, 158, 0.01], [-14, 0, 2])
  );
  await setCaption(page, {
    kicker: "PLACE THE PROCESS CORE",
    step: "02 / 07",
    title: "Footprints become an executable process chain.",
    body:
      "Excavation, hauling, and processing are placed on the same planning surface. Typed material routes already preserve engineering intent."
  });
  await pause(8_000);

  await setStage(page, 2, 6, 5);
  await page.evaluate(() => {
    window.__SELENE_DEMO__?.selectCustomAsset("eq-reactor-1");
    window.__SELENE_DEMO__?.setCameraPose([0, 164, 0.01], [-9, 0, -2]);
  });
  await setCaption(page, {
    kicker: "CONNECT POWER AND PRODUCTS",
    step: "03 / 07",
    title: "The layout stays stopped until the graph is complete.",
    body:
      "Power, oxygen, and construction routes add capacity and spatial consequences, while missing downstream infrastructure remains visible."
  });
  await pause(8_000);

  await setStage(page, 3, 8, 8);
  await page.waitForFunction(
    () => document.querySelector(".custom-statusbar")?.textContent
      ?.includes("TOPOLOGY GATE OPEN") === true,
    { timeout: 30_000 }
  );
  await setCaption(page, {
    kicker: "VALIDATE THE WHOLE SITE",
    step: "04 / 07",
    title: "Eight assets. Eight routes. One open topology gate.",
    body:
      "The same persisted graph now drives achievable output, installed capacity, bottleneck state, and live system behavior."
  });
  await pause(9_000);

  await page.evaluate(() =>
    window.__SELENE_DEMO__?.selectCustomConnection("eq-reactor-power")
  );
  await setCaption(page, {
    kicker: "INSPECT SPATIAL CONSEQUENCES",
    step: "05 / 07",
    title: "Routes are engineering inputs—not decorative lines.",
    body:
      "The power feeder exposes length, cable mass, resistive loss, utilization, assumptions, equations, and explicit model limits."
  });
  await pause(8_000);

  await page.evaluate(() => {
    window.__SELENE_DEMO__?.selectCustomConnection(null);
    window.__SELENE_DEMO__?.setCustomViewMode("explore");
    document.body.dataset.cinematicFocus = "true";
  });
  await pause(700);
  await setCaption(page, {
    kicker: "PLANNER → EXPLORE",
    step: "06 / 07",
    title: "One design document becomes an explorable lunar plant.",
    body:
      "Planner owns footprints and routes. Explore presents the same assets, connections, operating state, and labels in a cinematic perspective."
  });
  await animateCamera(
    page,
    { position: [72, 40, 70], target: [-6, 1, 0] },
    { position: [-58, 30, 62], target: [-8, 1, -3] },
    12_000
  );

  await setCaption(page, {
    kicker: "OPEN SOURCE · IN BROWSER",
    step: "07 / 07",
    title: "Design, validate, simulate, save, and share.",
    body:
      "SELENE-ISRU turns lunar architecture into a reproducible engineering story. Explore it at dogum.github.io/selene-isru."
  });
  await animateCamera(
    page,
    { position: [-58, 30, 62], target: [-8, 1, -3] },
    { position: [48, 48, 78], target: [-4, 1, 0] },
    7_000
  );
} finally {
  if (recorder !== null) await recorder.stop();
  await browser.close();
}

if (browserErrors.length > 0) {
  throw new Error(`Browser console errors:\n${browserErrors.join("\n")}`);
}

console.log("Custom Site story recorded; normalizing the detailed cut");
const rawDuration = await probeDuration(RAW_OUTPUT);
const timeScale = TARGET_DURATION_S / rawDuration;
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";

await run(ffmpeg, [
  "-y",
  "-i",
  RAW_OUTPUT,
  "-vf",
  `setpts=${timeScale.toFixed(9)}*PTS,trim=duration=${TARGET_DURATION_S},` +
    "fps=30,scale=1920:1080:flags=lanczos," +
    "fade=t=in:st=0:d=0.45,fade=t=out:st=59.1:d=0.9,format=yuv420p",
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "19",
  "-r",
  "30",
  "-t",
  String(TARGET_DURATION_S),
  "-movflags",
  "+faststart",
  "-metadata",
  "title=SELENE-ISRU Custom Site — Detailed Cinematic",
  DETAILED_OUTPUT
]);

console.log("detailed cut complete; encoding the 2× fast companion");
await run(ffmpeg, [
  "-y",
  "-i",
  DETAILED_OUTPUT,
  "-vf",
  `setpts=0.5*PTS,trim=duration=${FAST_DURATION_S},` +
    "fps=30,fade=t=in:st=0:d=0.25,fade=t=out:st=29.4:d=0.6,format=yuv420p",
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "19",
  "-r",
  "30",
  "-t",
  String(FAST_DURATION_S),
  "-movflags",
  "+faststart",
  "-metadata",
  "title=SELENE-ISRU Custom Site — Fast Cinematic",
  FAST_OUTPUT
]);

if (process.env.KEEP_RAW !== "1") await rm(RAW_OUTPUT, { force: true });

console.log(JSON.stringify({
  detailed: {
    path: DETAILED_OUTPUT,
    durationSeconds: await probeDuration(DETAILED_OUTPUT)
  },
  fast: {
    path: FAST_OUTPUT,
    durationSeconds: await probeDuration(FAST_OUTPUT)
  }
}, null, 2));
