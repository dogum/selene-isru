import { describe, expect, test } from "vitest";
import { normalizeParams, PHYSICAL_CONSTANTS, refuelTimeline, simulate, sortiePropellantKg } from "../src/index";
import type { SimParams } from "../src/types";

function run(input: Partial<SimParams>): { params: SimParams; result: ReturnType<typeof simulate> } {
  const params = normalizeParams(input).params;
  return { params, result: simulate(params) };
}

function expectRel(actual: number, expected: number, relTol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1e-9, Math.abs(expected) * relTol));
}

const EQUATORIAL: Partial<SimParams> = { refuelDemand: "lander" };
const PROPELLANT: Partial<SimParams> = { site: "polar", polarProduct: "propellant", refuelDemand: "lander" };

describe("refuelling demand", () => {
  test("each leg of a sortie closes the rocket equation", () => {
    const { params } = run(EQUATORIAL);
    const sortie = sortiePropellantKg(params);
    const massRatio = (dvMPerS: number) => Math.exp(dvMPerS / (params.IspReusable * PHYSICAL_CONSTANTS.g0.value));
    // Landing: wet mass with the down cargo over dry mass with it.
    const landed = params.MdryReusable + params.McargoDown;
    expectRel((landed + sortie.descentKg) / landed, massRatio(params.dvDescent), 1e-12);
    // Climbing: it carries the up cargo and the propellant for its return.
    const atOrbit = params.MdryReusable + params.McargoUp + sortie.descentKg;
    expectRel((atOrbit + sortie.ascentKg) / atOrbit, massRatio(params.dvAscent), 1e-12);
    expectRel(sortie.oxidizerKg / sortie.fuelKg, params.mixtureRatio, 1e-12);
    expectRel(sortie.oxidizerKg + sortie.fuelKg, sortie.totalKg, 1e-12);
  });

  test("the plant supplies each component up to its demand and Earth the rest", () => {
    for (const input of [EQUATORIAL, { ...EQUATORIAL, sortiesPerYear: 20 }, PROPELLANT, { ...PROPELLANT, sortiesPerYear: 8 }]) {
      const { params, result } = run(input);
      const refuel = result.refuel!;
      expect(refuel.isruO2KgPerDay).toBe(Math.min(refuel.supplyO2KgPerDay, refuel.demandO2KgPerDay));
      expect(refuel.isruFuelKgPerDay).toBe(Math.min(refuel.supplyH2KgPerDay, refuel.demandFuelKgPerDay));
      const demand = refuel.demandO2KgPerDay + refuel.demandFuelKgPerDay;
      expectRel(refuel.usedKgPerDay + refuel.earthPropellantKgPerYear / 365, demand, 1e-12);
      expectRel(refuel.demandO2KgPerDay * 365, refuel.oxidizerPerSortieKg * params.sortiesPerYear, 1e-12);
      expect(refuel.surplusKgPerDay).toBeGreaterThanOrEqual(0);
    }
    // The equatorial plant makes no hydrogen, so all the fuel comes from Earth.
    const equatorial = run(EQUATORIAL).result.refuel!;
    expect(equatorial.isruFuelKgPerDay).toBe(0);
    expectRel(equatorial.isruShare, run(EQUATORIAL).params.mixtureRatio / (1 + run(EQUATORIAL).params.mixtureRatio), 1e-12);
  });

  test("the ledger credits only the product the demand uses", () => {
    const { params, result } = run(EQUATORIAL);
    const { campaign, refuel } = result;
    expect(campaign.usedKgPerDay).toBe(refuel!.usedKgPerDay);
    expect(campaign.usedKgPerDay).toBeLessThan(campaign.deliveredKgPerDay);
    const operatingDays = params.missionYears * 365;
    expectRel(campaign.leoMassSavedKg, params.gearRatio * campaign.usedKgPerDay * operatingDays, 1e-12);
    expectRel(campaign.cumulativeUsedKg, campaign.usedKgPerDay * operatingDays, 1e-12);
    // One crewed sortie a year uses about a ninth of a 1 t/day plant.
    expect(campaign.paysBackInCampaign).toBe(false);

    // Without a demand every delivered kilogram counts.
    const free = run({}).result.campaign;
    expect(free.usedKgPerDay).toBe(free.deliveredKgPerDay);
  });

  test("with a demand, oxygen beyond the mixture ratio is useful because Earth tops up the hydrogen", () => {
    const water = run({ ...PROPELLANT, refuelDemand: "none" }).result.campaign;
    const tanker = run({ ...PROPELLANT, sortiesPerYear: 20 }).result;
    // At 20 sorties a year both components are short, so all of each is used.
    expect(tanker.refuel!.surplusKgPerDay).toBeCloseTo(0, 9);
    expectRel(
      tanker.campaign.usedKgPerDay,
      tanker.refuel!.supplyO2KgPerDay + tanker.refuel!.supplyH2KgPerDay,
      1e-12
    );
    expect(tanker.campaign.usedKgPerDay).toBeGreaterThan(water.usedKgPerDay);
  });

  test("the LOX and LH2 stores hold at least one sortie's load, and their mass follows", () => {
    const base = run({ site: "polar", polarProduct: "propellant" }).result;
    const { params, result } = run(PROPELLANT);
    const store = (r: typeof result, stream: string) => r.cryo.inventories.find((inventory) => inventory.stream === stream)!;
    expect(store(result, "lox").reserveInventoryKg).toBeGreaterThanOrEqual(result.refuel!.oxidizerPerSortieKg);
    expect(store(result, "lh2").reserveInventoryKg).toBe(result.refuel!.fuelPerSortieKg);
    // The LH2 store grows past its reserve days, and its mass with it.
    expect(store(base, "lh2").reserveInventoryKg).toBeLessThan(result.refuel!.fuelPerSortieKg);
    expectRel(store(result, "lh2").storageMassKg, (params.kCryoMass * result.refuel!.fuelPerSortieKg) / params.reserveDays, 1e-12);
    expect(result.logistics.totalInfraMassKg).toBeGreaterThan(base.logistics.totalInfraMassKg);
  });

  test("a one-stream storage what-if holds the whole sortie load of the plant's product", () => {
    for (const storageStream of ["custom", "lh2", "lox"] as const) {
      const equatorial = run({ ...EQUATORIAL, storageStream }).result;
      const [store] = equatorial.cryo.inventories;
      // At the equator the product is oxygen, whatever the stored stream is called.
      expect(store!.reserveInventoryKg, storageStream).toBe(equatorial.refuel!.oxidizerPerSortieKg);
      const propellant = run({ ...PROPELLANT, storageStream }).result;
      const [tank] = propellant.cryo.inventories;
      expectRel(tank!.reserveInventoryKg, propellant.refuel!.oxidizerPerSortieKg + propellant.refuel!.fuelPerSortieKg, 1e-12);
    }
  });

  test("a one-stream store's loss comes off both gases the demand draws on", () => {
    for (const storageStream of ["lox", "lh2"] as const) {
      const { params, result } = run({ ...PROPELLANT, storageStream, cryoControlMode: "passive" });
      const [store] = result.cryo.inventories;
      expect(store!.actualLossKgPerDay, storageStream).toBeGreaterThan(1);
      const { o2KgPerDay: o2, h2KgPerDay: h2 } = result.production;
      const kept = 1 - store!.actualLossKgPerDay / (o2 + h2);
      expectRel(result.refuel!.supplyO2KgPerDay, o2 * kept * params.plantAvailability, 1e-12);
      expectRel(result.refuel!.supplyH2KgPerDay, h2 * kept * params.plantAvailability, 1e-12);
    }
  });

  test("a demand changes nothing where the plant makes no lander propellant", () => {
    for (const site of [{ site: "polar" as const }, { site: "polar" as const, enableSabatier: true }]) {
      const without = run(site).result;
      const withDemand = run({ ...site, refuelDemand: "lander", sortiesPerYear: 12, McargoDown: 1000 }).result;
      expect(withDemand.refuel).toBeNull();
      expect(withDemand).toEqual(without);
    }
  });

  test("a sortie larger than the lander's tanks is flagged", () => {
    const fits = run(EQUATORIAL).result;
    expect(fits.warnings.some((warning) => warning.id === "refuel-tank-exceeded")).toBe(false);
    const nrho = run({ ...EQUATORIAL, dvDescent: 2700, dvAscent: 2700 }).result;
    const warning = nrho.warnings.find((item) => item.id === "refuel-tank-exceeded")!;
    expect(warning.value).toBe(nrho.refuel!.propellantPerSortieKg);
    expect(warning.limit).toBe(68040);
  });
});

describe("tank drawdown agrees with the demand", () => {
  test.each([
    ["oversized plant", EQUATORIAL],
    ["plant short of demand", { ...EQUATORIAL, sortiesPerYear: 20 }],
    ["propellant tanker", { ...PROPELLANT, sortiesPerYear: 8, McargoDown: 5000 }]
  ] as Array<[string, Partial<SimParams>]>)("%s: stores stay in bounds and sorties draw the demand's use", (_name, input) => {
    const { params, result } = run(input);
    const refuel = result.refuel!;
    const timeline = refuelTimeline(params, result);
    const capacity = (stream: string, load: number) =>
      Math.max(load, result.cryo.inventories.find((inventory) => inventory.stream === stream)?.reserveInventoryKg ?? 0);
    for (const point of timeline) {
      expect(point.o2Kg).toBeGreaterThanOrEqual(0);
      expect(point.h2Kg).toBeGreaterThanOrEqual(0);
      expect(point.o2Kg).toBeLessThanOrEqual(capacity("lox", refuel.oxidizerPerSortieKg) * (1 + 1e-12));
      expect(point.h2Kg).toBeLessThanOrEqual(capacity("lh2", refuel.fuelPerSortieKg) * (1 + 1e-12));
    }
    expect(timeline[0]!.tDays).toBe(result.campaign.firstProductDay);
    // Starting empty, the draw per sortie matches the use at steady rate.
    const befores = timeline.filter((point) => point.event.startsWith("before sortie"));
    const afters = timeline.filter((point) => /^sortie \d+$/.test(point.event));
    expect(befores.length).toBe(afters.length);
    expect(befores.length).toBeGreaterThanOrEqual(1);
    const interval = 365 / params.sortiesPerYear;
    for (let i = 1; i < befores.length; i += 1) {
      const drawnO2 = befores[i]!.o2Kg - afters[i]!.o2Kg;
      const drawnH2 = befores[i]!.h2Kg - afters[i]!.h2Kg;
      expectRel(drawnO2, refuel.isruO2KgPerDay * interval, 1e-9);
      expectRel(drawnH2, refuel.isruFuelKgPerDay * interval, 1e-9);
    }
  });

  test("no demand, no drawdown", () => {
    const { params, result } = run({});
    expect(refuelTimeline(params, result)).toEqual([]);
  });
});
