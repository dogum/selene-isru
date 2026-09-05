// Browser playback gate for every finished MP4; no application-state changes.
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
const [directory, reportPath] = process.argv.slice(2);
if (!directory || !reportPath) throw new Error('Usage: check-video-playback.mjs <videoDirectory> <report.json>');
const files = (await readdir(directory)).filter(n=>n.endsWith('.mp4'));
const server = createServer(async(req,res)=>{
  const name = decodeURIComponent((req.url ?? '/').slice(1));
  if (!files.includes(name)) {res.writeHead(404); res.end(); return;}
  try {
    const bytes=await readFile(resolve(directory,name));
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start=Number(range[1]),end=Math.min(Number(range[2] || bytes.length-1),bytes.length-1);
      if (start>end || start>=bytes.length) {res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});res.end();return;}
      res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,
        'Content-Range':`bytes ${start}-${end}/${bytes.length}`});res.end(bytes.subarray(start,end+1));
    } else {
      res.writeHead(200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':bytes.length});res.end(bytes);
    }
  } catch {res.writeHead(500);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
try {
  // Silent background tabs may be suspended by Chrome: test each visible page
  // sequentially rather than mistaking browser power saving for bad media.
  const results=[];
  for (const name of files) {
    const page=await browser.newPage();
    await page.setViewport({width:1920,height:1080});
    await page.setContent('<video controls muted style="width:100%;height:100%;background:black"></video>');
    const result=await page.evaluate(async url=>{
      const v=document.querySelector('video'); v.src=url;
      return await new Promise((res,rej)=>{
        const timeout=setTimeout(()=>rej(new Error('Playback timeout')),120000);
        v.onerror=()=>{clearTimeout(timeout);rej(new Error(`${url}: ${v.error?.code} ${v.error?.message ?? 'Video error'}`));};
        v.onended=()=>{clearTimeout(timeout); const q=v.getVideoPlaybackQuality();res({duration:v.duration,width:v.videoWidth,height:v.videoHeight,
          ended:v.ended,currentTime:v.currentTime,playbackRate:v.playbackRate,totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames});};
        v.play().catch(rej);
      });
    },`http://127.0.0.1:${server.address().port}/${name}`);
    if (!result.ended || result.width!==1920 || result.height!==1080) throw new Error(`Playback failed: ${name}`);
    console.log(`Played to end at 1x: ${name}`); await page.close(); results.push({name,...result});
  }
  await writeFile(reportPath,JSON.stringify({browser:await browser.version(),results},null,2)+'\n');
} finally {await browser.close(); await new Promise(r=>server.close(r));}
