# Video showcase

The complete five-video set is freshly rendered from the production application after the [equipment/environment milestone](visual-milestone.md), not re-encoded from old footage. All deliveries are silent **1920×1080, 30 fps, H.264 High, yuv420p MP4s** with fast-start metadata. No external footage, music, voice, HDRIs or stock imagery is used. The scene, fonts and UI are repository assets; captions are original editorial text.

SELENE-ISRU is a conceptual systems and comparative trade tool, **not flight, hardware, safety or mission-readiness validation**. Each cut keeps this boundary on screen. Displayed results come from actual app state; scene movement is illustrative, not a physical time-resolved operational reconstruction.

| Video | Duration | Distinct purpose |
| --- | ---: | --- |
| [Product cinematic](media/selene-isru-cinematic-demo.mp4) | 32 s | Equatorial overview, MRE detail, real 1,000 → 10,000 kg/day target change, then a separately identified polar-water case. |
| [Extended Custom Site cinematic](media/custom-site-cinematic-60s.mp4) | 60 s | Seven-beat staged assembly, operating topology, route assumptions, and a continuous Explore camera move. |
| [Short social cut](media/custom-site-cinematic-30s.mp4) | 30 s | Tighter editorial windows from the same new shots, at native speed—not uniformly accelerated UI and captions. |
| [Custom Site workflow](media/custom-site-sandbox-demo.mp4) | 45 s | Real canvas placement, file import preview/acceptance, route-label selection, Planner/Explore, study save and verified JSON export. |
| [Engineering/analysis demonstration](media/analysis-sprint-demo.mp4) | 86 s | Subsystem inputs/outputs, energy, scenarios, Pareto, illustrative sensitivity, report, bounded Mission Brief search and limitations. |

## Inventory and storyboard changes

The previous library at `42e96c6` contained four MP4s and one WebM. The showcase had omitted the analysis recording. All five were inventoried with `ffprobe`, and reference frames and their capture scripts were inspected before changes.

| Previous artifact | Observed issue / retained purpose |
| --- | --- |
| Product MP4, 31.633 s | Original compositor drew a 960×540 scene with 5-fps source frames before 1080p interpolation. Retained the fly-through and live target response; now native-resolution, native-temporal frames, better MRE framing and a polar chapter. |
| Custom cinematic, 59.967 s | Retained seven-beat structure; replaced stale topology wording and long cross-scene camera sweeps with shorter, subject-centered moves. |
| Custom short, 30 s | Previously a blanket 2× speed-up. Now an editorial selection from the same fresh shot masters with matching color, type and camera speed. |
| Workflow MP4, 12.68 s / 25 fps | Documentation still said 24.8 s. Recording had begun after import acceptance, so several claimed workflow steps were absent. The new 45 s edit visibly includes placement, review and acceptance. |
| Analysis WebM, 960×540 / VP9 / 25 fps | Replaced with a new H.264 MP4, not a transcode. The current tab is **SENSITIVITY**, not the legacy script's **UNCERTAINTY**. Longer holds make charts and caveats reviewable. |

The old analysis WebM is removed only after the new MP4 passes review; its history remains available in Git. Existing media was kept intact while candidates were rendered and checked in a separate temporary directory.

### Engineering claims checked against current state

The internal staged fixture and the importable JSON example are related but distinct reference documents; their route values are not assumed identical.

| Internal staged design | Assets / routes | Actual topology | Achievable output |
| --- | ---: | --- | ---: |
| Blank | 0 / 0 | Closed | 0 kg/day |
| Process core without power | 3 / 2 | Closed | 0 kg/day |
| Powered process with product endpoints | 6 / 5 | Open | 1,000 kg/day |
| With landing and habitat | 8 / 8 | Open | 1,000 kg/day |

The old storyboard's claim that output remains zero until the eighth asset is incorrect for the current model. The new cuts show the process graph becoming operational at the six-asset stage. The eight-asset stage adds infrastructure; it is not presented as the unique condition that enables output.

The workflow imports [Equatorial First Camp](examples/custom-equatorial-first-camp.v1.json), displays its real review cautions, and explicitly accepts it. The downloaded JSON is checked for the eight-asset/eight-route graph. [Shackleton Ice Camp](examples/custom-shackleton-ice-camp.v1.json) and the [polar illumination profile](examples/polar-site-profile.json) were inventoried; they are not silently substituted into the filmed default polar case.

The analysis piece uses the default equatorial case. Sensitivity uses 256 deterministic samples; the report and Mission Brief have their own disclosed 192-sample summaries. The finite Mission Brief search is shown without applying the recommendation, so the background live case intentionally remains equatorial while the recommendation may be polar. No hardware-performance or calibrated-probability claim is inferred from these calculations.

## Capture pipeline

`scripts/video-capture.mjs` is the shared production recorder. The old entry-point filenames remain as small wrappers; storyboards now live together in `scripts/capture-video-set.mjs` so short/long cuts cannot drift into different UI or asset generations.

- Fresh browser context; high graphics tier; DPR 1; locked daylight; HUD off; fonts and network requests settled before recording.
- The existing `?demo=1` bridge adds an opt-in visual clock. It calls the same diorama tick/render paths at exactly 1/30-second steps, without advancing or changing the physics model. Normal interactive rendering resumes when the capture clock is set to `null`.
- Native 1920×1080 browser frames, streamed through a high-quality JPEG intermediate to H.264; no low-resolution upscale, motion interpolation or wall-clock speed normalization. Readability holds and camera positions are frame-counted. Browser/font differences and document timestamps mean captures are not promised to be byte-identical across machines.
- Captions occupy their own 112-pixel footer; they do not replace actual outputs or cover the app's KPI strip. Photo-mode shots use the application's presentation mode, with its exit button hidden and the Custom Site grid expanded only in the recorder. UI shots retain real controls.
- Workflow steps use browser clicks and real file input/download. Interactions and loading waits are edited between settled shots, explicitly labeled as an edited capture. The staged cinematic is labeled staged assembly, not represented as manual dragging.
- Gentle eased camera paths stay above terrain and hold each subject in frame. Each final shot gives the viewer reading time, followed by a short fade and 0.2 seconds of clean black—no dangling loading screen or abrupt end.

## Reproduce without overwriting reviewed media

Install Node 22, pnpm 10.33, Chrome, `ffmpeg`, and `ffprobe`. Build and serve the production app:

```sh
pnpm build
pnpm --filter @selene-isru/app preview --host 127.0.0.1 --port 4173
```

In another terminal, supply a **candidate directory**, not a final MP4 path:

```sh
pnpm demo:videos -- http://127.0.0.1:4173/selene-isru/ /tmp/selene-video-candidates
pnpm verify:videos -- /tmp/selene-video-candidates /tmp/selene-video-review
node scripts/check-video-playback.mjs /tmp/selene-video-candidates /tmp/selene-video-review/playback.json
```

Or render a single piece with `demo:cinematic`, `demo:custom-cinematic`, `demo:workflow`, or `demo:analysis`, each taking `<productionBaseUrl> <candidateDirectory>`. `CAPTURE_PREFLIGHT=1` exercises the storyboard and writes one-frame layout previews; these are **not deliverable videos**. Supply a different directory for preflight output.

`CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH`, `FFMPEG_PATH`, and `FFPROBE_PATH` are supported. No generated build output, raw frame sequences, intermediary shot MP4s, or concat manifests belong in Git.

The technical verifier checks each expected file's duration, exact frame count, resolution, codec, pixel format, frame rate, MP4 structure, fast-start ordering, full decode and black final frame. It generates one-second timeline contact sheets plus full-resolution ending frames. Inspect those, the shot-level full-resolution PNGs, and playback **before** promoting candidates into `docs/media`.

`pnpm evidence:custom` now refreshes screenshots/performance only; it no longer silently overwrites the curated workflow video. Use `demo:workflow` for a reviewed video candidate. `pnpm smoke:custom` remains the non-mutating workflow gate.

## Verification and review evidence

See [technical verification](performance/video-release.json), [browser playback](performance/video-playback.json), [captured scenario states and edit durations](performance/video-capture-scenarios.json), and [review frames](screenshots/video-release/). The entire timeline of every finished video is sampled at one-second intervals; source-shot frames are checked at full resolution for captions and UI. Complete-file decode catches corrupt packets, and sequential normal-speed browser playback confirms load/play/end behavior for every MP4. Sequential playback avoids Chrome suspending silent background tabs. These checks establish artifact integrity, not end-user GPU performance or physical validity.

Relevant gates: the full `pnpm run ci` suite, the new capture-clock tests, production build, capture browser-error checks, current Custom Site smoke flow, and `git diff --check`. Original generated GLBs, procedural authoring sources, simulation constants and engine equations are unchanged by this media milestone.

The full gate passed **422 tests** (22 Python, 278 engine, 122 app), golden-vector and constants checks, the engine size ratchet, TypeScript checks, production build and Python lint. The production Custom Site smoke flow also passed, including import, route evaluation, save/export and mobile review; GPU context-loss injection remains the existing explicitly skipped SwiftShader limitation.

All 7,590 encoded frames are present and decode successfully. Sequential Chrome playback reached every expected endpoint at 1×; it reported four presentation-scheduling drops out of 2,580 analysis frames and zero for the other cuts. These are browser playback measurements, not missing encoded frames or a claim of identical playback on every device.

Review rejected an early Custom Site photo-mode layout with an empty stage and a workflow camera that cropped the landing system; both were recaptured before promotion. Encoding review also caught inherited full-range JPEG metadata. The delivered encodes explicitly convert to limited-range BT.709 rather than only attaching color tags.

Remaining limits: the movies deliberately preserve the application's conceptual visual language, stylized flow paths, label density and scene-scale approximations. UI actions are edited between settled views rather than a continuous mouse tutorial. Dark polar areas represent the application's shadowed-floor presentation. No audio is supplied; any later soundtrack needs its own license. The analysis is representative, not exhaustive, and capture timing is not a runtime performance benchmark.
