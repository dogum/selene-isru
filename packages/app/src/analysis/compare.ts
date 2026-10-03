import type { SimResult } from "@selene-isru/engine";

/** Which way a metric moves when the design improves; "neutral" for requirements. */
export type BetterDirection = "lower" | "higher" | "neutral";
export type DeltaTone = "good" | "warn" | "neutral";

export interface CompareMetric {
  label: string;
  unit: string;
  value: (r: SimResult) => number;
  better: BetterDirection;
  sig?: number;
}

export const COMPARE_METRICS: CompareMetric[] = [
  { label: "SEC TOTAL", unit: "kWh/kg", value: (r) => r.energy.secTotal_kWhPerKg, better: "lower", sig: 4 },
  { label: "GRID POWER", unit: "W", value: (r) => r.energy.gridPowerW, better: "lower" },
  { label: "MISSIONS", unit: "", value: (r) => r.logistics.nMissions, better: "lower" },
  { label: "PLANT-MASS EQUIV.", unit: "days", value: (r) => r.logistics.plantMassThroughputDays, better: "lower" },
  // Lifetime product per kg of landed infrastructure: more is better.
  { label: "LEVERAGE L", unit: "x", value: (r) => r.logistics.leverageL, better: "higher" },
  // A payback outside the campaign is not achieved: it reads as a dash and is never coloured.
  { label: "PAYBACK", unit: "days", value: (r) => (r.campaign.paysBackInCampaign ? (r.campaign.paybackDays ?? Number.NaN) : Number.NaN), better: "lower" },
  { label: "CAMPAIGN RETURN", unit: "x", value: (r) => r.campaign.returnRatio, better: "higher" },
  // Output is the requirement being met, not a figure of merit.
  { label: "OUTPUT", unit: "kg/day", value: (r) => r.production.targetKgPerDay, better: "neutral", sig: 4 }
];

/** Tone for `current - reference`; an unchanged value is never coloured. */
export function deltaTone(delta: number, better: BetterDirection): DeltaTone {
  if (better === "neutral" || delta === 0 || !Number.isFinite(delta)) {
    return "neutral";
  }
  const improved = better === "lower" ? delta < 0 : delta > 0;
  return improved ? "good" : "warn";
}
