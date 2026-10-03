import { PHYSICAL_CONSTANTS } from "../constants";
import type { CampaignResult, RefuelResult, SimParams, StorageInventory, Warning } from "../types";

const DAYS_PER_YEAR = 365;

/**
 * Refuelling demand: a reusable LOX/LH2 lander based at the plant flies
 * `sortiesPerYear` round trips to a staging orbit, loading all its propellant
 * on the surface. It climbs with `McargoUp` and the propellant for its return,
 * then lands with `McargoDown`. The plant's oxygen (and hydrogen, when it
 * makes it) supplies that load at `mixtureRatio`; Earth supplies the rest.
 */
export interface SortiePropellant {
  /** [kg] */
  descentKg: number;
  /** [kg] */
  ascentKg: number;
  /** [kg] */
  totalKg: number;
  /** [kg] */
  oxidizerKg: number;
  /** [kg] */
  fuelKg: number;
}

/** Ideal rocket equation, two legs, all propellant loaded on the surface. */
export function sortiePropellantKg(params: SimParams): SortiePropellant {
  const exhaustVelocity = params.IspReusable * PHYSICAL_CONSTANTS.g0.value;
  const descentKg =
    (params.MdryReusable + params.McargoDown) * (Math.exp(params.dvDescent / exhaustVelocity) - 1);
  const ascentKg =
    (params.MdryReusable + params.McargoUp + descentKg) * (Math.exp(params.dvAscent / exhaustVelocity) - 1);
  const totalKg = descentKg + ascentKg;
  return {
    descentKg,
    ascentKg,
    totalKg,
    oxidizerKg: (totalKg * params.mixtureRatio) / (1 + params.mixtureRatio),
    fuelKg: totalKg / (1 + params.mixtureRatio)
  };
}

/** Product the plant can offer the demand at full availability, after storage losses [kg/day]. */
export interface RefuelSupply {
  o2KgPerDay: number;
  h2KgPerDay: number;
}

export function simulateRefuel(
  params: SimParams,
  sortie: SortiePropellant,
  supply: RefuelSupply
): { refuel: RefuelResult; warnings: Warning[] } {
  const demandO2KgPerDay = (sortie.oxidizerKg * params.sortiesPerYear) / DAYS_PER_YEAR;
  const demandFuelKgPerDay = (sortie.fuelKg * params.sortiesPerYear) / DAYS_PER_YEAR;
  const availableO2 = supply.o2KgPerDay * params.plantAvailability;
  const availableH2 = supply.h2KgPerDay * params.plantAvailability;
  // Each component is used up to its own demand; Earth makes up either shortfall.
  const isruO2KgPerDay = Math.min(availableO2, demandO2KgPerDay);
  const isruFuelKgPerDay = Math.min(availableH2, demandFuelKgPerDay);
  const usedKgPerDay = isruO2KgPerDay + isruFuelKgPerDay;
  const demandKgPerDay = demandO2KgPerDay + demandFuelKgPerDay;

  const warnings: Warning[] = [];
  if (sortie.totalKg > params.MtankReusable) {
    warnings.push({
      id: "refuel-tank-exceeded",
      severity: "caution",
      module: "refuel",
      message: "A sortie needs more propellant than the reusable lander's tanks hold; the demand assumes the load fits.",
      value: sortie.totalKg,
      limit: params.MtankReusable
    });
  }

  return {
    refuel: {
      descentPropellantKg: sortie.descentKg,
      ascentPropellantKg: sortie.ascentKg,
      propellantPerSortieKg: sortie.totalKg,
      oxidizerPerSortieKg: sortie.oxidizerKg,
      fuelPerSortieKg: sortie.fuelKg,
      demandO2KgPerDay,
      demandFuelKgPerDay,
      supplyO2KgPerDay: availableO2,
      supplyH2KgPerDay: availableH2,
      isruO2KgPerDay,
      isruFuelKgPerDay,
      isruShare: demandKgPerDay > 0 ? usedKgPerDay / demandKgPerDay : 0,
      earthPropellantKgPerYear: (demandKgPerDay - usedKgPerDay) * DAYS_PER_YEAR,
      surplusKgPerDay: availableO2 + availableH2 - usedKgPerDay,
      oxidizerSortiesPerYear: sortie.oxidizerKg > 0 ? (availableO2 * DAYS_PER_YEAR) / sortie.oxidizerKg : 0,
      fuelSortiesPerYear: sortie.fuelKg > 0 ? (availableH2 * DAYS_PER_YEAR) / sortie.fuelKg : 0,
      usedKgPerDay,
      sortieIntervalDays: DAYS_PER_YEAR / params.sortiesPerYear
    },
    warnings
  };
}

/** A result carrying the demand and the stores: `SimResult` satisfies it. */
export interface RefuelSource {
  campaign: Pick<CampaignResult, "firstProductDay" | "campaignEndDay">;
  cryo: { inventories: readonly Pick<StorageInventory, "role" | "stream" | "reserveInventoryKg">[] };
  refuel: RefuelResult | null;
}

export interface RefuelTimelinePoint {
  /** days from the first landing [day] */
  tDays: number;
  /** LOX in store [kg] */
  o2Kg: number;
  /** LH2 in store; 0 when the plant makes none [kg] */
  h2Kg: number;
  /** what happens at this time, or "" */
  event: string;
}

/** Sorties drawn on the stores; enough to show the pattern settle. */
const MIN_HORIZON_DAYS = 2 * DAYS_PER_YEAR;
const HORIZON_SORTIES = 3;

/**
 * Tank drawdown: from production start (empty stores), each store fills at the
 * plant's rate after downtime up to its capacity, and every 365 /
 * `sortiesPerYear` days a sortie draws its load or whatever is there. Earth
 * supplies any shortfall. The store holds at least one sortie's load, so over
 * whole sorties the draw averages the demand's use of the plant.
 */
export function refuelTimeline(params: SimParams, source: RefuelSource): RefuelTimelinePoint[] {
  const { refuel, campaign } = source;
  if (refuel === null) return [];
  const loads = [refuel.oxidizerPerSortieKg, refuel.fuelPerSortieKg];
  const rates = [refuel.supplyO2KgPerDay, refuel.supplyH2KgPerDay];
  const capacities = storeCapacitiesKg(params, source, loads, rates);
  const interval = refuel.sortieIntervalDays;
  const operatingDays = campaign.campaignEndDay - campaign.firstProductDay;
  const horizon = Math.min(operatingDays, Math.max(MIN_HORIZON_DAYS, HORIZON_SORTIES * interval));
  const sorties = Math.floor(horizon / interval + 1e-9);
  const stores = loads.map((load, index) => ({ rate: rates[index] ?? 0, load, capacity: capacities[index] ?? load, level: 0 }));
  const points: RefuelTimelinePoint[] = [];
  const add = (t: number, levels: number[], event: string): void => {
    points.push({ tDays: campaign.firstProductDay + t, o2Kg: levels[0] ?? 0, h2Kg: levels[1] ?? 0, event });
  };
  add(0, [0, 0], "production start");
  for (let k = 0; k <= sorties; k += 1) {
    const start = k * interval;
    const end = Math.min((k + 1) * interval, horizon);
    if (end <= start) break;
    // A store that fills before the next sortie levels off there.
    const fills = stores
      .map((store) => (store.rate > 0 && store.level < store.capacity ? start + (store.capacity - store.level) / store.rate : Infinity))
      .filter((t) => t < end - 1e-9)
      .sort((a, b) => a - b);
    for (const t of fills) {
      add(t, stores.map((store) => Math.min(store.capacity, store.level + store.rate * (t - start))), "store full");
    }
    for (const store of stores) store.level = Math.min(store.capacity, store.level + store.rate * (end - start));
    if (end < (k + 1) * interval) {
      add(end, stores.map((store) => store.level), "");
      break;
    }
    add(end, stores.map((store) => store.level), `before sortie ${k + 1}`);
    for (const store of stores) store.level -= Math.min(store.level, store.load);
    add(end, stores.map((store) => store.level), `sortie ${k + 1}`);
  }
  return points;
}

/**
 * Capacity of the oxygen and hydrogen stores [kg]. Auto storage keeps LOX and
 * LH2 in stores of their own. A one-stream what-if store holds the plant's
 * whole product, so its capacity is shared between the components the plant
 * makes in proportion to their sortie loads, which keeps each at least one
 * load. Neither is ever less than its load.
 */
function storeCapacitiesKg(params: SimParams, source: RefuelSource, loads: number[], rates: number[]): number[] {
  if (params.storageStream === "auto") {
    return (["lox", "lh2"] as const).map((stream, index) => {
      const store = source.cryo.inventories.find((inventory) => inventory.role === "product" && inventory.stream === stream);
      return Math.max(loads[index] ?? 0, store === undefined ? 0 : store.reserveInventoryKg);
    });
  }
  const sharedKg = source.cryo.inventories
    .filter((inventory) => inventory.role === "product" || inventory.role === "custom")
    .reduce((total, inventory) => total + inventory.reserveInventoryKg, 0);
  const madeLoadKg = loads.reduce((total, load, index) => total + ((rates[index] ?? 0) > 0 ? load : 0), 0);
  return loads.map((load, index) =>
    (rates[index] ?? 0) > 0 && madeLoadKg > 0 ? Math.max(load, (sharedKg * load) / madeLoadKg) : load
  );
}
