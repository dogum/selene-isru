import type { SimParams, SimResult } from "@selene-isru/engine";
import { formatQtyText } from "../lib/format";

export type ProcessKind = "material" | "power" | "logistics" | "construction";

export interface ProcessEdgeView {
  from: string;
  to: string;
  shortLabel: string;
  label: string;
  kind: ProcessKind;
}

export type ModelMaturity =
  | "REFERENCE DATA"
  | "LITERATURE-DERIVED"
  | "SIMPLIFIED CORRELATION"
  | "DESIGN ASSUMPTION";

export interface AssetKnowledge {
  purpose: string;
  inputs: string[];
  assumptions: string[];
  maturity: ModelMaturity;
}

const KNOWLEDGE: Record<SimParams["site"], Record<string, AssetKnowledge>> = {
  equatorial: {
    excavator: {
      purpose: "Excavate and meter lunar regolith into the oxygen-production chain.",
      inputs: ["Production target", "Regolith density and cohesion", "Cut geometry", "Drive efficiency"],
      assumptions: [
        "Fleet energy is represented by a specific mining-energy correlation.",
        "Terrain mechanics are steady-state and do not model wheel slip or abrasive wear."
      ],
      maturity: "SIMPLIFIED CORRELATION"
    },
    hauler: {
      purpose: "Move excavated regolith from the trench to the MRE feed system.",
      inputs: ["Regolith throughput", "Fleet mass factor", "Traverse speed", "Drive efficiency"],
      assumptions: [
        "Haul duty is folded into the fleet-level mining energy and mass factors.",
        "Availability, spares, and route congestion are outside the present steady-state model."
      ],
      maturity: "DESIGN ASSUMPTION"
    },
    reactor: {
      purpose: "Convert molten regolith into oxygen product and construction-grade slag.",
      inputs: ["Regolith feed", "Electrical power", "Cell voltage", "Melt temperature"],
      assumptions: [
        "Aggregate oxygen recovery stands in for a complete reactor-scale oxide kinetics model.",
        "Current density is checked against a diffusion-limited analytical estimate."
      ],
      maturity: "LITERATURE-DERIVED"
    },
    castingYard: {
      purpose: "Cast hot slag coproduct into pads, shielding, and structural feedstock.",
      inputs: ["Slag throughput", "Casting temperature drop", "Slag density", "Pad geometry"],
      assumptions: [
        "Cooling stress uses a simplified constrained thermal-strain calculation.",
        "Material handling losses and long-duration fracture growth are not represented."
      ],
      maturity: "SIMPLIFIED CORRELATION"
    },
    tanks: {
      purpose: "Liquefy and hold oxygen product as an operational reserve.",
      inputs: ["Product throughput", "Reserve duration", "Tank temperature", "MLI construction"],
      assumptions: [
        "Tank geometry is derived from reserve volume with a lumped heat-leak model.",
        "Boil-off is steady-state and excludes transient chill-down and transfer losses."
      ],
      maturity: "LITERATURE-DERIVED"
    },
    station: {
      purpose: "Select and size the lower-mass solar or nuclear surface-power architecture.",
      inputs: ["Grid demand", "Solar incidence", "Storage performance", "Nuclear specific mass"],
      assumptions: [
        "Architecture selection compares analytical system-mass slopes at the operating point.",
        "Reliability, redundancy, packaging, and maintenance logistics are not monetized."
      ],
      maturity: "SIMPLIFIED CORRELATION"
    },
    pad: {
      purpose: "Receive landed infrastructure and reuse slag output as prepared surface area.",
      inputs: ["Infrastructure mass", "Lander performance", "Packing efficiency", "Pad design"],
      assumptions: [
        "Mission count uses an ideal rocket-equation payload estimate.",
        "Launch cadence, boil-off during flight, crew, spares, and schedule risk are excluded."
      ],
      maturity: "SIMPLIFIED CORRELATION"
    },
    habitat: {
      purpose: "Demonstrate how slag production can close the habitat shielding loop.",
      inputs: ["Shield depth", "Roof area", "Slag density", "Internal pressure"],
      assumptions: [
        "The simulator sizes bulk overhead shielding, not a complete pressure-vessel structure.",
        "Radiation effectiveness, construction sequencing, and penetrations require detailed design."
      ],
      maturity: "DESIGN ASSUMPTION"
    }
  },
  polar: {
    excavator: {
      purpose: "Excavate ice-bearing regolith from the permanently shadowed region.",
      inputs: ["Water target", "Ice fraction", "Regolith mechanics", "Drive efficiency"],
      assumptions: [
        "Ice is uniformly distributed at the selected bulk mass fraction.",
        "Fleet duty is represented by steady-state mining energy and mass factors."
      ],
      maturity: "DESIGN ASSUMPTION"
    },
    tents: {
      purpose: "Heat icy feedstock and recover water vapor through sublimation and condensation.",
      inputs: ["Icy feed", "PSR temperature", "Sublimation temperature", "Pore radius"],
      assumptions: [
        "A cold-regime average heat capacity represents the regolith heating path.",
        "Knudsen transport uses a representative pore radius rather than a resolved bed model."
      ],
      maturity: "SIMPLIFIED CORRELATION"
    },
    receiver: {
      purpose: "Receive beamed power, collect water, and optionally produce methane and oxygen.",
      inputs: ["Recovered water", "Beamed or nuclear power", "Electrolyzer voltage", "Sabatier conversion"],
      assumptions: [
        "The optional Sabatier loop uses equilibrium-informed conversion with fixed operating inputs.",
        "CO₂ supply, recycle hardware, catalyst aging, and gas cleanup are outside the manifest."
      ],
      maturity: "LITERATURE-DERIVED"
    },
    tanks: {
      purpose: "Liquefy and store water-derived products for reserve and downstream use.",
      inputs: ["Product throughput", "Reserve duration", "Tank temperature", "MLI construction"],
      assumptions: [
        "Storage products share a lumped cryogenic sizing model.",
        "Steady-state boil-off excludes transient transfer and chill-down losses."
      ],
      maturity: "LITERATURE-DERIVED"
    },
    towers: {
      purpose: "Collect rim sunlight and beam usable power to the shadowed crater floor.",
      inputs: ["Grid demand", "Solar incidence", "Beam divergence", "Receiver radius"],
      assumptions: [
        "Beam propagation is represented by geometric divergence and fixed conversion efficiencies.",
        "Pointing losses, terrain occlusion statistics, and tower structural dynamics are not resolved."
      ],
      maturity: "SIMPLIFIED CORRELATION"
    },
    station: {
      purpose: "Provide the alternative nuclear architecture for continuous polar power.",
      inputs: ["Grid demand", "Source and sink temperatures", "Specific mass", "Radiator emissivity"],
      assumptions: [
        "System mass is a specific-mass slope plus shielding intercept.",
        "Reliability, redundancy, packaging, and reactor siting constraints are not monetized."
      ],
      maturity: "SIMPLIFIED CORRELATION"
    },
    habitat: {
      purpose: "Represent an occupied polar outpost consuming stored products and local shielding.",
      inputs: ["Stored product", "Shield depth", "Roof area", "Internal pressure"],
      assumptions: [
        "Habitat demand is illustrative and is not a closed crew consumables model.",
        "The shielding calculation does not replace pressure-shell or radiation transport design."
      ],
      maturity: "DESIGN ASSUMPTION"
    }
  }
};

function q(value: number, unit: string, sig = 3): string {
  return formatQtyText(value, unit, sig);
}

export function processEdges(result: SimResult, params: SimParams): ProcessEdgeView[] {
  if (result.site === "equatorial") {
    return [
      {
        from: "excavator",
        to: "hauler",
        shortLabel: "REGOLITH",
        label: `REGOLITH · ${q(result.production.regolithKgPerDay, "kg/day")}`,
        kind: "material"
      },
      {
        from: "hauler",
        to: "reactor",
        shortLabel: "REACTOR FEED",
        label: `REACTOR FEED · ${q(result.production.regolithKgPerDay, "kg/day")}`,
        kind: "material"
      },
      {
        from: "station",
        to: "reactor",
        shortLabel: "GRID POWER",
        label: `GRID POWER · ${q(result.energy.gridPowerW, "W")}`,
        kind: "power"
      },
      {
        from: "reactor",
        to: "tanks",
        shortLabel: "O₂ PRODUCT",
        label: `O₂ PRODUCT · ${q(result.production.o2KgPerDay, "kg/day")}`,
        kind: "material"
      },
      {
        from: "reactor",
        to: "castingYard",
        shortLabel: "SLAG",
        label: `SLAG · ${q(result.production.slagKgPerDay, "kg/day")}`,
        kind: "construction"
      },
      {
        from: "castingYard",
        to: "habitat",
        shortLabel: "SHIELD FEED",
        label: `SHIELD FEED · ${q(result.construction.slagPerYearT, "t/yr")}`,
        kind: "construction"
      },
      {
        from: "tanks",
        to: "pad",
        shortLabel: "O₂ RESERVE",
        label: `O₂ RESERVE · ${q(params.reserveDays, "days", 2)}`,
        kind: "logistics"
      },
      {
        from: "pad",
        to: "habitat",
        shortLabel: "LANDED INFRA",
        label: `LANDED INFRA · ${q(result.logistics.totalInfraMassKg, "kg")}`,
        kind: "logistics"
      }
    ];
  }

  const powerSource = result.power.architecture === "solar" ? "towers" : "station";
  const productLabel = params.enableSabatier
    ? `O₂ ${q(result.production.o2KgPerDay, "kg/day")} · CH₄ ${q(result.production.ch4KgPerDay, "kg/day")}`
    : `H₂O · ${q(result.production.waterKgPerDay, "kg/day")}`;
  return [
    {
      from: "excavator",
      to: "tents",
      shortLabel: "ICY FEED",
      label: `ICY FEED · ${q(result.production.regolithKgPerDay, "kg/day")}`,
      kind: "material"
    },
    {
      from: "tents",
      to: "receiver",
      shortLabel: "RECOVERED H₂O",
      label: `RECOVERED H₂O · ${q(result.production.waterKgPerDay, "kg/day")}`,
      kind: "material"
    },
    {
      from: powerSource,
      to: "receiver",
      shortLabel: result.power.architecture === "solar" ? "BEAM POWER" : "NUCLEAR POWER",
      label: `${result.power.architecture === "solar" ? "BEAM" : "NUCLEAR"} POWER · ${q(result.energy.gridPowerW, "W")}`,
      kind: "power"
    },
    {
      from: "receiver",
      to: "tanks",
      shortLabel: params.enableSabatier ? "O₂ + CH₄" : "WATER PRODUCT",
      label: productLabel,
      kind: "material"
    },
    {
      from: "tanks",
      to: "habitat",
      shortLabel: "OUTPOST RESERVE",
      label: `OUTPOST RESERVE · ${q(params.reserveDays, "days", 2)}`,
      kind: "logistics"
    }
  ];
}

export function assetKnowledge(site: SimParams["site"], assetKey: string): AssetKnowledge | null {
  return KNOWLEDGE[site][assetKey] ?? null;
}

export function flowsForAsset(
  result: SimResult,
  params: SimParams,
  assetKey: string
): { incoming: ProcessEdgeView[]; outgoing: ProcessEdgeView[] } {
  const edges = processEdges(result, params);
  return {
    incoming: edges.filter((edge) => edge.to === assetKey),
    outgoing: edges.filter((edge) => edge.from === assetKey)
  };
}

export function connectedAssets(result: SimResult, params: SimParams, assetKey: string): string[] {
  const connected = new Set<string>();
  for (const edge of processEdges(result, params)) {
    if (edge.from === assetKey) {
      connected.add(edge.to);
    } else if (edge.to === assetKey) {
      connected.add(edge.from);
    }
  }
  return [...connected];
}
