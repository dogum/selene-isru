import { PARAM_META } from "@selene-isru/engine";
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
    id: "construction",
    label: "Construction",
    engineGroup: "construction",
    site: "equatorial",
    readout: (r) => ({ value: r.construction.slagPerYearT, unit: "t/yr" })
  }
];

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
