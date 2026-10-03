import { canonicalSiteDesign, PARAM_META } from "@selene-isru/engine";
import type { SimParams, SiteDesignDocument } from "@selene-isru/engine";
import type { StudyScenario } from "../state/store";

/** How many inputs two cases set differently. */
export function differingInputCount(a: SimParams, b: SimParams): number {
  return (Object.keys(PARAM_META) as Array<keyof SimParams>).filter((key) => a[key] !== b[key]).length;
}

/** JSON with object keys sorted, so equal content compares equal whatever order it was built in. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Whether two designs differ in anything but their inputs and identity: the
 * environment, assets, connections, or planner state. Identity (id, name,
 * timestamps, app version) is excluded because saving a design rewrites it.
 */
export function layoutDiffers(a: SiteDesignDocument, b: SiteDesignDocument): boolean {
  const layout = (design: SiteDesignDocument): unknown => {
    const canonical = canonicalSiteDesign(design);
    return { environment: canonical.environment, assets: canonical.assets, connections: canonical.connections, planner: canonical.planner };
  };
  return stableJson(layout(a)) !== stableJson(layout(b));
}

export type LiveComparison = { comparable: false } | { comparable: true; inputs: number; layout: boolean };

export interface LiveCase {
  workspaceMode: StudyScenario["kind"];
  /** the simulated params; for a custom design these are its effective, capacity-limited inputs */
  params: SimParams;
  /** the live custom design, as saving it would store it */
  design: SiteDesignDocument;
}

/**
 * How a saved case differs from the live case, in the terms UPDATE would
 * change. A custom case compares its design with the live design: the
 * planned inputs (not the live effective ones, which are capacity-limited
 * and never saved) and the layout. Cases of the other workspace's kind are
 * not comparable.
 */
export function compareWithLive(scenario: StudyScenario, live: LiveCase): LiveComparison {
  if (scenario.kind !== live.workspaceMode) return { comparable: false };
  if (scenario.kind === "custom") {
    if (scenario.design === undefined) return { comparable: false };
    return {
      comparable: true,
      inputs: differingInputCount(canonicalSiteDesign(scenario.design).params, canonicalSiteDesign(live.design).params),
      layout: layoutDiffers(scenario.design, live.design)
    };
  }
  return { comparable: true, inputs: differingInputCount(scenario.params, live.params), layout: false };
}

/**
 * The saved case a live custom design belongs to: one holding the same design
 * (by design id, which loading and saving keep and a new, reset, seeded, or
 * duplicated design does not). Undo and redo of design edits therefore carry
 * the link with them. When several saved cases hold the design (it was saved
 * as new twice), the one it was last loaded from or saved as is preferred,
 * then the most recently updated.
 */
export function linkedCustomCase(
  scenarios: readonly StudyScenario[],
  preferredId: string | null,
  design: Pick<SiteDesignDocument, "id">
): StudyScenario | null {
  const holders = scenarios.filter((scenario) => scenario.kind === "custom" && scenario.design?.id === design.id);
  return holders.find((scenario) => scenario.id === preferredId) ??
    holders.reduce<StudyScenario | null>((latest, scenario) => (latest === null || scenario.updatedAt > latest.updatedAt ? scenario : latest), null);
}
