import { simulate } from "@selene-isru/engine";
import type { SimParams, SimResult } from "@selene-isru/engine";
import { paramBounds } from "./bounds";

/**
 * What an input does in the *current* configuration, measured by running the
 * engine rather than declared by hand: a static list drifts as the model
 * changes, and many inputs only matter in some configurations (solar inputs
 * while nuclear is selected, packing efficiency while one landing suffices).
 */
export type InputActivity = "drives-results" | "checks-only" | "no-effect";

export interface ActivityReport {
  activity: InputActivity;
  /** Result paths that moved across the input's range, headline paths first. */
  changed: string[];
  /** Plain-language explanation for the reader. */
  reason: string;
}

type Leaf = number | string | boolean;

/**
 * Headline results: a change here means the input changes the answer a
 * reader takes away, not just a subsystem check.
 */
const HEADLINE_PREFIXES = [
  "energy.secTotal_kWhPerKg",
  "energy.gridPowerW",
  "production.",
  "power.architecture",
  "logistics.totalInfraMassKg",
  "logistics.nMissions",
  "logistics.leverageL",
  "logistics.plantMassThroughputDays",
  "campaign."
];

const LABELS: Record<string, string> = {
  "energy.secTotal_kWhPerKg": "energy per kg",
  "energy.gridPowerW": "grid power",
  "power.architecture": "power architecture",
  "logistics.totalInfraMassKg": "landed mass",
  "logistics.nMissions": "landings",
  "logistics.leverageL": "mass leverage",
  "logistics.plantMassThroughputDays": "plant-mass equivalent",
  "power.pCritW": "solar/nuclear crossover",
  "power.pCritDynamicW": "aged solar/nuclear crossover",
  "power.solarArrayM2": "solar array area",
  "power.solarMassKg": "solar option mass",
  "power.nuclearMassKg": "nuclear option mass",
  "power.radiatorM2": "radiator area",
  "campaign.paybackDays": "payback day",
  "campaign.paysBackInCampaign": "payback within the campaign",
  "campaign.returnRatio": "campaign return",
  "campaign.netLeoMassKg": "net LEO mass",
  "campaign.leoMassSpentKg": "LEO mass spent",
  "campaign.leoMassSavedKg": "LEO mass saved",
  "campaign.leoMassPerLandedKg": "LEO mass per landed kg",
  "campaign.deploymentDays": "deployment time",
  "campaign.firstProductDay": "first product day",
  "campaign.campaignEndDay": "campaign end",
  "campaign.deliveredKgPerDay": "delivered output",
  "campaign.resupplyKgPerYear": "spares per year",
  "campaign.cumulativeProductKg": "campaign product",
  "campaign.landedMassKg": "landed mass with spares"
};

/** String fields that name an array element, in preference order. */
const NAME_FIELDS = ["label", "subsystem", "stream", "oxide", "material", "id"];

export function isHeadlinePath(path: string): boolean {
  return HEADLINE_PREFIXES.some((prefix) => path === prefix || (prefix.endsWith(".") && path.startsWith(prefix)));
}

function collect(value: unknown, path: string, out: Map<string, Leaf>): void {
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    out.set(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${path}[${index}]`, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collect(item, path === "" ? key : `${path}.${key}`, out);
    }
  }
}

function leaves(result: SimResult): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  collect(result, "", out);
  return out;
}

function differs(a: Leaf | undefined, b: Leaf | undefined): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return false;
    return Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return a !== b;
}

/**
 * "electrolysis.drainVelocityMPerS" → "drain velocity". With the base leaves,
 * an array element is named by its own label ("energy.balances[0].usefulOutputW"
 * → "Excavation · useful output").
 */
export function describeResultPath(path: string, base?: ReadonlyMap<string, Leaf>): string {
  const known = LABELS[path];
  if (known !== undefined) return known;
  const words = (segment: string): string =>
    segment
      .replace(/\[\d+\]$/, "")
      .replace(/(_.*|[A-Z][a-z0-9]*Per[A-Za-z0-9]+|PaS|M2|M3|Kg|Pa|W|K|V|A|N)$/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .trim();
  const element = /^(.*\[\d+\])\.([^.[\]]+)$/.exec(path);
  if (element !== null) {
    const [, parent, field] = element as unknown as [string, string, string];
    const name = NAME_FIELDS.map((key) => base?.get(`${parent}.${key}`)).find((value) => typeof value === "string");
    const owner = typeof name === "string" ? name : words(parent.split(".").pop() ?? parent);
    return `${owner} · ${words(field) || field}`;
  }
  const last = path.split(".").pop() ?? path;
  return words(last) || last;
}

// Base-case leaves are shared by every row probing the same params object.
const baseCache = new WeakMap<SimParams, Map<string, Leaf>>();

function baseLeaves(params: SimParams): Map<string, Leaf> {
  let cached = baseCache.get(params);
  if (cached === undefined) {
    cached = leaves(simulate(params));
    baseCache.set(params, cached);
  }
  return cached;
}

function architectureReason(base: Map<string, Leaf>, changed: string[]): string | null {
  if (changed.length === 0 || !changed.every((path) => path.startsWith("power."))) return null;
  const architecture = base.get("power.architecture");
  // The crossover belongs to neither option, so it may accompany either but
  // cannot on its own make an input "solar-only" or "nuclear-only".
  const solarOnly =
    changed.every((path) => /^power\.(solar|pCrit)/.test(path)) && changed.some((path) => path.startsWith("power.solar"));
  const nuclearOnly =
    changed.every((path) => /^power\.(nuclear|radiator|pCrit)/.test(path)) &&
    changed.some((path) => /^power\.(nuclear|radiator)/.test(path));
  if (solarOnly && architecture === "nuclear") {
    return "Sizes the solar alternative only. Nuclear is selected here because it is lighter.";
  }
  if (nuclearOnly && architecture === "solar") {
    return "Sizes the nuclear alternative only. Solar is selected here because it is lighter.";
  }
  return null;
}

/**
 * Classify one input by moving it to each end of its engine range with every
 * other input held at `params`. Two extra engine runs; the base run is cached
 * per params object.
 */
export function inputActivity(params: SimParams, key: keyof SimParams): ActivityReport {
  const bounds = paramBounds(key);
  const current = params[key];
  if (bounds === null || typeof current !== "number") {
    return { activity: "drives-results", changed: [], reason: "Selects a model mode." };
  }
  const base = baseLeaves(params);
  const changed = new Set<string>();
  for (const probe of [bounds.min, bounds.max]) {
    if (probe === current) continue;
    const moved = leaves(simulate({ ...params, [key]: probe }));
    for (const path of new Set([...base.keys(), ...moved.keys()])) {
      const before = base.get(path);
      const after = moved.get(path);
      // A field that only echoes the input back is not an effect of it.
      if (before === current && after === probe) continue;
      if (differs(before, after)) changed.add(path);
    }
  }
  const ordered = [...changed].sort((a, b) => Number(isHeadlinePath(b)) - Number(isHeadlinePath(a)));
  if (ordered.length === 0) {
    return {
      activity: "no-effect",
      changed: [],
      reason:
        key === "landingsPerYear"
          ? "The plant fits on one lander here, so landing cadence cannot delay production. It matters once the plant needs two or more landers."
          : "Moving this input across its whole range changes no result in the current configuration."
    };
  }
  const labels = [...new Set(ordered.map((path) => describeResultPath(path, base)))].slice(0, 3).join(", ");
  if (ordered.some(isHeadlinePath)) {
    return { activity: "drives-results", changed: ordered, reason: `Changes ${labels}.` };
  }
  return {
    activity: "checks-only",
    changed: ordered,
    reason: architectureReason(base, ordered) ?? `Changes subsystem checks only: ${labels}. Headline results do not move.`
  };
}
