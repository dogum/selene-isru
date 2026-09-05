// Curated production videos; candidates stay outside docs/media until reviewed.
// node scripts/capture-video-set.mjs product|custom|workflow|analysis|all <baseUrl> <candidateDir>
import { resolve } from 'node:path';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { openCapture, clickText, settle, photo, shot, finish, exec, ffmpeg } from './video-capture.mjs';

const [piece = 'all', base = 'http://127.0.0.1:4173/selene-isru/', candidateDir] = process.argv.slice(2).filter(a => a !== '--');
if (!candidateDir) throw new Error('Supply a candidate directory outside docs/media; review before promotion');
const out = resolve(candidateDir);
if (out === resolve('docs/media') || out.startsWith(resolve('docs/media')+'/')) throw new Error('Capture to a separate candidate directory first');
await mkdir(out, { recursive: true });
const pose = (position,target) => ({ position,target });

async function selectAsset(capture, label) {
  await clickText(capture.page, 'button', 'ASSETS');
  await clickText(capture.page, '[role="menuitem"]', label);
  await settle(capture);
}

async function framePlanner(capture) {
  const page = capture.page;
  await page.evaluate(() => window.__SELENE_DEMO__.setCameraPose([-4,158,-1.99],[-4,0,-2]));
  await page.mouse.move(920,420);
  for (let i=0;i<2;i++) await page.mouse.wheel({deltaY:100});
  await settle(capture);
}

async function product() {
  let c = await openCapture(base, resolve(out,'product-shots'));
  try {
    await photo(c,true);
    await shot(c,{id:'equatorial',seconds:5,title:'SELENE-ISRU · From regolith to oxygen',subtitle:'Equatorial concept · 1,000 kg/day product target · coupled process, power and logistics',
      from:pose([49,38,74],[-5,1,-3]),to:pose([30,32,74],[-5,1,-3])});
    await shot(c,{id:'mre-detail',seconds:5,title:'A coupled industrial process',subtitle:'Molten-regolith electrolysis · feed, thermal state and product paths follow the model',
      from:pose([-37,14,26],[-20,2.7,0]),to:pose([-28,12,26],[-20,2.7,0])});
    await photo(c,false);
    await selectAsset(c,'MRE reactor');
    await shot(c,{id:'live-target',seconds:6,title:'Change the target. Recompute the trade.',subtitle:'Scripted input change: 1,000 → 10,000 kg/day · displayed values are engine outputs',
      from:pose([-37,15,29],[-15,3,0]),to:pose([-37,15,29],[-15,3,0]),
      action:async (frame,{page}) => {
        if (frame===60) {
          await page.evaluate(() => window.__SELENE_DEMO__.setTargetKgPerDay(10000));
          await settle(c);
        }
      }});
    await clickText(c.page,'button','CLOSE'); await photo(c,true);
    await shot(c,{id:'scaled-case',seconds:4,title:'10,000 kg/day target · a different infrastructure case',subtitle:'Continuously sized conceptual equipment is not a vendor capacity guarantee',
      from:pose([40,37,75],[-5,1,-3]),to:pose([34,36,78],[-5,1,-3])});
    const eqSegments = [...c.segments], eqEvidence = [...c.evidence];
    await c.browser.close();
    c = await openCapture(base,resolve(out,'polar-shots'),'site=polar');
    c.segments = eqSegments; c.evidence = eqEvidence;
    await photo(c,true);
    await shot(c,{id:'polar',seconds:6,title:'At the pole · a different resource and energy problem',subtitle:'Separate polar case · 1,000 kg/day water target · sunlit rim and shadowed floor',
      from:pose([48,36,68],[0,0,-18]),to:pose([34,32,65],[0,0,-18])});
    await shot(c,{id:'polar-close',seconds:6,title:'Explore the lunar trade space',subtitle:'Sublimation and water recovery · open source at dogum.github.io/selene-isru',
      from:pose([22,5,27],[4,-7,0]),to:pose([16,4,27],[4,-7,0])});
    await finish(c,resolve(out,'selene-isru-cinematic-demo.mp4'));
  } finally { await c.browser.close(); }
}

async function custom() {
  const c = await openCapture(base,resolve(out,'custom-shots'));
  const page = c.page;
  const stage = async (n,assets,connections) => {
    await page.evaluate(n => window.__SELENE_DEMO__.setCustomStage(n),n);
    await page.waitForFunction((a,b) => window.__SELENE_DEMO__.customSnapshot().assets===a && window.__SELENE_DEMO__.customSnapshot().connections===b,{},assets,connections);
    await settle(c);
    const state = await page.evaluate(() => window.__SELENE_DEMO__.customSnapshot());
    if ((n<2 && state.achievableOutputKgPerDay!==0) || (n>=2 && (!state.topologyValid || state.achievableOutputKgPerDay!==1000))) throw new Error(`Unexpected staged topology result: ${JSON.stringify(state)}`);
    if (n>0) await framePlanner(c);
  };
  try {
    await stage(0,0,0);
    await shot(c,{id:'blank',seconds:6,title:'Start with an honest zero.',subtitle:'Staged reference design · blank topology means no achievable output'});
    await stage(1,3,2);
    await shot(c,{id:'process',seconds:7,title:'Place the process core.',subtitle:'Excavation → hauling → MRE · staged assembly, not drag-and-drop footage'});
    await stage(2,6,5);
    await shot(c,{id:'routes',seconds:7,title:'Connect the required process graph.',subtitle:'Six assets, five routes · this powered core now reaches the modeled target'});
    await stage(3,8,8);
    await shot(c,{id:'complete',seconds:8,title:'Add landing and habitat infrastructure.',subtitle:'Eight assets, eight routes · 1,000 kg/day achievable in the screening model'});
    await page.evaluate(() => window.__SELENE_DEMO__.selectCustomConnection('eq-reactor-power'));
    await shot(c,{id:'route-inspector',seconds:10,title:'Inspect the route, not just the line.',subtitle:'Length, cable mass and loss · assumptions and exclusions stay visible'});
    await page.evaluate(() => window.__SELENE_DEMO__.selectCustomConnection(null));
    await clickText(page,'button','EXPLORE'); await photo(c,true);
    await shot(c,{id:'explore',seconds:14,title:'The same design. A different view.',subtitle:'Explore preserves the saved graph and operating state',
      from:pose([42,36,64],[-7,1,-2]),to:pose([4,32,72],[-7,1,-2])});
    await shot(c,{id:'share',seconds:8,title:'Design. Inspect. Compare. Share.',subtitle:'SELENE-ISRU · dogum.github.io/selene-isru',
      from:pose([4,32,72],[-7,1,-2]),to:pose([-20,35,74],[-7,1,-2])});
    await finish(c,resolve(out,'custom-site-cinematic-60s.mp4'));
    if (process.env.CAPTURE_PREFLIGHT === '1') return;
    // Native-speed shorter editorial windows; no 2x accelerated UI or text.
    const durations = [2,3,3,5,4,8,5];
    const shortened = [];
    for (const [i,s] of c.segments.entries()) {
      const path = resolve(out,'custom-shots',`short-${s.id}.mp4`);
      await exec(ffmpeg,['-hide_banner','-loglevel','error','-y','-ss',String((s.seconds-durations[i])/2),'-i',s.path,
        '-t',String(durations[i]),'-an','-c:v','libx264','-preset','fast','-crf','18','-r','30','-pix_fmt','yuv420p',path]);
      shortened.push({...s,path,seconds:durations[i]});
    }
    await finish(c,resolve(out,'custom-site-cinematic-30s.mp4'),shortened);
  } finally { await c.browser.close(); }
}

async function workflow() {
  const c = await openCapture(base,resolve(out,'workflow-shots'));
  const page = c.page;
  try {
    await clickText(page,'button','CUSTOM SITE'); await settle(c);
    await shot(c,{id:'workflow-blank',seconds:4,title:'Custom Site · real desktop workflow',subtitle:'Edited capture · no waiting or loading footage · begin with a blank design'});
    const card = await page.evaluateHandle(() => [...document.querySelectorAll('.custom-catalog-card')].find(e=>e.textContent.includes('Excavation rover'))?.querySelector('button'));
    await card.asElement().click(); await page.mouse.click(900,430);
    await page.waitForFunction(() => document.querySelectorAll('.custom-scene-label').length===1);
    await shot(c,{id:'workflow-placement',seconds:5,title:'Place an excavation rover on the canvas.',subtitle:'The catalog footprint becomes a selectable design asset'});
    await clickText(page,'button','← SITE SETTINGS');
    const input = await page.$('input[type="file"][accept*="json"]');
    await input.uploadFile(resolve('docs/examples/custom-equatorial-first-camp.v1.json'));
    await page.waitForSelector('[aria-label="Custom design import preview"]');
    await shot(c,{id:'workflow-preview',seconds:6,title:'Review a versioned project before accepting it.',subtitle:'Import preview · Equatorial First Camp · replacement requires explicit acceptance'});
    await clickText(page,'button','ACCEPT DESIGN');
    await page.waitForFunction(()=>document.querySelector('.custom-statusbar')?.textContent.includes('TOPOLOGY GATE OPEN'));
    await framePlanner(c);
    await shot(c,{id:'workflow-accepted',seconds:7,title:'Accept the project. Inspect its evaluated state.',subtitle:'Eight assets and eight connections · planned and achievable outputs remain distinct'});
    // Real rendered route-label click opens the same inspector used by users.
    await page.click('.custom-connection-power[aria-label*="MRE"]');
    await shot(c,{id:'workflow-route',seconds:6,title:'Read the power-route screening assumptions.',subtitle:'Spatial route consequences are disclosed, not treated as detailed cable design'});
    await clickText(page,'button','← SITE SETTINGS');
    await clickText(page,'button','EXPLORE');
    await shot(c,{id:'workflow-explore',seconds:7,title:'Switch to Explore without changing the design.',subtitle:'The saved assets, routes and evaluation remain the source of truth',
      from:pose([48,42,78],[-4,1,-2]),to:pose([40,40,81],[-4,1,-2])});
    await clickText(page,'button','PLANNER');
    await clickText(page,'button','SAVE TO STUDY');
    const downloadDir = await mkdtemp(resolve(out,'downloads-'));
    const cdp = await page.createCDPSession(); await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
    await clickText(page,'button','EXPORT DESIGN');
    await settle(c);
    const downloads = (await readdir(downloadDir)).filter(n=>n.endsWith('.json'));
    if (!downloads.length) throw new Error('No downloaded design');
    const downloaded = JSON.parse(await readFile(resolve(downloadDir,downloads[0]),'utf8'));
    if (downloaded.assets?.length!==8 || downloaded.connections?.length!==8) throw new Error('Downloaded graph differs');
    await shot(c,{id:'workflow-saved',seconds:10,title:'Save to the study library. Export the design.',subtitle:'Actual JSON download checked: eight assets, eight routes · ready for reproducible review'});
    await finish(c,resolve(out,'custom-site-sandbox-demo.mp4'));
  } finally { await c.browser.close(); }
}

async function analysis() {
  const c = await openCapture(base,resolve(out,'analysis-shots'));
  const page = c.page;
  try {
    await selectAsset(c,'MRE reactor');
    await shot(c,{id:'analysis-subsystem',seconds:8,title:'Engineering analysis · begin with a subsystem',subtitle:'Default equatorial case · live inputs, outputs and model maturity',
      from:pose([-37,15,29],[-15,3,0]),to:pose([-37,15,29],[-15,3,0])});
    await clickText(page,'button','CLOSE');
    await page.evaluate(() => window.__SELENE_DEMO__.setCameraPose([-28,17,34],[-5,2,7]));
    await clickText(page,'[role="tab"]','ENERGY');
    await shot(c,{id:'analysis-energy',seconds:8,title:'Inspect the energy breakdown.',subtitle:'Follow the computed process demand before comparing architectures'});
    await clickText(page,'[role="tab"]','TRADE STUDY');
    await page.waitForSelector('[aria-label="Trade study workspace"]');
    await shot(c,{id:'analysis-scenarios',seconds:8,title:'Keep scenarios explicit and reproducible.',subtitle:'The scenario library records assumptions and supports named comparisons'});
    await clickText(page,'[role="tab"]','PARETO');
    await page.waitForSelector('.frontier-section');
    await shot(c,{id:'analysis-pareto',seconds:12,title:'Explore a bounded Pareto grid.',subtitle:'Non-dominated points depend on the chosen axes, limits and model'});
    await clickText(page,'[role="tab"]','SENSITIVITY');
    await page.waitForSelector('.uncertainty-section');
    await shot(c,{id:'analysis-sensitivity',seconds:12,title:'Test sensitivity to illustrative input spreads.',subtitle:'256 deterministic samples · not a calibrated probability of mission success'});
    await clickText(page,'[role="tab"]','REPORT');
    await page.waitForSelector('.engineering-report');
    await shot(c,{id:'analysis-report',seconds:10,title:'Review the engineering snapshot.',subtitle:'Inputs, computed outputs, warnings and a reproducibility link'});
    await page.click('[aria-label="Close panel"]');
    await clickText(page,'button','BRIEF');
    await page.waitForSelector('[aria-label="Mission brief optimizer"]');
    await shot(c,{id:'analysis-brief-inputs',seconds:8,title:'State the design-search constraints first.',subtitle:'A finite model search · not a continuous global optimizer'});
    await clickText(page,'button','RUN DESIGN SEARCH');
    await page.waitForFunction(()=>document.body.innerText.includes('RECOMMENDED BOUNDED DESIGN'));
    await shot(c,{id:'analysis-recommendation',seconds:12,title:'Read the bounded recommendation and its caveats.',subtitle:'Search does not change the live case until an explicit Apply action'});
    await page.$eval('.mission-brief-body',e=>e.scrollTo({top:e.scrollHeight,behavior:'instant'}));
    await shot(c,{id:'analysis-limits',seconds:8,title:'Model limits belong in the conclusion.',subtitle:'Conceptual systems comparison · not flight, safety, hardware or mission-readiness validation'});
    await finish(c,resolve(out,'analysis-sprint-demo.mp4'));
  } finally { await c.browser.close(); }
}

const runners = { product, custom, workflow, analysis };
if (piece === 'all') { for (const run of Object.values(runners)) await run(); }
else if (runners[piece]) await runners[piece]();
else throw new Error(`Unknown video piece: ${piece}`);
await writeFile(resolve(out,'candidate-note.txt'),'Candidates only. Validate and review every output before copying to docs/media.\n');
