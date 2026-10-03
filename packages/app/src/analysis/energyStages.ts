import type { SimResult } from "@selene-isru/engine";

export interface EnergyStage {
  /** engine node that spends the energy */
  id: string;
  label: string;
  kWhPerKg: number;
}

const STAGE_LABELS: Record<string, string> = {
  mine: "Excavation",
  melt: "Regolith melt heating",
  beneficiation: "Soil sizing and separation",
  reduction: "Ilmenite feed heat and reduction",
  sublimation: "Ice heating and sublimation",
  cryo: "Product conditioning and storage",
  grid: "Site loads"
};

/** Plain name for the process stage an energy line leaves. */
export function energyStageLabel(id: string, result: Pick<SimResult, "site" | "ilmenite">): string {
  if (id === "electrolysis") {
    return result.site === "equatorial" && result.ilmenite === null ? "Molten-regolith electrolysis" : "Water electrolysis";
  }
  return STAGE_LABELS[id] ?? id;
}

/**
 * Energy per kg of product by the stage that spends it, largest first. Each
 * engine line runs from the stage that consumes its energy (`from`) to where
 * that stage's output goes, so the stage is the line's source.
 */
export function energyStages(result: Pick<SimResult, "site" | "ilmenite" | "energy">): EnergyStage[] {
  const totals = new Map<string, number>();
  for (const flow of result.energy.flows) totals.set(flow.from, (totals.get(flow.from) ?? 0) + flow.kWhPerKg);
  return [...totals.entries()]
    .map(([id, kWhPerKg]) => ({ id, label: energyStageLabel(id, result), kWhPerKg }))
    .sort((a, b) => b.kWhPerKg - a.kWhPerKg);
}
