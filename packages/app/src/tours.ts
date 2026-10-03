import { beamEfficiency } from "@selene-isru/engine";
import type { SimParams, SimResult } from "@selene-isru/engine";
import { formatQtyText } from "./lib/format";

export type TourReadout = "sec" | "power" | "missions" | "tank" | "production";

/**
 * A caption may read the live result. Narration must not contradict the
 * engine: the polar scene shows rim solar towers, but whether they or a
 * fission plant power the floor is the engine's mass trade, not the script's.
 */
export type TourCaption = string | ((result: SimResult, params: SimParams) => string);

export interface TourBeat {
  cameraPose: string;
  paramPatch?: Partial<SimParams>;
  caption: TourCaption;
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
        caption: (result) =>
          result.power.architecture === "solar"
            ? "PSR overview: rim solar power feeds the floor plant."
            : "PSR overview: here a fission plant is lighter than rim solar plus storage, so it powers the floor plant.",
        holdMs: 3000,
        readout: "sec"
      },
      {
        cameraPose: "towers",
        caption: (result, params) => {
          const delivered = Math.round(
            beamEfficiency(params.w0Beam, params.thetaDivBeam, params.zCraterDrop, params.rReceiver, params.etaEmitter, params.etaPvReceiver) *
              params.etaWire *
              100
          );
          return result.power.architecture === "solar"
            ? `Rim towers: solar collection, beamed to the floor at ${delivered}% delivery.`
            : `Rim towers: the solar alternative. Beaming delivers only ${delivered}% of what they collect, so it loses the mass trade here.`;
        },
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
        caption: (result) =>
          result.power.architecture === "solar"
            ? "Polar scale: rim solar and floor demand are sized together."
            : "Polar scale: at this demand fission wins the mass trade over beamed rim solar.",
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

/** Resolve a beat's caption against the live engine result. */
export function captionText(caption: TourCaption, result: SimResult, params: SimParams): string {
  return typeof caption === "string" ? caption : caption(result, params);
}
