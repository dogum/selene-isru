import { DEFAULTS, PARAM_META } from "@selene-isru/engine";
import type { SimParams, SimResult } from "@selene-isru/engine";
import { evidenceForParam, type ParamEvidence } from "./evidence";

type SiteMode = SimParams["site"];

/**
 * Control-rail curation (§2): groups are auto-generated from PARAM_META.group;
 * this manifest only fixes order, labels, per-site visibility, gating, and the
 * live readout shown in each group header. Params are never hardcoded here.
 */
export interface GroupDef {
  id: string;
  label: string;
  engineGroup: string;
  /** restrict to one site; omit = both */
  site?: SiteMode;
  /** boolean param rendered as a toggle in the header; rows hidden when off */
  gatedBy?: "enableSabatier";
  /** live module readout for the header, e.g. EXCAVATION — 2.4 kW */
  readout: (result: SimResult) => { value: number; unit: string };
}

export const GROUPS: GroupDef[] = [
  {
    id: "mission",
    label: "Mission",
    engineGroup: "global",
    readout: (r) => ({ value: r.logistics.plantMassThroughputDays, unit: "days" })
  },
  {
    id: "excavation",
    label: "Excavation",
    engineGroup: "excavation",
    readout: (r) => ({ value: r.excavation.mechPowerW, unit: "W" })
  },
  {
    id: "extraction-mre",
    label: "Extraction — MRE",
    engineGroup: "electrolysis",
    site: "equatorial",
    readout: (r) => ({ value: r.electrolysis.currentA, unit: "A" })
  },
  {
    id: "extraction-sub",
    label: "Extraction — Sublimation",
    engineGroup: "thermal",
    site: "polar",
    readout: (r) => ({
      value: (r.thermal.secSub_JPerKg ?? 0) / 3.6e6,
      unit: "kWh/kg"
    })
  },
  {
    id: "propellant",
    label: "Propellant plant",
    engineGroup: "propellant",
    site: "polar",
    // Water electrolysis power, in propellant mode or inside the Sabatier loop.
    readout: (r) => ({
      value: r.energy.balances.find((balance) => balance.id === "water-electrolysis-energy")?.electricalInputW ?? 0,
      unit: "W"
    })
  },
  {
    id: "sabatier",
    label: "Sabatier",
    engineGroup: "sabatier",
    site: "polar",
    gatedBy: "enableSabatier",
    readout: (r) => ({ value: r.production.ch4KgPerDay, unit: "kg/day" })
  },
  {
    id: "cryo",
    label: "Cryogenics",
    engineGroup: "cryo",
    readout: (r) => ({ value: r.cryo.boiloffKgPerDay, unit: "kg/day" })
  },
  {
    id: "power",
    label: "Power",
    engineGroup: "power",
    readout: (r) => ({ value: r.energy.gridPowerW, unit: "W" })
  },
  {
    id: "logistics",
    label: "Logistics",
    engineGroup: "logistics",
    readout: (r) => ({ value: r.logistics.nMissions, unit: "msn" })
  },
  {
    id: "campaign",
    label: "Campaign",
    engineGroup: "campaign",
    // Payback day; a dash (NaN) when it does not fall within the campaign.
    readout: (r) => ({ value: r.campaign.paysBackInCampaign ? (r.campaign.paybackDays ?? Number.NaN) : Number.NaN, unit: "days" })
  },
  {
    id: "refuel",
    label: "Refuelling demand",
    engineGroup: "refuel",
    // Share of the lander's propellant the plant supplies; a dash without a demand.
    readout: (r) => ({ value: r.refuel === null ? Number.NaN : r.refuel.isruShare * 100, unit: "%" })
  },
  {
    id: "construction",
    label: "Construction",
    engineGroup: "construction",
    site: "equatorial",
    readout: (r) => ({ value: r.construction.slagPerYearT, unit: "t/yr" })
  }
];

/**
 * Inputs that only exist at one site even though their engine group is shared
 * (the power group serves both). Shown at the other site they cannot change
 * anything, so the rail leaves them out there.
 */
export const SITE_ONLY_PARAMS: Partial<Record<keyof SimParams, SiteMode>> = {
  polarIlluminationFraction: "polar",
  polarLongestShadowHours: "polar",
  thetaDivBeam: "polar",
  zCraterDrop: "polar",
  rReceiver: "polar",
  etaEmitter: "polar",
  etaPvReceiver: "polar"
};

/** Params handled outside the rail (top bar / group gates). */
const EXCLUDED: ReadonlySet<string> = new Set(["site", "enableSabatier"]);

export interface NumericParamDef {
  key: keyof SimParams;
  label: string;
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
  description: string;
  source: string;
  evidence: ParamEvidence;
}

/** Numeric, user-adjustable params for one engine group (fixed constants with min === max are skipped). */
export function paramsForGroup(engineGroup: string): NumericParamDef[] {
  const defs: NumericParamDef[] = [];
  for (const [key, meta] of Object.entries(PARAM_META)) {
    if (meta.group !== engineGroup || EXCLUDED.has(key)) {
      continue;
    }
    if (typeof meta.value !== "number" || meta.min === undefined || meta.max === undefined) {
      continue;
    }
    if (meta.min === meta.max) {
      continue;
    }
    const numeric = {
      key: key as keyof SimParams,
      label: meta.description,
      unit: meta.unit,
      min: meta.min,
      max: meta.max,
      defaultValue: meta.value,
      description: meta.description,
      source: meta.source
    };
    defs.push({
      ...numeric,
      evidence: evidenceForParam({
        key: numeric.key,
        group: meta.group,
        source: numeric.source,
        min: numeric.min,
        max: numeric.max,
        unit: numeric.unit
      })
    });
  }
  return defs;
}

/** Conditioning-energy input for each storage stream the engine can carry. */
export const CONDITIONING_PARAM: Record<string, keyof SimParams> = {
  lox: "secCondLox",
  "water-ice": "secCondWaterIce",
  "liquid-water": "secCondLiquidWater",
  lh2: "secCondLh2",
  lch4: "secCondLch4",
  "co2-feed": "secCondCo2"
};

const CONDITIONING_KEYS = new Set<string>(Object.values(CONDITIONING_PARAM));

/** The rail state that decides which inputs a group shows. */
export type RailVisibilityParams = Pick<
  SimParams,
  | "site"
  | "oxideModel"
  | "storageStream"
  | "cryoControlMode"
  | "polarProfileMode"
  | "polarProduct"
  | "enableSabatier"
  | "refuelDemand"
>;

/**
 * Plants whose product a refuelled lander burns: oxygen at the equator, LOX
 * and LH2 in polar propellant mode. Elsewhere the engine ignores the demand.
 */
export function makesLanderPropellant(params: Pick<SimParams, "site" | "enableSabatier" | "polarProduct">): boolean {
  return params.site === "equatorial" || (!params.enableSabatier && params.polarProduct === "propellant");
}

/** Liquefier mass input for each liquefied product stream. */
export const LIQUEFIER_PARAM: Record<string, keyof SimParams> = {
  lox: "kLiquefierLox",
  lh2: "kLiquefierLh2"
};

const LIQUEFIER_KEYS = new Set<string>(Object.values(LIQUEFIER_PARAM));

/**
 * Inputs a rail group shows for the current configuration. Inputs that cannot
 * apply are left out rather than shown inert: the lumped O2 fraction while the
 * oxide-composition model is on, the other site's power inputs, scalar polar
 * illumination while a time-resolved profile drives it, and the custom-cryogen
 * properties unless that stream is selected.
 */
export function railParamsForGroup(
  group: GroupDef,
  params: RailVisibilityParams,
  /** streams the engine is storing (result.cryo.inventories); conditioning inputs for others are hidden */
  activeStreams: ReadonlySet<string> = new Set(Object.keys(CONDITIONING_PARAM))
): NumericParamDef[] {
  const all = paramsForGroup(group.engineGroup).filter((def) =>
    !(params.oxideModel && def.key === "xO2") &&
    (SITE_ONLY_PARAMS[def.key] === undefined || SITE_ONLY_PARAMS[def.key] === params.site)
  );
  if (group.id === "propellant") {
    // Electrolysis runs in propellant mode or inside the Sabatier loop; the
    // mixture ratio and electrolyzer mass belong to propellant mode alone.
    if (params.enableSabatier) return all.filter((def) => def.key !== "mixtureRatio" && def.key !== "kElectrolyzerMass");
    return params.polarProduct === "propellant" ? all : [];
  }
  if (group.id === "refuel") {
    if (params.refuelDemand !== "lander" || !makesLanderPropellant(params)) return [];
    // The demand splits at the vehicle mixture ratio, which the propellant
    // group shows at the pole; at the equator it lives here.
    const mixture = params.site === "equatorial" ? paramsForGroup("propellant").filter((def) => def.key === "mixtureRatio") : [];
    return [...all, ...mixture];
  }
  if (group.id === "power" && params.site === "polar" && params.polarProfileMode === "profile") {
    return all.filter((def) => def.key !== "polarIlluminationFraction" && def.key !== "polarLongestShadowHours");
  }
  if (group.id !== "cryo") {
    return all;
  }
  const customOnly = new Set(["rhoCryo", "customLatentHeatJPerKg", "Ttank", "secLiquefaction"]);
  return all.filter((def) => {
    if (customOnly.has(String(def.key)) && params.storageStream !== "custom") {
      return false;
    }
    if (CONDITIONING_KEYS.has(String(def.key)) && ![...activeStreams].some((stream) => CONDITIONING_PARAM[stream] === def.key)) {
      return false;
    }
    if (LIQUEFIER_KEYS.has(String(def.key)) && ![...activeStreams].some((stream) => LIQUEFIER_PARAM[stream] === def.key)) {
      return false;
    }
    return def.key !== "coolerCapacityW" || params.cryoControlMode === "capacity-limited";
  });
}

/** Every whitespace-separated term must appear in the plain name, code name, group, or unit. */
export function matchesParamQuery(def: NumericParamDef, groupLabel: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) return true;
  const haystack = `${def.label} ${String(def.key)} ${groupLabel} ${def.unit}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/**
 * Non-numeric inputs a rail group edits through its own controls (selects
 * and the Sabatier switch). They count toward CHANGED like any slider.
 */
const GROUP_MODE_PARAMS: Partial<Record<string, Array<keyof SimParams>>> = {
  "extraction-sub": ["polarProduct"],
  cryo: ["storageStream", "cryoControlMode"],
  power: ["polarProfileMode"],
  sabatier: ["enableSabatier"],
  campaign: ["deploymentManifest"],
  refuel: ["refuelDemand"]
};

/**
 * The mode inputs a group shows for this configuration: polar profile controls
 * only at the pole, the demand switch only for plants that make lander propellant.
 */
export function railModeParamsForGroup(
  group: GroupDef,
  params: Pick<SimParams, "site" | "enableSabatier" | "polarProduct">
): Array<keyof SimParams> {
  if (group.id === "power" && params.site !== "polar") return [];
  if (group.id === "refuel" && !makesLanderPropellant(params)) return [];
  return GROUP_MODE_PARAMS[group.id] ?? [];
}

/** Mode inputs whose plain name, code name, or group matches the query. */
export function matchesModeQuery(key: keyof SimParams, groupLabel: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) return true;
  const haystack = `${PARAM_META[key].description} ${String(key)} ${groupLabel}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** True when a numeric input differs from its default beyond float noise. */
export function isChangedFromDefault(value: number, defaultValue: number): boolean {
  return Math.abs(value - defaultValue) > 1e-12 * Math.max(1, Math.abs(defaultValue));
}

/** True when a mode input differs from its default. */
export function isModeChanged(params: SimParams, key: keyof SimParams): boolean {
  return params[key] !== DEFAULTS[key];
}

export function groupsForSite(site: SiteMode): GroupDef[] {
  return GROUPS.filter((g) => g.site === undefined || g.site === site);
}

/**
 * Known warning id → offending param key (slider track tick highlight, §6).
 * `pad-shear` and `beta-le-alpha` are deliberately absent: they are
 * unreachable via bounded public inputs and must render generically (no
 * camera fly) per the model contract — the same path future engine ids take.
 */
export const WARNING_PARAM: Partial<Record<string, keyof SimParams>> = {
  "anode-current": "jOperating",
  "mre-voltage-shortfall": "Vcell",
  "mre-no-oxide-yield": "Vcell",
  "cryo-capacity-shortfall": "coolerCapacityW",
  "thermal-stress": "castDeltaT"
};

/** Known warning id → diorama asset key (camera fly + pulse, §6). */
export const WARNING_ASSET: Partial<Record<string, string>> = {
  "anode-current": "reactor",
  "mre-voltage-shortfall": "reactor",
  "mre-no-oxide-yield": "reactor",
  "energy-balance": "reactor",
  "thermal-stress": "castingYard"
};
