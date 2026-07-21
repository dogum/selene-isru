import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SimParams, SimResult } from "@selene-isru/engine";
import type { TimeseriesPoint } from "@selene-isru/engine";
import {
  connectedAssets,
  processEdges,
  type ProcessEdgeView
} from "../analysis/process";
import {
  type SiteMode,
  CAMERA_POSES,
  MODULE_ASSET,
  type GraphicsTier,
  qualityProfile,
  severityColor,
  SCENE_COLORS,
  type CameraPose,
  type QualityProfile
} from "./bindings";
import { EquatorialDiorama } from "./dioramas/equatorial";
import { PolarDiorama } from "./dioramas/polar";
import {
  effectiveTier,
  GRAPHICS_EVENT,
  loadGraphicsPrefs,
  PHOTO_EVENT,
  type GraphicsPrefs
} from "../lib/graphics";
import { disposeObject, makeStarfield } from "./dioramas/shared";
import type { Diorama } from "./dioramas/types";
import { PostPipeline } from "./post";
import {
  disposeProceduralTextures,
  makeProceduralEnvironment,
  setProceduralTextureAnisotropy,
  type ProceduralEnvironment
} from "./textures";
import { TweenManager } from "./tween";

const IDLE_ORBIT_DELAY_MS = 30_000;
const IDLE_ORBIT_RATE = (0.4 * Math.PI) / 180; // 0.4°/s

const INTERACTIVE_ASSET_LABELS: Record<SiteMode, Record<string, string>> = {
  equatorial: {
    excavator: "EXCAVATION ROVER EX-01",
    hauler: "REGOLITH HAULER HV-01",
    reactor: "MRE REACTOR MRE-01",
    castingYard: "CASTING YARD CY-01",
    tanks: "CRYOGENIC FARM CR-01",
    station: "HYBRID POWER HUB PW-01",
    pad: "LANDING SYSTEM LP-01",
    habitat: "SHIELDED HABITAT HAB-01"
  },
  polar: {
    excavator: "POLAR ICE EXCAVATOR PX-01",
    tents: "SUBLIMATION CAMP SUB-01",
    receiver: "BEAM RECEIVER + SABATIER BR-01",
    tanks: "POLAR CRYOGENIC FARM PCR-01",
    towers: "RIM POWER TOWERS PT-01",
    station: "POLAR NUCLEAR STATION PN-01",
    habitat: "POLAR HABITAT PHAB-01"
  }
};

const MOBILE_ASSET_LABELS: Record<SiteMode, Record<string, string>> = {
  equatorial: {
    excavator: "EXCAVATOR",
    hauler: "HAULER",
    reactor: "MRE REACTOR",
    castingYard: "CASTING YARD",
    tanks: "CRYO FARM",
    station: "POWER HUB",
    pad: "LANDING SYSTEM",
    habitat: "HABITAT"
  },
  polar: {
    excavator: "ICE EXCAVATOR",
    tents: "SUBLIMATION",
    receiver: "BEAM RECEIVER",
    tanks: "CRYO FARM",
    towers: "RIM TOWERS",
    station: "NUCLEAR STATION",
    habitat: "HABITAT"
  }
};

const ASSET_LABEL_HEIGHT: Record<SiteMode, Record<string, number>> = {
  equatorial: {
    excavator: 4.2,
    hauler: 3.6,
    reactor: 8,
    castingYard: 5.2,
    tanks: 5.2,
    station: 6.5,
    pad: 5.5,
    habitat: 5.4
  },
  polar: {
    excavator: 4.2,
    tents: 5.4,
    receiver: 5.8,
    tanks: 5.2,
    towers: 13,
    station: 7,
    habitat: 5.4
  }
};

interface Pulse {
  lines: THREE.LineSegments;
  start: number;
}

interface ProcessOverlayPath extends ProcessEdgeView {
  line: SVGLineElement;
  text: SVGTextElement;
}

export interface ViewerCallbacks {
  onSelectAsset?: (assetKey: string | null) => void;
}

/**
 * §3 — vanilla Three.js Viewer. One class owning renderer/scene/camera/loop;
 * React mounts it via ref and only ever calls the public methods below.
 */
export class Viewer {
  private container: HTMLElement;
  private veil: HTMLDivElement;
  private hud: HTMLDivElement;
  private assetLoadStatus: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private post!: PostPipeline;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fill!: THREE.AmbientLight;
  private lastLight: { point: TimeseriesPoint; site: SiteMode; cycleHours: number } | null = null;
  private stars!: THREE.Object3D;
  private diorama: Diorama | null = null;
  private environment: ProceduralEnvironment | null = null;
  private callbacks: ViewerCallbacks;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDown = new THREE.Vector2();
  private hoveredAssetKey: string | null = null;
  private selectedAssetKey: string | null = null;
  private hoverOutline: THREE.Mesh | null = null;
  private selectionOutline: THREE.Mesh | null = null;
  private connectionOutlines: THREE.Mesh[] = [];
  private assetTooltip: HTMLDivElement;
  private learningOverlay: HTMLDivElement;
  private processSvg: SVGSVGElement;
  private learningLabels = new Map<string, HTMLButtonElement>();
  private processPaths: ProcessOverlayPath[] = [];
  private learningMode = false;
  private showProcessFlow = false;
  private overlayPoint = new THREE.Vector3();

  private quality: QualityProfile;
  private mobile: boolean;
  private graphicsPrefs: GraphicsPrefs;
  private activeTier: GraphicsTier;
  private debugHud: boolean;
  private frameEwmaMs = 0;
  private slowFrames = 0;
  private fastFrames = 0;
  private hudLastAt = 0;
  private tweens = new TweenManager();
  private pulses: Pulse[] = [];
  private clock = new THREE.Clock();
  private elapsed = 0;
  private running = false;
  private needsRender = true;
  private reducedMotion: boolean;
  private lastInputAt = 0;
  private transitioning = false;

  private lastResult: SimResult | null = null;
  private lastParams: SimParams | null = null;
  private warnedIds = new Set<string>();
  private resizeObserver: ResizeObserver;
  private mediaQuery: MediaQueryList;
  private disposed = false;
  private loadedAssetCount = 0;
  private expectedAssetCount = 0;

  constructor(container: HTMLElement, mobile: boolean, callbacks: ViewerCallbacks = {}) {
    this.container = container;
    this.mobile = mobile;
    this.callbacks = callbacks;
    this.graphicsPrefs = loadGraphicsPrefs();
    this.activeTier = effectiveTier(this.graphicsPrefs.tier, mobile);
    this.debugHud = new URLSearchParams(window.location.search).get("debug") === "1";
    this.quality = qualityProfile(mobile, this.activeTier);
    this.mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = this.mediaQuery.matches;
    this.mediaQuery.addEventListener("change", this.onMotionPref);
    window.addEventListener(GRAPHICS_EVENT, this.onGraphicsPrefs as EventListener);
    window.addEventListener(PHOTO_EVENT, this.onPhotoRequest);

    this.veil = document.createElement("div");
    this.veil.className = "stage-veil";
    container.appendChild(this.veil);

    this.hud = document.createElement("div");
    this.hud.className = "stage-hud";
    container.appendChild(this.hud);
    this.updateHudVisibility();

    this.assetTooltip = document.createElement("div");
    this.assetTooltip.className = "asset-hover-label";
    this.assetTooltip.hidden = true;
    this.assetTooltip.textContent = "CLICK TO INSPECT";
    container.appendChild(this.assetTooltip);

    this.assetLoadStatus = document.createElement("div");
    this.assetLoadStatus.className = "asset-load-status";
    this.assetLoadStatus.setAttribute("role", "status");
    this.assetLoadStatus.setAttribute("aria-live", "polite");
    this.assetLoadStatus.hidden = true;
    container.appendChild(this.assetLoadStatus);

    this.learningOverlay = document.createElement("div");
    this.learningOverlay.className = "learning-scene-overlay";
    this.learningOverlay.hidden = true;
    this.processSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.processSvg.classList.add("process-flow-overlay");
    this.processSvg.setAttribute("aria-hidden", "true");
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.id = "selene-process-arrow";
    marker.setAttribute("viewBox", "0 0 8 8");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "4");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrow.setAttribute("d", "M 0 0 L 8 4 L 0 8 z");
    arrow.setAttribute("class", "process-flow-arrow");
    marker.appendChild(arrow);
    defs.appendChild(marker);
    this.processSvg.appendChild(defs);
    this.learningOverlay.appendChild(this.processSvg);
    container.appendChild(this.learningOverlay);

    this.initGL();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /* ---------------- lifecycle ---------------- */

  private initGL(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    this.renderer.setClearColor(SCENE_COLORS.space, 1);
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setProceduralTextureAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    this.container.insertBefore(this.renderer.domElement, this.veil);

    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost, false);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.onContextRestored, false);
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.onPointerLeave);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("contextmenu", this.onContextMenu);

    this.scene = new THREE.Scene();
    this.stars = makeStarfield(this.quality.starCount);
    this.scene.add(this.stars);

    this.sun = new THREE.DirectionalLight(0xfff2dd, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(SCENE_COLORS.earthshine, SCENE_COLORS.ground, 0.35);
    this.scene.add(this.hemi);

    // uniform fill so the scene stays legible for exploring; strength depends
    // on the "bright lighting" pref (§ friendly-illumination mode)
    this.fill = new THREE.AmbientLight(0xc4ccd8, 0);
    this.scene.add(this.fill);

    const aspect = Math.max(0.1, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 1400);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = (15 * Math.PI) / 180;
    this.controls.maxPolarAngle = (80 * Math.PI) / 180;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 140;
    this.controls.enablePan = false;
    this.controls.addEventListener("change", this.onUserInput);
    this.controls.addEventListener("start", this.onUserInput);

    this.post = new PostPipeline(this.renderer, this.scene, this.camera, {
      mobile: this.mobile,
      width: Math.max(1, this.container.clientWidth),
      height: Math.max(1, this.container.clientHeight),
      dpr: this.pixelRatio(),
      ao: this.quality.ao,
      bloom: this.graphicsPrefs.bloom && this.quality.bloom,
      bloomStrength: this.quality.bloomStrength
    });

    this.lastInputAt = performance.now();
    // Apply user lighting after the camera and post stack are ready. Starting
    // the render loop earlier could leave the first frame in the dark defaults.
    this.applyLightingMode();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    this.mediaQuery.removeEventListener("change", this.onMotionPref);
    window.removeEventListener(GRAPHICS_EVENT, this.onGraphicsPrefs as EventListener);
    window.removeEventListener(PHOTO_EVENT, this.onPhotoRequest);
    this.controls.dispose();
    if (this.diorama !== null) {
      this.diorama.dispose();
    }
    this.disposeEnvironment();
    disposeObject(this.scene);
    this.post.dispose();
    this.renderer.dispose();
    disposeProceduralTextures();
    this.renderer.domElement.remove();
    this.hud.remove();
    this.veil.remove();
    this.assetTooltip.remove();
    this.assetLoadStatus.remove();
    this.learningOverlay.remove();
  }

  /* ---------------- public API ---------------- */

  /** Idempotent. Called after every simulate (§3.1). */
  apply(result: SimResult, params: SimParams): void {
    const prevSite = this.lastResult?.site ?? null;
    this.lastResult = result;
    this.lastParams = params;

    if (prevSite === null || this.diorama === null) {
      this.buildSite(result.site);
      this.applyToDiorama(result, params, true);
    } else if (result.site !== prevSite && !this.transitioning) {
      this.siteTransition(result.site);
    } else {
      this.applyToDiorama(result, params, false);
    }
    this.refreshProcessOverlayData();
    this.pulseNewWarnings(result);
    this.wake();
  }

  /** fly the camera (1s) to a named pose for the current site */
  flyTo(key: string): void {
    if (this.lastResult === null) {
      return;
    }
    const poses = CAMERA_POSES[this.lastResult.site];
    const pose = poses[key] ?? poses.overview;
    this.flyToPose(pose, this.reducedMotion ? 0 : 1000);
    this.lastInputAt = performance.now();
  }

  /** §6 — camera fly + 3-pulse outline on the implicated asset */
  focusAsset(assetKey: string, severity: string): void {
    if (this.diorama === null || this.lastResult === null || this.lastParams === null) {
      return;
    }
    const asset = this.diorama.assets[assetKey];
    this.flyTo(assetKey);
    if (asset !== undefined) {
      this.spawnPulse(asset, severityColor(severity));
    }
  }

  /** Synchronize React inspector state with the scene selection treatment. */
  setSelectedAsset(assetKey: string | null): void {
    this.selectedAssetKey = assetKey;
    this.refreshSelectionOutline();
    this.updateLearningOverlay();
    this.wake();
  }

  /** Project explanatory labels and optional process paths over the live scene. */
  setLearningState(enabled: boolean, showProcessFlow: boolean): void {
    const siteChanged = this.learningLabels.size === 0 && this.diorama !== null;
    this.learningMode = enabled;
    this.showProcessFlow = showProcessFlow;
    this.learningOverlay.hidden = !enabled && this.selectedAssetKey === null;
    this.processSvg.style.display =
      this.selectedAssetKey !== null || (enabled && showProcessFlow) ? "" : "none";
    if (enabled && (siteChanged || this.processPaths.length === 0)) {
      this.rebuildLearningOverlay();
    }
    this.updateLearningOverlay();
    this.wake();
  }

  applyTime(point: TimeseriesPoint, params: SimParams, result: SimResult, cycleHours: number): void {
    this.applyCycleLighting(point, result.site, cycleHours);
    if (this.diorama !== null) {
      this.diorama.applyTime(point, params, result, cycleHours, this.reducedMotion);
    }
    this.needsRender = true;
    this.wake();
  }

  /* ---------------- site handling ---------------- */

  private buildSite(site: SiteMode): void {
    this.setHoveredAsset(null);
    this.removeOutline("selection");
    if (this.diorama !== null) {
      this.scene.remove(this.diorama.group);
      this.diorama.dispose();
      this.diorama = null;
    }
    this.setEnvironment(site);
    this.loadedAssetCount = 0;
    this.expectedAssetCount = site === "equatorial" ? 8 : 7;
    this.assetLoadStatus.hidden = false;
    this.assetLoadStatus.textContent = `LOADING ${site.toUpperCase()} ASSETS · 0/${this.expectedAssetCount}`;
    if (site === "equatorial") {
      const equatorial = new EquatorialDiorama(this.quality, () => {
        if (this.diorama !== equatorial || this.disposed) {
          return;
        }
        if (this.lastResult !== null && this.lastParams !== null) {
          equatorial.apply(this.lastResult, this.lastParams, this.tweens, true);
        }
        this.refreshSelectionOutline();
        this.markAssetReady(site);
        this.wake();
      });
      this.diorama = equatorial;
    } else {
      const polar = new PolarDiorama(this.quality, () => {
        if (this.diorama !== polar || this.disposed) {
          return;
        }
        if (this.lastResult !== null && this.lastParams !== null) {
          polar.apply(this.lastResult, this.lastParams, this.tweens, true);
        }
        this.refreshSelectionOutline();
        this.markAssetReady(site);
        this.wake();
      });
      this.diorama = polar;
    }
    this.scene.add(this.diorama.group);
    this.rebuildLearningOverlay();

    // lighting per site: equatorial high sun, polar raking 2° light (§3.1)
    if (site === "equatorial") {
      const el = (55 * Math.PI) / 180;
      this.sun.position.set(Math.cos(el) * 160, Math.sin(el) * 160, 60);
      this.sun.intensity = 3;
      this.hemi.intensity = 0.46;
    } else {
      // raking 2° light from behind the camera so the far rim wall and
      // tower crowns catch it while the crater floor stays in shadow
      const el = (2 * Math.PI) / 180;
      this.sun.position.set(50 * Math.cos(el), Math.sin(el) * 240, 230 * Math.cos(el));
      this.sun.intensity = 3.4;
      this.hemi.intensity = 0.14;
    }
    if (this.graphicsPrefs.brightLighting) {
      this.hemi.intensity = Math.max(this.hemi.intensity, site === "equatorial" ? 0.72 : 0.5);
    }
    this.sun.target.position.set(0, 0, 0);

    const pose = CAMERA_POSES[site].overview;
    this.camera.position.set(...pose.position);
    this.controls.target.set(...pose.target);
    this.controls.update();
    this.needsRender = true;
  }

  private markAssetReady(site: SiteMode): void {
    this.loadedAssetCount = Math.min(this.expectedAssetCount, this.loadedAssetCount + 1);
    this.assetLoadStatus.textContent =
      `LOADING ${site.toUpperCase()} ASSETS · ${this.loadedAssetCount}/${this.expectedAssetCount}`;
    if (this.loadedAssetCount >= this.expectedAssetCount) {
      this.assetLoadStatus.textContent = `${site.toUpperCase()} ASSETS READY`;
      this.assetLoadStatus.hidden = true;
    }
  }

  private applyCycleLighting(point: TimeseriesPoint, site: SiteMode, cycleHours: number): void {
    const lightPoint = this.graphicsPrefs.daylightLock
      ? {
          ...point,
          daylight: true,
          illumination: 1,
          receiverVisibility: 1,
          tHours: cycleHours * (site === "equatorial" ? 0.24 : 0.08)
        }
      : point;
    const phase = ((lightPoint.tHours / Math.max(1, cycleHours)) % 1 + 1) % 1;
    const az = phase * Math.PI * 2 - Math.PI * 0.25;
    if (site === "equatorial") {
      const dayU = Math.min(1, Math.max(0, phase * 2));
      const elev = lightPoint.daylight ? (23 + 32 * Math.sin(dayU * Math.PI)) * (Math.PI / 180) : -8 * (Math.PI / 180);
      const r = 170;
      this.sun.position.set(Math.cos(az) * Math.cos(elev) * r, Math.sin(elev) * r, Math.sin(az) * Math.cos(elev) * r);
      this.sun.intensity = lightPoint.daylight ? 2.8 + 0.8 * Math.sin(dayU * Math.PI) : 0.18;
      this.hemi.intensity = lightPoint.daylight ? 0.48 : 0.16;
    } else {
      const illumination = Math.min(1, Math.max(0, lightPoint.illumination));
      const elev = (-1 + 3 * illumination) * (Math.PI / 180);
      const r = 240;
      this.sun.position.set(Math.cos(az) * Math.cos(elev) * r, Math.sin(elev) * r, Math.sin(az) * Math.cos(elev) * r);
      this.sun.intensity = 0.45 + 2.85 * illumination;
      this.hemi.intensity = 0.07 + 0.07 * illumination;
    }
    this.sun.target.position.set(0, 0, 0);

    // friendly-illumination floor: keep the whole scene legible even at night
    // or under low sun, without erasing the day/night direction & shadows
    if (this.graphicsPrefs.brightLighting) {
      const hemiFloor = site === "equatorial" ? 1.02 : 0.56;
      this.hemi.intensity = Math.max(this.hemi.intensity, lightPoint.daylight ? hemiFloor : hemiFloor * 0.82);
    }
    this.lastLight = { point, site, cycleHours };
  }

  /** exposure + ambient fill for the current lighting mode; re-applies floors. */
  private applyLightingMode(): void {
    const bright = this.graphicsPrefs.brightLighting;
    this.renderer.toneMappingExposure = bright ? 1.62 : 1.1;
    this.fill.intensity = bright ? 0.82 : 0.02;
    if (this.lastLight !== null) {
      this.applyCycleLighting(this.lastLight.point, this.lastLight.site, this.lastLight.cycleHours);
    }
    this.needsRender = true;
    this.wake();
  }

  /** §3.5 — fade to black 250ms, swap diorama, fade in 350ms with a dolly */
  private siteTransition(site: SiteMode): void {
    if (this.reducedMotion) {
      this.buildSite(site);
      if (this.lastResult !== null && this.lastParams !== null) {
        this.applyToDiorama(this.lastResult, this.lastParams, true);
      }
      return;
    }
    this.transitioning = true;
    this.tweens.add(
      "veil",
      0,
      1,
      250,
      (v) => {
        this.veil.style.opacity = String(v);
      },
      () => {
        this.buildSite(site);
        if (this.lastResult !== null && this.lastParams !== null) {
          this.applyToDiorama(this.lastResult, this.lastParams, true);
        }
        // dolly in from slightly out while fading back
        const pose = CAMERA_POSES[site].overview;
        const dir = new THREE.Vector3(...pose.position)
          .sub(new THREE.Vector3(...pose.target))
          .normalize();
        this.camera.position.copy(new THREE.Vector3(...pose.position)).addScaledVector(dir, 16);
        this.flyToPose(pose, 700);
        this.tweens.add(
          "veil",
          1,
          0,
          350,
          (v) => {
            this.veil.style.opacity = String(v);
          },
          () => {
            this.transitioning = false;
          }
        );
      }
    );
    this.wake();
  }

  private applyToDiorama(result: SimResult, params: SimParams, instant: boolean): void {
    if (this.diorama !== null) {
      this.diorama.apply(result, params, this.tweens, this.reducedMotion || instant);
      this.needsRender = true;
    }
  }

  private pulseNewWarnings(result: SimResult): void {
    const current = new Set<string>();
    for (const w of result.warnings) {
      if (w.id === "param-clamped") {
        continue;
      }
      current.add(w.id);
      if (!this.warnedIds.has(w.id) && this.diorama !== null && this.lastResult !== null) {
        const assetKey = MODULE_ASSET[this.lastResult.site][w.module];
        const asset = assetKey !== undefined ? this.diorama.assets[assetKey] : undefined;
        if (asset !== undefined) {
          this.spawnPulse(asset, severityColor(w.severity));
        }
      }
    }
    this.warnedIds = current;
  }

  /* ---------------- camera ---------------- */

  private flyToPose(pose: CameraPose, ms: number): void {
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const toPos = new THREE.Vector3(...pose.position);
    const toTarget = new THREE.Vector3(...pose.target);
    if (ms <= 0) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toTarget);
      this.controls.update();
      this.needsRender = true;
      return;
    }
    this.tweens.add("camera", 0, 1, ms, (v) => {
      this.camera.position.lerpVectors(fromPos, toPos, v);
      this.controls.target.lerpVectors(fromTarget, toTarget, v);
      this.controls.update();
    });
    this.wake();
  }

  /* ---------------- learning overlay ---------------- */

  private rebuildLearningOverlay(): void {
    for (const label of this.learningLabels.values()) {
      label.remove();
    }
    this.learningLabels.clear();
    this.processSvg.replaceChildren();
    this.processPaths = [];

    if (this.diorama === null || this.lastResult === null || this.lastParams === null) {
      return;
    }

    const site = this.lastResult.site;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.id = "selene-process-arrow";
    marker.setAttribute("viewBox", "0 0 8 8");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "4");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrow.setAttribute("d", "M 0 0 L 8 4 L 0 8 z");
    arrow.setAttribute("class", "process-flow-arrow");
    marker.appendChild(arrow);
    defs.appendChild(marker);
    this.processSvg.appendChild(defs);
    for (const [key, label] of Object.entries(INTERACTIVE_ASSET_LABELS[site])) {
      if (this.diorama.assets[key] === undefined) {
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "learning-asset-label";
      button.textContent = this.mobile ? MOBILE_ASSET_LABELS[site][key] ?? label : label;
      button.setAttribute("aria-label", `Inspect ${label}`);
      button.addEventListener("click", () => this.selectPickedAsset(key));
      this.learningOverlay.appendChild(button);
      this.learningLabels.set(key, button);
    }

    for (const edge of processEdges(this.lastResult, this.lastParams)) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add("process-flow-line");
      line.classList.add(`process-flow-${edge.kind}`);
      line.setAttribute("marker-end", "url(#selene-process-arrow)");
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.classList.add("process-flow-label");
      text.textContent = this.mobile ? edge.shortLabel : edge.label;
      text.setAttribute("text-anchor", "middle");
      this.processSvg.append(line, text);
      this.processPaths.push({ ...edge, line, text });
    }

    this.learningOverlay.hidden = !this.learningMode && this.selectedAssetKey === null;
    this.processSvg.style.display =
      this.selectedAssetKey !== null || (this.learningMode && this.showProcessFlow) ? "" : "none";
  }

  private refreshProcessOverlayData(): void {
    if (this.lastResult === null || this.lastParams === null || this.diorama === null) {
      return;
    }
    const next = processEdges(this.lastResult, this.lastParams);
    const sameTopology =
      next.length === this.processPaths.length &&
      next.every((edge, index) => {
        const current = this.processPaths[index];
        return current?.from === edge.from && current.to === edge.to && current.kind === edge.kind;
      });
    if (!sameTopology) {
      this.rebuildLearningOverlay();
      return;
    }
    next.forEach((edge, index) => {
      const current = this.processPaths[index];
      if (current === undefined) {
        return;
      }
      current.label = edge.label;
      current.shortLabel = edge.shortLabel;
      current.text.textContent = this.mobile ? edge.shortLabel : edge.label;
    });
    this.refreshSelectionOutline();
  }

  private assetScreenPoint(assetKey: string, height: number): { x: number; y: number } | null {
    const asset = this.diorama?.assets[assetKey];
    if (asset === undefined) {
      return null;
    }
    asset.getWorldPosition(this.overlayPoint);
    this.overlayPoint.y += height;
    this.overlayPoint.project(this.camera);
    if (this.overlayPoint.z < -1 || this.overlayPoint.z > 1) {
      return null;
    }
    const width = Math.max(1, this.container.clientWidth);
    const heightPx = Math.max(1, this.container.clientHeight);
    const x = (this.overlayPoint.x * 0.5 + 0.5) * width;
    const y = (-this.overlayPoint.y * 0.5 + 0.5) * heightPx;
    if (x < -80 || x > width + 80 || y < -40 || y > heightPx + 40) {
      return null;
    }
    return { x, y };
  }

  private updateLearningOverlay(): void {
    if (
      (!this.learningMode && this.selectedAssetKey === null) ||
      this.lastResult === null ||
      this.diorama === null
    ) {
      return;
    }
    const site = this.lastResult.site;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.processSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    for (const [key, label] of this.learningLabels) {
      const point = this.assetScreenPoint(key, ASSET_LABEL_HEIGHT[site][key] ?? 5);
      const visible =
        this.learningMode && point !== null && (this.selectedAssetKey === null || this.selectedAssetKey === key);
      label.hidden = !visible;
      if (visible && point !== null) {
        const x = Math.min(width - 96, Math.max(96, point.x));
        const y = Math.max(42, point.y);
        label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    }

    for (const path of this.processPaths) {
      const from = this.assetScreenPoint(path.from, 1.4);
      const to = this.assetScreenPoint(path.to, 1.4);
      const selectedPath =
        this.selectedAssetKey !== null &&
        (path.from === this.selectedAssetKey || path.to === this.selectedAssetKey);
      const visible =
        (selectedPath || (this.learningMode && this.showProcessFlow && this.selectedAssetKey === null)) &&
        from !== null &&
        to !== null;
      path.line.style.display = visible ? "" : "none";
      path.text.style.display = visible ? "" : "none";
      if (!visible || from === null || to === null) {
        continue;
      }
      path.line.setAttribute("x1", String(from.x));
      path.line.setAttribute("y1", String(from.y));
      path.line.setAttribute("x2", String(to.x));
      path.line.setAttribute("y2", String(to.y));
      path.text.setAttribute("x", String((from.x + to.x) / 2));
      path.text.setAttribute("y", String((from.y + to.y) / 2 - 6));
    }
  }

  /* ---------------- warning pulse outline ---------------- */

  private spawnPulse(asset: THREE.Object3D, color: number): void {
    const box = new THREE.Box3().setFromObject(asset);
    if (box.isEmpty()) {
      return;
    }
    const size = box.getSize(new THREE.Vector3()).addScalar(0.6);
    const center = box.getCenter(new THREE.Vector3());
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const lines = new THREE.LineSegments(geo, mat);
    lines.position.copy(center);
    this.scene.add(lines);
    this.pulses.push({ lines, start: this.elapsed });
    this.wake();
  }

  private updatePulses(): boolean {
    if (this.pulses.length === 0) {
      return false;
    }
    const PULSE_S = 1.8; // 3 pulses
    this.pulses = this.pulses.filter((p) => {
      const u = (this.elapsed - p.start) / PULSE_S;
      if (u >= 1) {
        this.scene.remove(p.lines);
        p.lines.geometry.dispose();
        (p.lines.material as THREE.Material).dispose();
        return false;
      }
      (p.lines.material as THREE.LineBasicMaterial).opacity =
        Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u * 0.4);
      return true;
    });
    return this.pulses.length > 0;
  }

  /* ---------------- loop (render-on-demand, §3.5) ---------------- */

  private wake(): void {
    this.needsRender = true;
    if (!this.running && !this.disposed) {
      this.running = true;
      this.clock.start();
      this.renderer.setAnimationLoop(this.frame);
    }
  }

  private stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private frame = (): void => {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.elapsed += dt;
    const now = performance.now();

    let active = false;
    if (this.tweens.update(now)) {
      active = true;
    }
    if (this.diorama !== null && this.diorama.tick(dt, this.elapsed, this.reducedMotion)) {
      active = true;
    }
    if (this.updatePulses()) {
      active = true;
    }

    // idle slow orbit after 30s of no input (disabled by reduced motion)
    if (!this.reducedMotion && now - this.lastInputAt > IDLE_ORBIT_DELAY_MS && !this.transitioning) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), IDLE_ORBIT_RATE * dt);
      this.camera.position.copy(this.controls.target).add(offset);
      active = true;
    }

    this.controls.update();
    this.updateLearningOverlay();

    const rendered = active || this.needsRender;
    if (rendered) {
      this.post.render(dt);
      this.needsRender = false;
      this.updateFrameStats(dt, now);
    }

    // with reduced motion and nothing in flight, stop the rAF loop entirely
    if (!active && !this.needsRender && this.reducedMotion) {
      this.stop();
    }
  };

  /* ---------------- events ---------------- */

  private onUserInput = (): void => {
    this.lastInputAt = performance.now();
    this.wake();
  };

  private onPointerMove = (event: PointerEvent): void => {
    const key = this.pickAsset(event);
    this.setHoveredAsset(key, event);
  };

  private onPointerLeave = (): void => {
    this.setHoveredAsset(null);
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerDown.set(event.clientX, event.clientY);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 6) {
      return;
    }
    this.selectPickedAsset(this.pickAsset(event));
  };

  private onContextMenu = (event: MouseEvent): void => {
    const key = this.pickAsset(event);
    if (key === null) {
      return;
    }
    event.preventDefault();
    this.selectPickedAsset(key);
  };

  private pickAsset(event: MouseEvent | PointerEvent): string | null {
    if (this.diorama === null || this.lastResult === null) {
      return null;
    }
    const labels = INTERACTIVE_ASSET_LABELS[this.lastResult.site];
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const roots = Object.entries(this.diorama.assets)
      .filter(([key, asset]) => key in labels && asset.children.length > 0)
      .map(([, asset]) => asset);
    const hit = this.raycaster.intersectObjects(roots, true)[0]?.object ?? null;
    let current: THREE.Object3D | null = hit;
    while (current !== null) {
      const assetKey = current.userData.assetKey;
      if (typeof assetKey === "string" && assetKey in labels) {
        return assetKey;
      }
      current = current.parent;
    }
    return null;
  }

  private selectPickedAsset(assetKey: string | null): void {
    this.setHoveredAsset(null);
    this.callbacks.onSelectAsset?.(assetKey);
    this.setSelectedAsset(assetKey);
    if (assetKey !== null) {
      this.flyTo(assetKey);
    }
  }

  private setHoveredAsset(assetKey: string | null, event?: PointerEvent): void {
    if (this.hoveredAssetKey === assetKey) {
      if (assetKey !== null && event !== undefined) {
        this.positionAssetTooltip(event);
      }
      return;
    }
    this.hoveredAssetKey = assetKey;
    this.removeOutline("hover");
    this.renderer.domElement.style.cursor = assetKey === null ? "grab" : "pointer";
    this.assetTooltip.hidden = assetKey === null;
    if (assetKey !== null && this.diorama !== null) {
      const site = this.lastResult?.site ?? "equatorial";
      this.assetTooltip.textContent = `${INTERACTIVE_ASSET_LABELS[site][assetKey] ?? assetKey.toUpperCase()} · CLICK TO INSPECT`;
      const asset = this.diorama.assets[assetKey];
      if (asset !== undefined) {
        this.hoverOutline = this.makeOutline(asset, 0xff7e1f, 0.72);
        this.scene.add(this.hoverOutline);
      }
      if (event !== undefined) {
        this.positionAssetTooltip(event);
      }
    }
    this.wake();
  }

  private positionAssetTooltip(event: PointerEvent): void {
    const rect = this.container.getBoundingClientRect();
    this.assetTooltip.style.transform = `translate(${event.clientX - rect.left + 14}px, ${event.clientY - rect.top + 14}px)`;
  }

  private refreshSelectionOutline(): void {
    this.removeOutline("selection");
    this.removeConnectionOutlines();
    if (this.selectedAssetKey === null || this.diorama === null) {
      this.learningOverlay.hidden = !this.learningMode;
      return;
    }
    const asset = this.diorama.assets[this.selectedAssetKey];
    if (asset !== undefined && asset.children.length > 0) {
      this.selectionOutline = this.makeOutline(asset, 0x74d8ff, 0.86);
      this.scene.add(this.selectionOutline);
    }
    if (this.lastResult !== null && this.lastParams !== null) {
      for (const key of connectedAssets(this.lastResult, this.lastParams, this.selectedAssetKey)) {
        const connected = this.diorama.assets[key];
        if (connected === undefined || connected.children.length === 0) {
          continue;
        }
        const outline = this.makeOutline(connected, 0xff7e1f, 0.42);
        this.connectionOutlines.push(outline);
        this.scene.add(outline);
      }
    }
    this.learningOverlay.hidden = false;
    this.processSvg.style.display = "";
  }

  private removeConnectionOutlines(): void {
    for (const outline of this.connectionOutlines) {
      this.scene.remove(outline);
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
    }
    this.connectionOutlines = [];
  }

  private makeOutline(asset: THREE.Object3D, color: number, opacity: number): THREE.Mesh {
    const box = new THREE.Box3().setFromObject(asset);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.57;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.12, 72),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })
    );
    ring.position.set(center.x, box.min.y + 0.055, center.z);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 20;
    return ring;
  }

  private removeOutline(kind: "hover" | "selection"): void {
    const outline = kind === "hover" ? this.hoverOutline : this.selectionOutline;
    if (outline === null) {
      return;
    }
    this.scene.remove(outline);
    outline.geometry.dispose();
    (outline.material as THREE.Material).dispose();
    if (kind === "hover") {
      this.hoverOutline = null;
    } else {
      this.selectionOutline = null;
    }
  }

  private onMotionPref = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
    this.wake();
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.stop();
  };

  private onContextRestored = (): void => {
    // rebuild the whole GL state with the current sim state (§8.9)
    const result = this.lastResult;
    const params = this.lastParams;
    this.controls.dispose();
    if (this.diorama !== null) {
      this.diorama.dispose();
      this.diorama = null;
    }
    this.disposeEnvironment();
    disposeObject(this.scene);
    this.post.dispose();
    this.renderer.domElement.remove();
    this.renderer.dispose();
    disposeProceduralTextures();
    this.tweens.clear();
    this.initGL();
    this.resize();
    if (result !== null && params !== null) {
      this.lastResult = null;
      this.apply(result, params);
    }
    this.wake();
  };

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = this.pixelRatio();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.post.setSize(w, h, dpr);
    this.wake();
  }

  private pixelRatio(): number {
    return Math.min(window.devicePixelRatio, this.quality.dprCap);
  }

  private onGraphicsPrefs = (e: Event): void => {
    const event = e as CustomEvent<GraphicsPrefs>;
    this.graphicsPrefs = event.detail;
    this.applyTier(effectiveTier(this.graphicsPrefs.tier, this.mobile), "settings");
    this.applyPostEffects();
    this.applyLightingMode();
    this.updateHudVisibility();
    this.wake();
  };

  private onPhotoRequest = (): void => {
    this.downloadPhoto();
  };

  private applyTier(tier: GraphicsTier, reason: string): void {
    if (tier === this.activeTier) {
      this.applyPostEffects();
      return;
    }
    const cameraPosition = this.camera.position.clone();
    const cameraTarget = this.controls.target.clone();
    const result = this.lastResult;
    const params = this.lastParams;
    this.activeTier = tier;
    this.quality = qualityProfile(this.mobile, tier);
    this.sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    this.scene.remove(this.stars);
    disposeObject(this.stars);
    this.stars = makeStarfield(this.quality.starCount);
    this.scene.add(this.stars);
    if (result !== null && params !== null) {
      this.buildSite(result.site);
      this.applyToDiorama(result, params, true);
      this.camera.position.copy(cameraPosition);
      this.controls.target.copy(cameraTarget);
      this.controls.update();
    }
    this.applyPostEffects();
    this.resize();
    this.needsRender = true;
    if (import.meta.env.DEV) {
      console.info(`[selene] graphics tier ${tier} (${reason})`);
    }
  }

  private applyPostEffects(): void {
    this.post.setEffects({
      ao: this.quality.ao,
      bloom: this.graphicsPrefs.bloom && this.quality.bloom,
      bloomStrength: this.quality.bloomStrength
    });
  }

  private updateFrameStats(dt: number, now: number): void {
    const ms = dt * 1000;
    this.frameEwmaMs = this.frameEwmaMs === 0 ? ms : this.frameEwmaMs * 0.92 + ms * 0.08;
    if (this.graphicsPrefs.tier === "auto") {
      const budget = this.mobile ? 33 : 16.7;
      if (this.frameEwmaMs > budget * 1.22) {
        this.slowFrames += 1;
        this.fastFrames = 0;
      } else if (this.frameEwmaMs < budget * 0.72) {
        this.fastFrames += 1;
        this.slowFrames = 0;
      } else {
        this.slowFrames = 0;
        this.fastFrames = 0;
      }
      if (this.slowFrames > 90) {
        this.slowFrames = 0;
        this.downshiftTier();
      } else if (this.fastFrames > 240) {
        this.fastFrames = 0;
        this.upshiftTier();
      }
    }
    this.updateHud(now);
  }

  private downshiftTier(): void {
    const next: Record<GraphicsTier, GraphicsTier> = {
      ultra: "high",
      high: "medium",
      medium: "low",
      low: "low"
    };
    this.applyTier(next[this.activeTier], "auto downshift");
  }

  private upshiftTier(): void {
    const next: Record<GraphicsTier, GraphicsTier> = {
      low: "medium",
      medium: "high",
      high: this.mobile ? "high" : "ultra",
      ultra: "ultra"
    };
    this.applyTier(next[this.activeTier], "auto upshift");
  }

  private updateHudVisibility(): void {
    this.hud.hidden = !(this.graphicsPrefs.hud || this.debugHud);
  }

  private updateHud(now: number): void {
    if (this.hud.hidden || now - this.hudLastAt < 250) {
      return;
    }
    this.hudLastAt = now;
    const info = this.renderer.info.render;
    const fps = this.frameEwmaMs > 0 ? 1000 / this.frameEwmaMs : 0;
    this.hud.textContent =
      `FPS ${fps.toFixed(0)} | ${this.frameEwmaMs.toFixed(1)} MS | ${this.activeTier.toUpperCase()} | ` +
      `CALLS ${info.calls} | TRIS ${Math.round(info.triangles / 1000)}K`;
  }

  private downloadPhoto(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const normalDpr = this.pixelRatio();
    const photoDpr = Math.min(3, Math.max(normalDpr, normalDpr * (this.activeTier === "ultra" ? 1.5 : 1.25)));
    this.renderer.setPixelRatio(photoDpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, photoDpr);
    this.post.render(0);
    this.renderer.domElement.toBlob((blob) => {
      if (blob === null) {
        this.resize();
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const site = this.lastResult?.site ?? "site";
      a.href = url;
      a.download = `selene-isru-${site}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      this.resize();
    }, "image/png");
  }

  private setEnvironment(site: SiteMode): void {
    this.disposeEnvironment();
    this.environment = makeProceduralEnvironment(this.renderer, site);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = site === "equatorial" ? 0.38 : 0.2;
  }

  private disposeEnvironment(): void {
    if (this.environment !== null) {
      this.scene.environment = null;
      this.environment.dispose();
      this.environment = null;
    }
  }
}
