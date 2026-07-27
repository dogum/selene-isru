// Renders a deterministic 32-second, 1080p cinematic product tour.
//
// Usage:
//   pnpm demo:cinematic -- [baseUrl] [outputPath]
//
// Set CHROME_PATH when Chrome is not installed in a standard location.
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const BASE = args[0] ?? "http://localhost:4173/selene-isru/";
const OUTPUT = resolve(args[1] ?? "docs/media/selene-isru-cinematic-demo.mp4");
const RAW_OUTPUT = OUTPUT.slice(0, -extname(OUTPUT).length) + ".capture.webm";
const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 5;
const TARGET_DURATION_S = 32;
const execFileAsync = promisify(execFile);

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
    "Chrome was not found. Set CHROME_PATH to a Chrome or chrome-headless-shell executable."
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

await mkdir(dirname(OUTPUT), { recursive: true });
const executablePath = await firstExecutable([
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/tmp/chromium"
]);

const browser = await puppeteer.launch({
  executablePath,
  headless: "shell",
  protocolTimeout: 600_000,
  args: [
    "--hide-scrollbars",
    "--no-sandbox",
    "--no-zygote",
    "--single-process",
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
    `--window-size=${VIEW_WIDTH},${VIEW_HEIGHT}`
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: VIEW_WIDTH, height: VIEW_HEIGHT, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
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
  window.localStorage.removeItem("selene-isru.study-scenarios.v2");
});

const demoUrl = new URL(BASE);
demoUrl.searchParams.set("demo", "1");
await page.goto(demoUrl.href, { waitUntil: "networkidle0", timeout: 60_000 });
await page.waitForSelector('[aria-label="3D site diorama"] canvas', { timeout: 30_000 });
await page.waitForFunction(() => window.__SELENE_DEMO__?.ready() === true, {
  timeout: 60_000
});
await page.addScriptTag({
  path: resolve("node_modules/webm-muxer/build/webm-muxer.js")
});

let rawBase64;
try {
  rawBase64 = await page.evaluate(
    async ({ width, height, fps, durationSeconds }) => {
      const api = window.__SELENE_DEMO__;
      const sceneCanvas = document.querySelector('[aria-label="3D site diorama"] canvas');
      if (api === undefined || !(sceneCanvas instanceof HTMLCanvasElement)) {
        throw new Error("SELENE scene is not ready for deterministic capture");
      }
      if (window.WebMMuxer === undefined || window.VideoEncoder === undefined) {
        throw new Error("WebCodecs or the WebM muxer is unavailable");
      }
      await document.fonts.ready;

      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const context = output.getContext("2d", { alpha: false });
      if (context === null) throw new Error("Could not create capture compositor");

      const ease = (value) => value * value * (3 - 2 * value);
      const clamp01 = (value) => Math.max(0, Math.min(1, value));
      const cubic = (points, value) => {
        const a = (1 - value) ** 3;
        const b = 3 * (1 - value) ** 2 * value;
        const c = 3 * (1 - value) * value ** 2;
        const d = value ** 3;
        return [0, 1, 2].map(
          (axis) =>
            points[0][axis] * a +
            points[1][axis] * b +
            points[2][axis] * c +
            points[3][axis] * d
        );
      };
      const tracks = [
        {
          start: 0,
          end: 6,
          positions: [[54, 28, 42], [58, 35, 58], [38, 39, 72], [18, 31, 64]],
          targets: [[0, 2, 0], [0, 2.5, 0], [0, 2.5, 0], [0, 2, 0]],
          caption: [
            "SELENE-ISRU",
            "Lunar industrial trade-space simulator",
            "One live engineering model · one explorable 3D system"
          ]
        },
        {
          start: 6,
          end: 12,
          positions: [[18, 31, 64], [2, 30, 55], [-35, 23, 35], [-60, 13, 20]],
          targets: [[0, 2, 0], [-8, 2, 0], [-30, 1, 0], [-45, 0, 0]],
          caption: [
            "EXCAVATION LOOP",
            "From regolith to useful product",
            "Rovers, hauling, processing, power, storage, and logistics stay coupled"
          ]
        },
        {
          start: 12,
          end: 20,
          positions: [[-60, 13, 20], [-63, 12, 14], [-60, 11, 8], [-54, 10, 6]],
          targets: [[-45, 0, 0], [-45, 0, 0], [-44.5, 0, 0], [-44, 0, 0]],
          caption: [
            "LIVE TRADE STUDY",
            "Daily output · 1,000 → 10,000 kg/day",
            "Watch power, missions, mass equivalent, leverage, and the 3D plant respond"
          ]
        },
        {
          start: 20,
          end: 28,
          positions: [[-54, 10, 6], [-45, 20, 25], [-10, 34, 62], [34, 30, 58]],
          targets: [[-44, 0, 0], [-32, 1, 0], [-10, 2, 0], [0, 2, 0]],
          caption: [
            "INDUSTRIAL CASE",
            "10 tonnes per day",
            "The scene and every engineering output are driven by the same calculation"
          ]
        }
      ];
      const finalCaption = [
        "OPEN SOURCE · IN-BROWSER",
        "Explore the lunar trade space",
        "dogum.github.io/selene-isru"
      ];

      const number = new Intl.NumberFormat("en-US", {
        maximumSignificantDigits: 3
      });
      const format = (value) => {
        const magnitude = Math.abs(value);
        if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
        if (magnitude >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
        return number.format(value);
      };
      const roundedRect = (x, y, w, h, radius) => {
        context.beginPath();
        context.roundRect(x, y, w, h, radius);
      };
      const wrapText = (text, x, y, maxWidth, lineHeight, maxLines = 2) => {
        const words = text.split(/\s+/);
        let line = "";
        let row = 0;
        for (const word of words) {
          const test = line.length === 0 ? word : `${line} ${word}`;
          if (context.measureText(test).width > maxWidth && line.length > 0) {
            context.fillText(line, x, y + row * lineHeight);
            row += 1;
            line = word;
            if (row >= maxLines - 1) break;
          } else {
            line = test;
          }
        }
        if (row < maxLines) context.fillText(line, x, y + row * lineHeight);
      };

      const drawComposite = (caption, showParameter, captionOpacity) => {
        const sourceWidth = sceneCanvas.width;
        const sourceHeight = sceneCanvas.height;
        const destinationAspect = width / height;
        const sourceAspect = sourceWidth / sourceHeight;
        let sx = 0;
        let sy = 0;
        let sw = sourceWidth;
        let sh = sourceHeight;
        if (sourceAspect > destinationAspect) {
          sw = sourceHeight * destinationAspect;
          sx = (sourceWidth - sw) / 2;
        } else {
          sh = sourceWidth / destinationAspect;
          sy = (sourceHeight - sh) / 2;
        }
        context.drawImage(sceneCanvas, sx, sy, sw, sh, 0, 0, width, height);

        const topShade = context.createLinearGradient(0, 0, 0, 180);
        topShade.addColorStop(0, "rgba(5,8,13,.88)");
        topShade.addColorStop(1, "rgba(5,8,13,0)");
        context.fillStyle = topShade;
        context.fillRect(0, 0, width, 180);
        const bottomShade = context.createLinearGradient(0, height - 340, 0, height);
        bottomShade.addColorStop(0, "rgba(5,8,13,0)");
        bottomShade.addColorStop(1, "rgba(5,8,13,.97)");
        context.fillStyle = bottomShade;
        context.fillRect(0, height - 340, width, 340);

        context.fillStyle = "#ff7a1a";
        context.fillRect(42, 42, 4, 30);
        context.fillStyle = "#f2f5f8";
        context.font = '600 24px "Space Grotesk", sans-serif';
        context.fillText("SELENE-ISRU", 60, 65);
        context.fillStyle = "#8e9aaa";
        context.font = '500 12px "IBM Plex Mono", monospace';
        context.fillText("LUNAR TRADE-SPACE SIMULATOR", 242, 64);
        context.fillStyle = "rgba(255,122,26,.14)";
        roundedRect(width - 208, 40, 166, 30, 15);
        context.fill();
        context.fillStyle = "#ff9d55";
        context.fillText("EQUATORIAL · LIVE", width - 190, 60);

        const state = api.snapshot();
        const metrics = [
          ["SEC TOTAL", format(state.secTotalKWhPerKg), "kWh/kg", "#ff7a1a"],
          ["GRID POWER", format(state.gridPowerW), "W", "#f5c84c"],
          ["MISSIONS", format(state.missions), "", "#b48cf2"],
          ["MASS EQUIV.", format(state.massThroughputDays), "days", "#9fa8b7"],
          ["LEVERAGE", format(state.leverageL), "×", "#4ade80"],
          ["OUTPUT", format(state.targetKgPerDay), "kg/day", "#6fd3f2"]
        ];
        const ribbonY = height - 112;
        context.fillStyle = "rgba(7,11,17,.93)";
        context.fillRect(0, ribbonY, width, 112);
        context.strokeStyle = "rgba(255,255,255,.12)";
        context.beginPath();
        context.moveTo(0, ribbonY + 0.5);
        context.lineTo(width, ribbonY + 0.5);
        context.stroke();
        const cellWidth = width / metrics.length;
        metrics.forEach(([label, value, unit, color], index) => {
          const x = index * cellWidth + 40;
          context.fillStyle = "#f1f4f8";
          context.font = '600 30px "Space Grotesk", sans-serif';
          context.fillText(value, x, ribbonY + 49);
          const valueWidth = context.measureText(value).width;
          context.fillStyle = "#9ba6b5";
          context.font = '500 12px "IBM Plex Mono", monospace';
          if (unit.length > 0) context.fillText(unit, x + valueWidth + 7, ribbonY + 48);
          context.fillStyle = color;
          context.fillRect(x, ribbonY + 70, 34, 2);
          context.fillStyle = "#8e99a8";
          context.font = '500 11px "IBM Plex Mono", monospace';
          context.fillText(label, x, ribbonY + 91);
        });

        if (showParameter) {
          const x = 42;
          const y = height - 330;
          const w = 450;
          const h = 168;
          roundedRect(x, y, w, h, 8);
          context.fillStyle = "rgba(7,11,17,.88)";
          context.fill();
          context.strokeStyle = "rgba(255,122,26,.72)";
          context.stroke();
          context.fillStyle = "#ff9d55";
          context.font = '500 12px "IBM Plex Mono", monospace';
          context.fillText("LIVE PARAMETER", x + 22, y + 31);
          context.fillStyle = "#e9edf2";
          context.font = '600 21px "Space Grotesk", sans-serif';
          context.fillText("Daily product target", x + 22, y + 64);
          context.fillStyle = "#f6f8fa";
          context.font = '600 32px "Space Grotesk", sans-serif';
          context.fillText(`${format(state.targetKgPerDay)} kg/day`, x + 22, y + 105);
          const trackX = x + 22;
          const trackY = y + 137;
          const trackW = w - 44;
          const fraction = clamp01((state.targetKgPerDay - 10) / 19_990);
          context.fillStyle = "#313946";
          context.fillRect(trackX, trackY, trackW, 4);
          context.fillStyle = "#ff7a1a";
          context.fillRect(trackX, trackY, trackW * fraction, 4);
          context.beginPath();
          context.arc(trackX + trackW * fraction, trackY + 2, 8, 0, Math.PI * 2);
          context.fillStyle = "#f3f5f7";
          context.fill();
          context.strokeStyle = "#ff7a1a";
          context.lineWidth = 3;
          context.stroke();
          context.lineWidth = 1;
        }

        context.save();
        context.globalAlpha = captionOpacity;
        const w = 540;
        const h = 166;
        const x = width - w - 42;
        const y = height - 330;
        roundedRect(x, y, w, h, 8);
        context.fillStyle = "rgba(7,11,17,.86)";
        context.fill();
        context.fillStyle = "#ff7a1a";
        context.fillRect(x, y, 4, h);
        context.fillStyle = "#ff9d55";
        context.font = '500 12px "IBM Plex Mono", monospace';
        context.fillText(caption[0], x + 24, y + 29);
        context.fillStyle = "#f2f5f8";
        context.font = '600 27px "Space Grotesk", sans-serif';
        wrapText(caption[1], x + 24, y + 66, w - 48, 31, 2);
        context.fillStyle = "#aeb8c5";
        context.font = '400 13px "IBM Plex Mono", monospace';
        wrapText(caption[2], x + 24, y + 125, w - 48, 18, 2);
        context.restore();
      };

      const { Muxer, ArrayBufferTarget } = window.WebMMuxer;
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: "V_VP8",
          width,
          height,
          frameRate: fps
        },
        firstTimestampBehavior: "strict"
      });
      let encoderError = null;
      const encoder = new VideoEncoder({
        output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
        error: (error) => {
          encoderError = error;
        }
      });
      const config = {
        codec: "vp8",
        width,
        height,
        bitrate: 10_000_000,
        framerate: fps,
        latencyMode: "realtime"
      };
      const support = await VideoEncoder.isConfigSupported(config);
      if (!support.supported) throw new Error("VP8 WebCodecs encoding is unsupported");
      encoder.configure(config);

      let lastProductionTarget = 1_000;
      const totalFrames = Math.round(durationSeconds * fps);
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        const time = frameIndex / fps;
        const track = tracks.find((candidate) => time >= candidate.start && time < candidate.end);
        let caption = finalCaption;
        let showParameter = false;
        let captionOpacity = 1;
        if (track !== undefined) {
          const local = time - track.start;
          const span = track.end - track.start;
          const progress = ease(clamp01(local / span));
          api.setCameraPose(cubic(track.positions, progress), cubic(track.targets, progress));
          caption = track.caption;
          showParameter = track.start === 12;
          captionOpacity = Math.min(1, local / 0.35, (span - local) / 0.25);
          if (showParameter) {
            const productionProgress = ease(clamp01(local / 4));
            const nextTarget = 1_000 + 9_000 * productionProgress;
            if (Math.abs(nextTarget - lastProductionTarget) >= 40) {
              api.setTargetKgPerDay(nextTarget);
              lastProductionTarget = nextTarget;
            }
          } else if (track.start >= 20 && lastProductionTarget !== 10_000) {
            api.setTargetKgPerDay(10_000);
            lastProductionTarget = 10_000;
          }
        } else {
          api.setCameraPose([34, 30, 58], [0, 2, 0]);
          if (lastProductionTarget !== 10_000) {
            api.setTargetKgPerDay(10_000);
            lastProductionTarget = 10_000;
          }
          captionOpacity = Math.min(1, (time - 28) / 0.4);
        }

        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        drawComposite(caption, showParameter, clamp01(captionOpacity));
        const timestamp = Math.round((frameIndex * 1_000_000) / fps);
        const frame = new VideoFrame(output, {
          timestamp,
          duration: Math.round(1_000_000 / fps)
        });
        encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
        frame.close();
        while (encoder.encodeQueueSize > 6) {
          await new Promise((resolveQueue) => setTimeout(resolveQueue, 1));
        }
        if (encoderError !== null) throw encoderError;
      }

      await encoder.flush();
      encoder.close();
      if (encoderError !== null) throw encoderError;
      muxer.finalize();

      const bytes = new Uint8Array(target.buffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      return btoa(binary);
    },
    {
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      durationSeconds: TARGET_DURATION_S
    }
  );
} finally {
  await browser.close();
}

await writeFile(RAW_OUTPUT, Buffer.from(rawBase64, "base64"));

const { stdout: packetOutput } = await execFileAsync("ffprobe", [
  "-v",
  "error",
  "-select_streams",
  "v:0",
  "-show_entries",
  "packet=pts_time",
  "-of",
  "csv=p=0",
  RAW_OUTPUT
]);
const packetTimes = packetOutput
  .trim()
  .split(/\r?\n/)
  .map(Number)
  .filter(Number.isFinite);
const lastPacketTime = packetTimes.at(-1);
if (lastPacketTime === undefined || lastPacketTime <= 0) {
  throw new Error("Could not measure the raw recording duration");
}
const rawDuration = lastPacketTime + 1 / FPS;
const timeScale = TARGET_DURATION_S / rawDuration;

await run("ffmpeg", [
  "-y",
  "-i",
  RAW_OUTPUT,
  "-vf",
  `setpts=${timeScale.toFixed(9)}*PTS,trim=duration=${TARGET_DURATION_S},` +
    "minterpolate=fps=30:mi_mode=blend,scale=1920:1080:flags=lanczos," +
    "unsharp=5:5:0.35:5:5:0," +
    "fade=t=in:st=0:d=0.45,fade=t=out:st=31.15:d=0.85,format=yuv420p",
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "18",
  "-r",
  "30",
  "-t",
  String(TARGET_DURATION_S),
  "-movflags",
  "+faststart",
  OUTPUT
]);

if (process.env.KEEP_RAW !== "1") await rm(RAW_OUTPUT);
console.log(`recorded ${OUTPUT}`);
