import type { SimParams, SimResult } from "@selene-isru/engine";

export type SiteMode = SimParams["site"];

/**
 * §3.4 — the SimResult → scene-parameter contract, centralized. Every mapping
 * clamps and log/sqrt-scales so extreme slider values stay composed. The
 * diorama classes consume these values; no magic numbers live in scene code.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** normalized log position of v within [lo, hi] */
export function logNorm(v: number, lo: number, hi: number): number {
  if (!(v > 0)) {
    return 0;
  }
  return clamp01((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)));
}

/** excavator loop period [s]: lerp 60s→8s over [1e3, 1e5] kg/day, log scale */
export function excavatorLoopPeriodS(regolithKgPerDay: number): number {
  return 60 - 52 * logNorm(regolithKgPerDay, 1e3, 1e5);
}

/** reactor emissive intensity / power-line strength: log-normalized [1e4, 1e7] W → [0.2, 2.0] */
export function gridGlowIntensity(gridPowerW: number): number {
  return 0.2 + 1.8 * logNorm(gridPowerW, 1e4, 1e7);
}

/** power line opacity from the same normalization, kept subtle */
export function powerLineOpacity(gridPowerW: number): number {
  return 0.15 + 0.65 * logNorm(gridPowerW, 1e4, 1e7);
}

export const PANEL_M2_PER_INSTANCE = 20;
export const PANEL_INSTANCE_CAP = 400;

/** solar panel field: 1 instance ≈ 20 m², cap 400 */
export function solarPanelCount(solarArrayM2: number, cap = PANEL_INSTANCE_CAP): number {
  return clamp(Math.round(solarArrayM2 / PANEL_M2_PER_INSTANCE), 0, cap);
}

const RADIATOR_REF_M2 = 150;

/** radiator wing x-scale: sqrt-area, clamp ×0.4–×3 */
export function radiatorWingScale(radiatorM2: number): number {
  return clamp(Math.sqrt(Math.max(0, radiatorM2) / RADIATOR_REF_M2), 0.4, 3);
}

/** boil-off wisp emission rate [particles/s-ish opacity drive]: linear, capped */
export function boiloffWispRate(boiloffKgPerDay: number): number {
  return clamp01(boiloffKgPerDay / 50);
}

/** pad tile completion fraction: progress of one pad over a representative year */
export function padTileFraction(padsPerYear: number): number {
  return clamp01(padsPerYear);
}

/** habitat shell thickness [m], 0.5 m quantized */
export function habitatShellSteps(shieldDesignM: number): number {
  return clamp(Math.round(shieldDesignM / 0.5), 1, 42);
}

/** beamed power: visible >0; world radius ∝ log power */
export function beamRadius(beamedFloorPowerW: number | null): number {
  if (beamedFloorPowerW === null || beamedFloorPowerW <= 0) {
    return 0;
  }
  return 0.4 + 2.2 * logNorm(beamedFloorPowerW, 1e2, 1e6);
}

export const BRICK_TONNES_EACH = 18;
export const BRICK_CAP_DESKTOP = 360;

/** casting-yard brick count for a representative year of slag output */
export function brickCount(slagPerYearT: number, cap = BRICK_CAP_DESKTOP): number {
  return clamp(Math.round(slagPerYearT / BRICK_TONNES_EACH), 0, cap);
}

export const TANK_VOLUME_M3 = 120;
export const TANK_CAP = 8;

/** cryo farm: N spheres = ceil(reserve volume / fixed tank size), capped */
export function tankCount(params: SimParams): number {
  const reserveVolumeM3 = (params.reserveDays * params.targetKgPerDay) / params.rhoCryo;
  return clamp(Math.ceil(reserveVolumeM3 / TANK_VOLUME_M3), 1, TANK_CAP);
}

/** interior fill fraction — boil-off visibly drains the reserve */
export function tankFillFraction(result: SimResult): number {
  const target = result.production.targetKgPerDay;
  if (target <= 0) {
    return 0;
  }
  return clamp01(1 - result.cryo.boiloffKgPerDay / target);
}

/** sublimation tent interior glow ∝ secSub throughput */
export function tentGlowIntensity(secSub_JPerKg: number | null): number {
  if (secSub_JPerKg === null) {
    return 0.2;
  }
  return 0.25 + 1.4 * logNorm(secSub_JPerKg, 1e5, 5e7);
}

/* ---------------- quality (§2.1 mobile performance) ---------------- */

export type GraphicsTier = "low" | "medium" | "high" | "ultra";

export interface QualityProfile {
  tier: GraphicsTier;
  dprCap: number;
  shadowMapSize: number;
  starCount: number;
  brickCap: number;
  panelCap: number;
  /** seeded boulder/rock scatter budget across the active site */
  rockCap: number;
  /** procedural hardware detail budget across the active site */
  greebleCap: number;
  /** particle/effect detail budget for dust, beam motes, and shimmer */
  effectCap: number;
  /** coarse detail scalar for helper geometry and terrain overlays */
  detailLevel: 0 | 1 | 2 | 3;
  /** terrain plane subdivisions per side */
  terrainSegments: number;
  /** segment multiplier for curved hero primitives */
  meshDetail: number;
  /** screen-space ambient occlusion pass */
  ao: boolean;
  /** bloom pass enabled at this tier */
  bloom: boolean;
  bloomStrength: number;
}

export function qualityProfile(mobile: boolean, tier: GraphicsTier = mobile ? "medium" : "high"): QualityProfile {
  const profiles: Record<GraphicsTier, QualityProfile> = {
    low: {
      tier: "low",
      dprCap: mobile ? 1.35 : 1.5,
      shadowMapSize: 1024,
      starCount: 1200,
      brickCap: 120,
      panelCap: 160,
      rockCap: 84,
      greebleCap: 48,
      effectCap: 48,
      detailLevel: 0,
      terrainSegments: 120,
      meshDetail: 1,
      ao: false,
      bloom: true,
      bloomStrength: 0.28
    },
    medium: {
      tier: "medium",
      dprCap: mobile ? 1.75 : 1.75,
      shadowMapSize: mobile ? 1536 : 2048,
      starCount: mobile ? 1800 : 2400,
      brickCap: mobile ? 180 : 260,
      panelCap: mobile ? 200 : 300,
      rockCap: mobile ? 110 : 148,
      greebleCap: mobile ? 68 : 92,
      effectCap: mobile ? 72 : 96,
      detailLevel: 1,
      terrainSegments: mobile ? 160 : 200,
      meshDetail: 1,
      ao: !mobile,
      bloom: true,
      bloomStrength: mobile ? 0.35 : 0.46
    },
    high: {
      tier: "high",
      dprCap: mobile ? 2 : 2,
      shadowMapSize: mobile ? 2048 : 4096,
      starCount: mobile ? 2200 : 3200,
      brickCap: mobile ? 220 : BRICK_CAP_DESKTOP,
      panelCap: mobile ? 240 : PANEL_INSTANCE_CAP,
      rockCap: mobile ? 140 : 210,
      greebleCap: mobile ? 92 : 148,
      effectCap: mobile ? 96 : 140,
      detailLevel: mobile ? 1 : 2,
      terrainSegments: mobile ? 180 : 256,
      meshDetail: mobile ? 1 : 2,
      ao: !mobile,
      bloom: true,
      bloomStrength: mobile ? 0.4 : 0.58
    },
    ultra: {
      tier: "ultra",
      dprCap: mobile ? 2.25 : 2.5,
      shadowMapSize: mobile ? 2048 : 4096,
      starCount: mobile ? 2600 : 4200,
      brickCap: mobile ? 260 : BRICK_CAP_DESKTOP,
      panelCap: mobile ? 280 : PANEL_INSTANCE_CAP,
      rockCap: mobile ? 164 : 280,
      greebleCap: mobile ? 112 : 210,
      effectCap: mobile ? 120 : 190,
      detailLevel: mobile ? 2 : 3,
      terrainSegments: mobile ? 200 : 300,
      meshDetail: 2,
      ao: !mobile,
      bloom: true,
      bloomStrength: mobile ? 0.46 : 0.64
    }
  };
  return profiles[tier];
}

/* ---------------- camera poses (§3.5 bookmarks) ---------------- */

export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

export const CAMERA_POSES: Record<SiteMode, Record<string, CameraPose>> = {
  equatorial: {
    overview: { position: [42, 30, 58], target: [0, 2, 0] },
    excavator: { position: [-60, 13, 20], target: [-45, 0, 0] },
    hauler: { position: [-44, 9, 18], target: [-32, 1, 2] },
    reactor: { position: [-31, 11, 17], target: [-20, 3, 0] },
    castingYard: { position: [3, 10, 28], target: [-5, 1, 14] },
    pad: { position: [42, 13, -5], target: [30, 1, -18] },
    tanks: { position: [14, 9, -3], target: [5, 2, -16] },
    station: { position: [-42, 13, -9], target: [-30, 4, -22] },
    habitat: { position: [27, 10, 29], target: [18, 2, 16] }
  },
  polar: {
    overview: { position: [34, 34, 78], target: [0, -4, -12] },
    towers: { position: [22, 26, -24], target: [0, 16, -56] },
    beam: { position: [28, 8, -16], target: [0, -6, -14] },
    receiver: { position: [12, 0, 10], target: [0, -9, -6] },
    tents: { position: [13, -1, 9], target: [4, -9, -2] },
    excavator: { position: [-4, -2, 16], target: [-9, -9, 4] },
    tanks: { position: [24, 1, 12], target: [15, -8, 3] },
    station: { position: [26, 28, -34], target: [10, 17, -54] },
    habitat: { position: [-24, 1, 12], target: [-15, -8, 3] }
  }
};

/** rail group id → camera pose key */
export const GROUP_CAMERA: Record<SiteMode, Record<string, string>> = {
  equatorial: {
    mission: "overview",
    excavation: "excavator",
    "extraction-mre": "reactor",
    cryo: "tanks",
    power: "station",
    logistics: "pad",
    construction: "castingYard"
  },
  polar: {
    mission: "overview",
    excavation: "excavator",
    "extraction-sub": "tents",
    sabatier: "receiver",
    cryo: "tanks",
    power: "towers",
    logistics: "overview"
  }
};

/** engine module name → diorama asset key (warning camera flights, §6) */
export const MODULE_ASSET: Record<SiteMode, Record<string, string>> = {
  equatorial: {
    excavation: "excavator",
    electrolysis: "reactor",
    cryo: "tanks",
    power: "station",
    construction: "castingYard",
    logistics: "pad"
  },
  polar: {
    excavation: "excavator",
    thermal: "tents",
    sabatier: "receiver",
    cryo: "tanks",
    power: "towers",
    logistics: "overview"
  }
};

/* ---------------- palette mirror (scene-side, hex of tokens.css) ------------- */

export const SCENE_COLORS = {
  space: 0x0b0e13,
  regolith: 0x8e8a84,
  regolithDark: 0x4d4a45,
  melt: 0xff7a1a,
  meltDeep: 0xc2410c,
  cryo: 0x6fd3f2,
  solar: 0xf5c84c,
  fission: 0xb48cf2,
  ok: 0x4ade80,
  caution: 0xf59e0b,
  alarm: 0xf0432e,
  earthshine: 0x3b5b8f,
  ground: 0x1a1611,
  metal: 0x3a3f49,
  metalDark: 0x23272f
} as const;

export function severityColor(severity: string): number {
  if (severity === "alarm") {
    return SCENE_COLORS.alarm;
  }
  if (severity === "caution") {
    return SCENE_COLORS.caution;
  }
  return SCENE_COLORS.cryo;
}
