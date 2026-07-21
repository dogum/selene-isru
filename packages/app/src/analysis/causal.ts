import { PARAM_META, simulate } from "@selene-isru/engine";
import type { SimParams, SimResult } from "@selene-isru/engine";

export interface CausalNode {
  id: string;
  label: string;
  category: "equation" | "process" | "constraint" | "kpi";
  before: number | string;
  after: number | string;
  unit: string;
}

export interface CausalTrace {
  key: keyof SimParams;
  label: string;
  before: SimParams[keyof SimParams];
  after: SimParams[keyof SimParams];
  nodes: CausalNode[];
  unchangedObservedCount: number;
}

interface Observation {
  id: string;
  label: string;
  category: CausalNode["category"];
  unit: string;
  value: (result: SimResult) => number | string;
}

const OBSERVATIONS: Observation[] = [
  { id: "excavation-force", label: "Cutting-force equation", category: "equation", unit: "N", value: (r) => r.excavation.cuttingForceN },
  { id: "excavation-power", label: "Excavation drive", category: "process", unit: "W", value: (r) => r.excavation.mechPowerW },
  { id: "excavation-mass", label: "Excavation fleet sizing", category: "process", unit: "kg", value: (r) => r.excavation.fleetMassKg },
  { id: "mre-yield", label: "MRE oxide recovery", category: "equation", unit: "kg/kg", value: (r) => r.electrolysis.xO2Effective },
  { id: "mre-current", label: "Faraday current", category: "equation", unit: "A", value: (r) => r.electrolysis.currentA },
  { id: "mre-voltage", label: "MRE voltage margin", category: "constraint", unit: "V", value: (r) => r.electrolysis.voltageMarginV },
  { id: "mre-area", label: "Electrode area", category: "process", unit: "m²", value: (r) => r.electrolysis.electrodeAreaM2 },
  { id: "mre-thermal", label: "Melt duty", category: "process", unit: "kWh/kg", value: (r) => r.electrolysis.secThermal_JPerKg / 3.6e6 },
  { id: "polar-sub", label: "Sublimation lower bound", category: "equation", unit: "kWh/kg", value: (r) => (r.thermal.secSub_JPerKg ?? 0) / 3.6e6 },
  { id: "storage-count", label: "Independent inventories", category: "process", unit: "streams", value: (r) => r.cryo.inventories.length },
  { id: "storage-mass", label: "Storage-system mass", category: "process", unit: "kg", value: (r) => r.cryo.totalStorageMassKg },
  { id: "storage-conditioning", label: "Stream conditioning", category: "process", unit: "W", value: (r) => r.cryo.totalConditioningPowerW },
  { id: "storage-loss", label: "Residual phase loss", category: "constraint", unit: "kg/day", value: (r) => r.cryo.boiloffKgPerDay },
  { id: "profile-light", label: "Delivered site-profile integral", category: "equation", unit: "fraction", value: (r) => r.power.siteProfile.averageDeliveredFraction },
  { id: "profile-outage", label: "Longest receiver outage", category: "constraint", unit: "h", value: (r) => r.power.siteProfile.longestReceiverOutageHours },
  { id: "solar-mass", label: "Solar/storage architecture", category: "process", unit: "kg", value: (r) => r.power.solarMassKg },
  { id: "nuclear-mass", label: "Nuclear architecture", category: "process", unit: "kg", value: (r) => r.power.nuclearMassKg },
  { id: "beam-margin", label: "Beam-delivery margin", category: "constraint", unit: "W", value: (r) => r.power.beamDeliveryMarginW ?? 0 },
  { id: "material-residual", label: "Material conservation", category: "constraint", unit: "kg/day", value: (r) => r.materials.maxAbsResidualKgPerDay },
  { id: "energy-residual", label: "Energy conservation", category: "constraint", unit: "W", value: (r) => r.energy.maxAbsResidualW },
  { id: "kpi-sec", label: "Total specific energy", category: "kpi", unit: "kWh/kg", value: (r) => r.energy.secTotal_kWhPerKg },
  { id: "kpi-power", label: "Grid power", category: "kpi", unit: "W", value: (r) => r.energy.gridPowerW },
  { id: "kpi-mass", label: "Infrastructure mass", category: "kpi", unit: "kg", value: (r) => r.logistics.totalInfraMassKg },
  { id: "kpi-missions", label: "Landed missions", category: "kpi", unit: "missions", value: (r) => r.logistics.nMissions },
  { id: "kpi-equivalent", label: "Plant-mass equivalent", category: "kpi", unit: "days", value: (r) => r.logistics.plantMassThroughputDays },
  { id: "kpi-leverage", label: "Mass leverage", category: "kpi", unit: "×", value: (r) => r.logistics.leverageL },
  { id: "warning-count", label: "Active constraint messages", category: "constraint", unit: "warnings", value: (r) => r.warnings.filter((warning) => warning.severity !== "info").length }
];

function perturb<K extends keyof SimParams>(key: K, params: SimParams): SimParams[K] {
  const current = params[key];
  const meta = PARAM_META[key];
  if (typeof current === "number") {
    const lower = "min" in meta && typeof meta.min === "number" ? meta.min : current * 0.9;
    const upper = "max" in meta && typeof meta.max === "number" ? meta.max : current * 1.1 + 1;
    const delta = Math.max((upper - lower) * 0.0001, Math.abs(current) * 0.01, 1e-9);
    return (current + delta <= upper ? current + delta : Math.max(lower, current - delta)) as SimParams[K];
  }
  if (typeof current === "boolean") {
    return (!current) as SimParams[K];
  }
  return current;
}

function changed(before: number | string, after: number | string): boolean {
  if (typeof before !== "number" || typeof after !== "number") return before !== after;
  return Math.abs(after - before) > Math.max(1e-10, Math.abs(before) * 1e-7);
}

export function traceParameter(key: keyof SimParams, params: SimParams): CausalTrace {
  const afterValue = perturb(key, params);
  const base = simulate(params);
  const candidate = simulate({ ...params, [key]: afterValue });
  const all = OBSERVATIONS.map((observation) => ({
    id: observation.id,
    label: observation.label,
    category: observation.category,
    unit: observation.unit,
    before: observation.value(base),
    after: observation.value(candidate)
  }));
  const nodes = all.filter((node) => changed(node.before, node.after));
  return {
    key,
    label: PARAM_META[key].description,
    before: params[key],
    after: afterValue,
    nodes,
    unchangedObservedCount: all.length - nodes.length
  };
}
