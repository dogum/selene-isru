// Shared native-1080p, frame-stepped production capture. No prior video is input.
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer-core';

export const FPS = 30;
export const pause = ms => new Promise(r => setTimeout(r, ms));
export const exec = promisify(execFile);
export const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
export const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';

export async function openCapture(base, work, query = '') {
  await mkdir(work, { recursive: true });
  await exec(ffmpeg, ['-version']);
  await exec(ffprobe, ['-version']);
  let executablePath;
  for (const candidate of [process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    if (!candidate) continue;
    try { await access(candidate); executablePath = candidate; break; } catch { /* next */ }
  }
  if (!executablePath) throw new Error('Set CHROME_PATH to an installed Chrome binary');
  const browser = await puppeteer.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--hide-scrollbars', '--disable-background-networking', '--disable-component-update', '--enable-webgl', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem('selene.graphics', JSON.stringify({ tier: 'high', bloom: true, brightLighting: true, daylightLock: true, hud: false }));
  });
  await page.goto(`${base}?demo=1&${query}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__SELENE_DEMO__?.ready());
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: `
    .app { height: calc(100dvh - 112px) !important; min-height: 0 !important; }
    *, *::before, *::after { transition-duration: 0s !important; scroll-behavior: auto !important; }
    #video-caption { position: fixed; z-index: 10000; bottom: 0; left: 0; right: 0; height: 112px;
      box-sizing: border-box; background: #080d14; border-top: 1px solid #39424f; padding: 19px 40px;
      color: #eaf0f7; font-family: 'Space Grotesk', sans-serif; pointer-events: none; }
    #video-caption strong { display:block; font-size: 27px; font-weight:600; line-height: 1.25; }
    #video-caption span { display:block; margin-top:8px; font: 15px 'IBM Plex Mono', monospace; color:#b3bfcc; }
    #video-caption em { position:absolute; top:22px; right:40px; font: 12px 'IBM Plex Mono', monospace;
      font-style:normal; color:#ffab64; text-align:right; line-height:1.6; }
    #video-caption strong, #video-caption span { max-width: 1350px; }
    #video-brand { display:none; position:fixed; top:28px; left:40px; z-index:10000; color:#f5f7fa;
      background:#080d14df; border-left:4px solid #ff7a1a; padding:14px 20px; font:600 20px 'Space Grotesk',sans-serif; }
    body.selene-photo-mode #video-brand { display:block; }
    body.selene-photo-mode .photo-mode-exit { visibility:hidden; }
    body.selene-photo-mode .app.custom-site-app { grid-template-columns:1fr; grid-template-rows:0 1fr;
      grid-template-areas:"topbar" "stage"; }
    body.selene-photo-mode .custom-site-workspace { visibility:hidden; }
  ` });
  await page.evaluate(() => {
    const caption = document.createElement('div'); caption.id = 'video-caption';
    caption.innerHTML = '<strong></strong><span></span><em>CONCEPTUAL TRADE STUDY<br>NOT FLIGHT OR HARDWARE VALIDATION</em>';
    document.body.append(caption);
    const brand = document.createElement('div'); brand.id = 'video-brand'; brand.textContent = 'SELENE-ISRU / LUNAR SYSTEMS'; document.body.append(brand);
  });
  await pause(1000);
  await page.evaluate(() => window.__SELENE_DEMO__.setCaptureTime(0));
  return { browser, page, errors, work, elapsed: 0, segments: [], evidence: [], base };
}

export async function clickText(page, selector, text) {
  const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
    .find(e => e.textContent?.trim() === text || (text === 'ASSETS' && e.textContent?.trim().startsWith('ASSETS'))), { selector, text });
  const element = handle.asElement();
  if (!element) throw new Error(`Missing ${selector}: ${text}`);
  await element.click();
  await handle.dispose();
}

export async function settle(capture) {
  await capture.page.evaluate(() => document.fonts.ready);
  await capture.page.waitForNetworkIdle({ idleTime: 250, timeout: 60000 });
  await pause(500);
  await capture.page.evaluate(t => window.__SELENE_DEMO__.setCaptureTime(t), capture.elapsed);
  if (capture.errors.length) throw new Error(capture.errors.join('\n'));
}

export async function photo(capture, enabled) {
  await capture.page.evaluate(enabled => {
    const prefs = { ...JSON.parse(localStorage.getItem('selene.graphics')), photoMode: enabled };
    document.body.classList.toggle('selene-photo-mode', enabled);
    window.dispatchEvent(new CustomEvent('selene:graphics', { detail: prefs }));
  }, enabled);
  await settle(capture);
}

// A shot is explicitly edited: interactions/loading settle before the next shot.
// Every delivered motion frame is rendered once at 1/30 s, never interpolated.
export async function shot(capture, { id, seconds, title, subtitle, from, to, action }) {
  const { page, work } = capture;
  await page.evaluate(({ title, subtitle }) => {
    document.querySelector('#video-caption strong').textContent = title;
    document.querySelector('#video-caption span').textContent = subtitle;
  }, { title, subtitle });
  await settle(capture);
  const path = resolve(work, `${String(capture.segments.length).padStart(2,'0')}-${id}.mp4`);
  const child = spawn(ffmpeg, ['-hide_banner','-loglevel','error','-y', '-f','image2pipe','-framerate',String(FPS),'-vcodec','mjpeg','-i','pipe:0',
    '-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-profile:v','high','-level:v','4.1',
    '-r',String(FPS),'-video_track_timescale','15360','-movflags','+faststart', path], { stdio: ['pipe','ignore','pipe'] });
  let encoderErrors = '';
  child.stderr.on('data', d => { encoderErrors += d; });
  const closed = new Promise((res, rej) => {
    child.on('error', rej);
    child.on('close', code => code === 0 ? res() : rej(new Error(`ffmpeg ${code}: ${encoderErrors}`)));
  });
  closed.catch(() => {});
  child.stdin.on('error', () => {});
  const count = process.env.CAPTURE_PREFLIGHT === '1' ? 1 : Math.round(seconds*FPS);
  console.log(`Rendering ${id}: ${count} native frames`);
  try {
    for (let i=0; i<count; i++) {
      if (action) await action(i, capture);
      const progress = count === 1 ? 1 : i/(count-1);
      const u = progress*progress*(3-2*progress);
      const pose = from ? {
        position: from.position.map((v,a) => v+((to ?? from).position[a]-v)*u),
        target: from.target.map((v,a) => v+((to ?? from).target[a]-v)*u)
      } : null;
      await page.evaluate(({ time, pose }) => {
        const api = window.__SELENE_DEMO__;
        if (pose) api.setCameraPose(pose.position, pose.target);
        api.setCaptureTime(time);
      }, { time: capture.elapsed, pose });
      const buffer = await page.screenshot({ type: 'jpeg', quality: 98, optimizeForSpeed: true });
      if (!child.stdin.write(buffer)) await once(child.stdin, 'drain');
      capture.elapsed += 1/FPS;
      if (i === Math.floor(count/2)) {
        await page.screenshot({ path: resolve(work, `${id}.png`) });
      }
      if (i > 0 && i % 150 === 0) console.log(`  ${id}: ${i}/${count}`);
      if (capture.errors.length) throw new Error(capture.errors.join('\n'));
    }
    child.stdin.end(); await closed;
  } catch (error) { child.kill(); throw error; }
  capture.segments.push({ path, seconds, id });
  const state = await page.evaluate(() => ({ run: window.__SELENE_DEMO__.snapshot(), custom: window.__SELENE_DEMO__.customSnapshot(),
    text: document.body.innerText, loading: document.querySelector('.analysis-loading')?.textContent ?? null }));
  if (state.loading) throw new Error(`Unsettled loading UI: ${id}`);
  capture.evidence.push({ id, seconds, title, subtitle, ...state });
}

export async function finish(capture, output, selection = capture.segments) {
  await mkdir(dirname(output), { recursive: true });
  if (process.env.CAPTURE_PREFLIGHT === '1') {
    await writeFile(`${output}.preflight.json`, JSON.stringify(capture.evidence,null,2));
    return;
  }
  const list = `${output}.concat.txt`;
  await writeFile(list, selection.map(s => `file '${s.path.replaceAll("'", "'\\''")}'`).join('\n')+'\n');
  const duration = selection.reduce((sum,s) => sum+s.seconds,0);
  await exec(ffmpeg, ['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',list,
    '-vf',`scale=in_color_matrix=bt601:out_color_matrix=bt709:out_range=tv,fps=30,fade=t=in:st=0:d=0.3,fade=t=out:st=${duration-0.7}:d=0.5,format=yuv420p`,
    '-an','-c:v','libx264','-preset','slow','-crf','18','-profile:v','high','-level:v','4.1','-r','30',
    '-frames:v',String(Math.round(duration*FPS)),'-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
    '-movflags','+faststart',output], { maxBuffer: 4*1024*1024 });
  await writeFile(`${output}.capture.json`, JSON.stringify({ sourceCommit: (await exec('git',['rev-parse','HEAD'])).stdout.trim(),
    base: capture.base, width:1920, height:1080, fps:FPS, duration, browser:await capture.browser.version(),
    errors:capture.errors, edit:selection.map(s => ({id:s.id,seconds:s.seconds})), shots:capture.evidence }, null, 2)+'\n');
  console.log(`Candidate ready: ${output} (${duration}s)`);
}
