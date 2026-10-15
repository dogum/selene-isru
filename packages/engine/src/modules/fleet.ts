import type { SimParams } from "../types";

export interface ExcavatorFleet {
  /** [1/day] whole loops one excavator completes in its operating hours */
  tripsPerDay: number;
  /** [kg/day] soil one excavator moves */
  kgPerDayEach: number;
  /** [1] whole excavators, at least one */
  count: number;
  /** [kg] */
  massKg: number;
}

/**
 * Whole RASSOR-class excavators for the soil a plant moves (Guerrero-Gonzalez
 * & Zabel 2023, Sec. 3.4.1). Each loads at the mine, unloads at the plant,
 * carries tailings to the disposal site, and returns: three legs of the haul
 * distance per trip, plus digging and dumping. Only whole trips fit in a
 * shift, and only whole vehicles land.
 */
export function excavatorFleet(params: SimParams, soilMovedKgPerDay: number): ExcavatorFleet {
  const tripSeconds = (3 * params.haulDistanceM) / params.excavatorSpeedMps + params.excavatorLoadingMin * 60;
  const tripsPerDay = Math.max(1, Math.floor((params.excavatorHoursPerDay * 3600) / tripSeconds));
  const kgPerDayEach = tripsPerDay * params.excavatorPayloadKg;
  const count = Math.max(1, Math.ceil(soilMovedKgPerDay / kgPerDayEach));
  return { tripsPerDay, kgPerDayEach, count, massKg: count * params.excavatorMassKg };
}
