import type { SimParams, SimResult } from "@selene-isru/engine";
import { formatQtyText } from "./lib/format";

export type TourReadout = "sec" | "power" | "missions" | "tank" | "production";

export interface TourBeat {
  cameraPose: string;
  paramPatch?: Partial<SimParams>;
  caption: string;
  holdMs: number;
  readout: TourReadout;
}

export interface TourDef {
  id: string;
  label: string;
  beats: TourBeat[];
}

export const TOURS: TourDef[] = [
  {
    id: "polar-water",
    label: "Polar water chain",
    beats: [
      {
        cameraPose: "overview",
        paramPatch: { site: "polar" },
        caption: "PSR overview: rim power feeds the floor plant.",
        holdMs: 3000,
        readout: "sec"
      },
      {
        cameraPose: "towers",
        caption: "Rim towers: solar collection and beamed delivery.",
        holdMs: 3000,
        readout: "power"
      },
      {
        cameraPose: "tents",
        caption: "Sublimation tents: ice throughput sets the extraction load.",
        holdMs: 3000,
        readout: "production"
      },
      {
        cameraPose: "tanks",
        caption: "Cryo farm: stored product follows the lunar cycle.",
        holdMs: 3000,
        readout: "tank"
      }
    ]
  },
  {
    id: "power-crossover",
    label: "Solar/nuclear crossover",
    beats: [
      {
        cameraPose: "station",
        paramPatch: { site: "equatorial", targetKgPerDay: 1000 },
        caption: "Baseline power station: architecture follows the mass trade.",
        holdMs: 3000,
        readout: "power"
      },
      {
        cameraPose: "station",
        paramPatch: { site: "equatorial", targetKgPerDay: 10000 },
        caption: "Industrial scale: the same trade is recalculated live.",
        holdMs: 3000,
        readout: "power"
      },
      {
        cameraPose: "towers",
        paramPatch: { site: "polar", targetKgPerDay: 10000 },
        caption: "Polar scale: rim power and floor demand are sized together.",
        holdMs: 3000,
        readout: "power"
      }
    ]
  },
  {
    id: "ten-tonne-ramp",
    label: "10 t/day ramp",
    beats: [
      {
        cameraPose: "overview",
        paramPatch: { site: "equatorial", targetKgPerDay: 10000 },
        caption: "10 t/day overview: production cadence drives every subsystem.",
        holdMs: 3000,
        readout: "production"
      },
      {
        cameraPose: "excavator",
        caption: "Excavation loop: regolith handling sets the foreground motion.",
        holdMs: 3000,
        readout: "production"
      },
      {
        cameraPose: "reactor",
        caption: "MRE reactor: grid draw and oxygen yield meet at the furnace.",
        holdMs: 3000,
        readout: "sec"
      },
      {
        cameraPose: "castingYard",
        caption: "Casting yard: slag becomes construction mass over time.",
        holdMs: 3000,
        readout: "missions"
      }
    ]
  },
  {
    id: "energy-ledger",
    label: "Energy ledger",
    beats: [
      {
        cameraPose: "reactor",
        paramPatch: { site: "equatorial" },
        caption: "Electrolysis: the reactor dominates the equatorial ledger.",
        holdMs: 3000,
        readout: "sec"
      },
      {
        cameraPose: "tanks",
        caption: "Cryogenics: boil-off appears as storage and power load.",
        holdMs: 3000,
        readout: "tank"
      },
      {
        cameraPose: "receiver",
        paramPatch: { site: "polar" },
        caption: "Sublimation: polar extraction shifts the energy mix.",
        holdMs: 3000,
        readout: "sec"
      }
    ]
  }
];

export function tourReadout(kind: TourReadout, result: SimResult): string {
  if (kind === "power") {
    return `GRID ${formatQtyText(result.energy.gridPowerW, "W")}`;
  }
  if (kind === "missions") {
    return `MISSIONS ${result.logistics.nMissions}`;
  }
  if (kind === "tank") {
    return `BOIL-OFF ${formatQtyText(result.cryo.boiloffKgPerDay, "kg/day")}`;
  }
  if (kind === "production") {
    return `OUTPUT ${formatQtyText(result.production.targetKgPerDay, "kg/day")}`;
  }
  return `SEC ${formatQtyText(result.energy.secTotal_kWhPerKg, "kWh/kg")}`;
}
