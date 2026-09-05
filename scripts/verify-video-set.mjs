// Technical gate and exhaustive timeline sampling; does not promote any media.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { exec, ffmpeg, ffprobe } from './video-capture.mjs';
const [candidateDir, reviewDir] = process.argv.slice(2);
if (!candidateDir || !reviewDir) throw new Error('Usage: verify-video-set.mjs <candidateDir> <reviewDir>');
await mkdir(reviewDir,{recursive:true});
const expected = {
  'selene-isru-cinematic-demo.mp4':32,
  'custom-site-cinematic-60s.mp4':60,
  'custom-site-cinematic-30s.mp4':30,
  'custom-site-sandbox-demo.mp4':45,
  'analysis-sprint-demo.mp4':86
};
const report = { schema:'selene-video-release', version:1, sourceCommit:(await exec('git',['rev-parse','HEAD'])).stdout.trim(),
  dimensions:'1920×1080 native capture', encoding:'silent H.264 High / yuv420p / 30 fps / faststart', videos:[],
  reviewStatus:'Technical checks only; contact sheets and browser playback still require review.' };
for (const [name,duration] of Object.entries(expected)) {
  const path = resolve(candidateDir,name);
  const {stdout} = await exec(ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',path]);
  const probe = JSON.parse(stdout), stream = probe.streams[0];
  if (probe.streams.length!==1 || stream.codec_name!=='h264' || stream.width!==1920 || stream.height!==1080 ||
      stream.pix_fmt!=='yuv420p' || stream.profile!=='High' || stream.color_space!=='bt709' ||
      stream.r_frame_rate!=='30/1' || stream.avg_frame_rate!=='30/1' ||
      Number(stream.nb_read_frames)!==duration*30 || Math.abs(Number(probe.format.duration)-duration)>0.001) throw new Error(`Format/frame-count mismatch: ${name}`);
  await exec(ffmpeg,['-v','error','-xerror','-i',path,'-f','null','-'],{maxBuffer:1024*1024});
  const {stdout:last} = await exec(ffmpeg,['-v','error','-sseof','-0.04','-i',path,'-vf','scale=32:18,format=gray','-frames:v','1','-f','rawvideo','pipe:1'],{encoding:'buffer'});
  if (!last.length || Math.max(...last)>3) throw new Error(`Final frame is not clean black: ${name}`);
  const bytes = await readFile(path);
  const atoms = []; let offset=0;
  while(offset+8<=bytes.length) {
    const size=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);
    if (size<8) throw new Error(`Unexpected MP4 atom length: ${name}`);
    atoms.push(type); offset+=size;
  }
  if (offset!==bytes.length || atoms.indexOf('moov')<0 || atoms.indexOf('moov')>atoms.indexOf('mdat')) throw new Error(`Invalid/slow-start container: ${name}`);
  const prefix=resolve(reviewDir,name.replace('.mp4',''));
  await exec(ffmpeg,['-v','error','-y','-i',path,'-vf','fps=1,scale=480:270,tile=4x4:padding=2:margin=2:color=black',`${prefix}-%02d.jpg`]);
  await exec(ffmpeg,['-v','error','-y','-sseof','-1.5','-i',path,'-frames:v','1',`${prefix}-ending.png`]);
  report.videos.push({name,durationSeconds:Number(probe.format.duration),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    codec:stream.codec_name,profile:stream.profile,pixelFormat:stream.pix_fmt,colorSpace:stream.color_space,width:stream.width,height:stream.height,
    frameRate:stream.avg_frame_rate,frames:Number(stream.nb_read_frames),fullDecode:'pass',fastStart:true,finalFrameMaxLuma:Math.max(...last)});
  console.log(`PASS ${name}: ${duration}s, ${stream.nb_read_frames} frames, complete decode, clean ending`);
}
await writeFile(resolve(reviewDir,'video-release.json'),JSON.stringify(report,null,2)+'\n');
