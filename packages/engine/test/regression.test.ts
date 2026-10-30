import { describe, expect, test } from "vitest";
import {
  DEFAULTS,
  meltHeatJPerKg,
  oxideModelYield,
  payloadPerMissionKg,
  pCritKw,
  sabatierKp,
  secElecJPerKg,
  secSubJPerKg,
  shieldFullBalanceM,
  simulate,
  sizeToDemand
} from "../src/index";
import { simulateConstruction } from "../src/modules/construction";
import { simulatePower } from "../src/modules/power";
import type { SimParams } from "../src/types";

const J_PER_KWH = 3_600_000;

function expectRel(actual: number, expected: number, relTol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relTol);
}

function warningIds(result: { warnings: Array<{ id: string }> }): Set<string> {
  return new Set(result.warnings.map((warning) => warning.id));
}

describe("regression anchors", () => {
  test("matches the research-derived headline values", () => {
    const result = simulate({});

    expectRel(secElecJPerKg(4.2, 0.9) / J_PER_KWH, 15.63, 0.005);
    expectRel(result.electrolysis.xO2Effective, 0.225, 1e-9);
    expectRel(
      result.electrolysis.oxideYield.reduce((total, row) => total + row.o2KgPerKg, 0),
      result.electrolysis.xO2Effective,
      1e-12
    );
    expect(result.electrolysis.oxideYield.every((row) => row.decomposed)).toBe(true);
    expectRel(meltHeatJPerKg(DEFAULTS), 2_099_805, 1e-9);
    // v0.6 moved these from 24.78 kWh/kg and 1,032 kW: LOX conditioning is now
    // 1.32 kWh/kg, derived from NASA's polar propellant case, not 2.2 (uncited).
    // v0.9 moved them from 23.89 and 996 kW: mining costs 10.1 kJ per kg of
    // soil moved (a RASSOR fleet), not 120 kJ.
    expectRel(result.energy.secTotal_kWhPerKg, 23.76, 0.001);
    expectRel(result.energy.gridPowerW / 1000, 990.0, 0.001);
    expectRel(pCritKw(1500, 250, 30) ?? 0, 6.818, 0.001);
    expectRel(secSubJPerKg(0.005, 800, 40, 263) / J_PER_KWH, 10.7, 0.01);
    expectRel(secSubJPerKg(0.05, 800, 40, 263) / J_PER_KWH, 1.78, 0.01);
    expect(result.logistics.nMissions).toBe(1);
    expect(result.logistics.plantMassThroughputDays).toBe(result.logistics.totalInfraMassKg / 1000);
    // v0.9 moved this from 60.4: the excavation fleet is sized on soil moved,
    // 8.5 t -> 108 kg.
    expectRel(result.logistics.plantMassThroughputDays, 51.81, 0.001);
    expectRel(shieldFullBalanceM(101325, 3000), 20.85, 0.005);
    expect(payloadPerMissionKg(DEFAULTS)).toBeGreaterThanOrEqual(95_000);
    expect(payloadPerMissionKg(DEFAULTS)).toBeLessThanOrEqual(107_000);
    expect(result.construction.padsPerYear).toBeGreaterThanOrEqual(1.8);
    expect(result.construction.padsPerYear).toBeLessThanOrEqual(2.2);
    expect(sabatierKp(523)).toBeGreaterThan(sabatierKp(723));
    expect(sabatierKp(723)).toBeGreaterThan(0);
  });

  test("polar chain charges capture loss, heater loss, and extractor mass (v0.4)", () => {
    // v0.4 deliberately moved these from 2.814 kWh/kg and 19.5 t: the polar
    // chain had no capture loss, a lower-bound heater, and no extractor mass.
    // v0.9 moved them from 7.24 kWh/kg and 29.85 t: mining energy and fleet
    // scale with soil moved, overburden included. v0.12 moved landed mass
    // from 21.48 t: the fleet is 17 whole RASSORs, 1,122 kg against 1,085.
    const polar = simulate({ site: "polar" });
    expect(polar.production.regolithKgPerDay).toBeCloseTo(1000 / (0.05 * 0.75), 9);
    expectRel(polar.thermal.extractorMassKg, 4800, 1e-9);
    expectRel(polar.thermal.secSub_JPerKg! / J_PER_KWH, 1.78 / 0.75, 0.01);
    expectRel(polar.energy.secTotal_kWhPerKg, 6.478, 0.001);
    expectRel(polar.logistics.totalInfraMassKg / 1000, 21.52, 0.001);
    expect(polar.materials.maxAbsResidualKgPerDay).toBe(0);
  });

  test("campaign ledger pays the equatorial default back on day ~241 (v0.5)", () => {
    // v0.5 adds the ledger; no earlier number moves. Payback is commissioning
    // plus one 1,100 t lander divided by the daily net LEO-mass saving. v0.9
    // moved it from day 242.0 and the return from 6.63: a lighter fleet needs
    // fewer spares.
    const { logistics, campaign } = simulate({});
    const leoPerKg = DEFAULTS.M0leo / (DEFAULTS.etaPack * logistics.payloadPerMissionKg);
    const netPerDay =
      DEFAULTS.gearRatio * DEFAULTS.targetKgPerDay * DEFAULTS.plantAvailability -
      (leoPerKg * DEFAULTS.sparesFracPerYear * logistics.totalInfraMassKg) / 365;
    expectRel(campaign.leoMassPerLandedKg, leoPerKg, 1e-12);
    expectRel(campaign.paybackDays!, DEFAULTS.commissioningDays + DEFAULTS.M0leo / netPerDay, 1e-12);
    expectRel(campaign.paybackDays!, 240.8, 0.001);
    expectRel(campaign.returnRatio, 6.882, 0.001);
    expectRel(campaign.leoMassPerLandedKg, 12.82, 0.001);
    expect(campaign.paysBackInCampaign).toBe(true);
    // The Sabatier loop's CO2 is landed from Earth and outweighs its products' saving.
    // v0.13 moved the return from 0.796: the loop's own plant mass is lighter.
    const sabatier = simulate({ site: "polar", enableSabatier: true }).campaign;
    expect(sabatier.paybackDays).toBeNull();
    expectRel(sabatier.returnRatio, 0.7968, 0.001);  // v0.14: electrolysis balance of plant
  });

  test("polar propellant mode splits water into LOX and LH2 (v0.6)", () => {
    const propellant = simulate({ site: "polar", polarProduct: "propellant" });
    const { production, cryo, energy, logistics, campaign } = propellant;
    // 1,000 kg/day of water gives 888.9 kg O2 and 111.1 kg H2; at O/F 6 the
    // hydrogen sets 777.8 kg/day of propellant and 222.2 kg/day of O2 is surplus.
    expectRel(production.o2KgPerDay, 888.9, 0.001);
    expectRel(production.h2KgPerDay, 111.1, 0.001);
    expectRel(production.propellantKgPerDay, 7 * production.h2KgPerDay, 1e-12);
    expectRel(production.excessO2KgPerDay, production.o2KgPerDay - 6 * production.h2KgPerDay, 1e-12);
    expect(cryo.inventories.map((item) => item.stream)).toEqual(["water-ice", "lox", "lh2"]);
    expectRel(cryo.inventories[2]!.liquefierMassKg, 233 * production.h2KgPerDay, 1e-12);
    // v0.9 moved these from 20.78 kWh/kg, 82.35 t and day 311.3.
    expectRel(energy.secTotal_kWhPerKg, 20.62, 0.001);  // v0.14: electrolysis balance of plant
    expectRel(logistics.totalInfraMassKg / 1000, 74.77, 0.001);  // v0.14: electrolysis balance of plant
    expectRel(campaign.paybackDays!, 309.4, 0.001);  // v0.14: electrolysis balance of plant
    // Leverage and throughput days are measured against usable propellant,
    // not the water processed (deliberately moved from 133x and 82.4 days;
    // v0.9 then moved leverage from 103.4x).
    expect(logistics.productKgPerDay).toBe(production.propellantKgPerDay);
    expectRel(logistics.plantMassThroughputDays, logistics.totalInfraMassKg / production.propellantKgPerDay, 1e-12);
    expectRel(logistics.leverageL, 113.9, 0.001);  // v0.14: electrolysis balance of plant
    // The Sabatier loop is measured against its products, imported carbon included.
    const sabatier = simulate({ site: "polar", enableSabatier: true });
    const p = sabatier.production;
    expect(sabatier.logistics.productKgPerDay).toBe(p.o2KgPerDay + p.ch4KgPerDay + p.h2KgPerDay);
    // v0.13 moved it from 213.4x: the loop no longer borrows the MRE reactor mass.
    expectRel(sabatier.logistics.leverageL, 221.5, 0.001);  // v0.14: electrolysis balance of plant
    expect(propellant.materials.maxAbsResidualKgPerDay).toBe(0);
    expect(energy.maxAbsResidualW).toBe(0);
  });

  test("refuelling demand: one crewed sortie a year leaves the default plant idle (v0.7)", () => {
    // Chen et al. 2021's LH2/LOX vehicle flying their crewed sortie (30 t down,
    // 5 t up) from LLO burns 42.6 t, of which 36.5 t is oxygen: 100 kg/day at
    // one sortie a year, a ninth of the plant's 900 kg/day after downtime.
    const crew = simulate({ refuelDemand: "lander" });
    expectRel(crew.refuel!.propellantPerSortieKg, 42_595, 0.001);
    expectRel(crew.refuel!.demandO2KgPerDay, 100.0, 0.001);
    expectRel(crew.refuel!.isruShare, 6 / 7, 1e-12);
    // v0.9 moved these from 61.69 t and 0.732.
    expectRel(crew.logistics.totalInfraMassKg / 1000, 53.13, 0.001);
    expect(crew.campaign.paysBackInCampaign).toBe(false);
    expectRel(crew.campaign.returnRatio, 0.760, 0.001);
    // Nine sorties a year use the whole plant. The ledger credits each sortie
    // when it flies, so payback falls on the sixth, on day 273, not on the
    // v0.5 day 242 that crediting by the day would give. (v0.9 moved the
    // return from 6.59.)
    const matched = simulate({ refuelDemand: "lander", sortiesPerYear: 9 });
    expectRel(matched.campaign.paybackDays!, 273.3, 0.001);
    expectRel(matched.campaign.returnRatio, 6.841, 0.001);
  });

  test("ilmenite reduction: Eagle's mare soil plant uses less power but lands more (v0.8)", () => {
    // New and deliberate: soil chain from Eagle 1988 Table 6-1, bulk mining
    // from Guerrero-Gonzalez & Zabel 2023, beneficiation and reactor from
    // Eagle Table 6-5.
    const ilmenite = simulate({ equatorialProcess: "ilmenite" });
    expectRel(ilmenite.ilmenite!.soilPerKgO2, 327.3, 0.001);
    expectRel(ilmenite.energy.secTotal_kWhPerKg, 20.49, 0.001);  // v0.14: electrolysis balance of plant
    expectRel(ilmenite.energy.gridPowerW / 1000, 853.6, 0.001);
    expectRel(ilmenite.logistics.totalInfraMassKg / 1000, 94.60, 0.001);  // v0.14: electrolysis balance of plant
    expectRel(ilmenite.campaign.paybackDays!, 585.8, 0.001);  // v0.14: electrolysis balance of plant
    // High-Ti mare soil halves the soil handled and matches MRE's payback.
    const highTi = simulate({ equatorialProcess: "ilmenite", fIlmenite: 0.15 });
    expectRel(highTi.campaign.paybackDays!, 243.3, 0.001);
  });

  test("excavation scales with soil moved, polar overburden included (v0.9)", () => {
    // Mining energy and fleet come from the RASSOR fleet of Guerrero-Gonzalez &
    // Zabel 2023; the polar pit mine also strips Kleinhenz & Paz 2020's 20 cm
    // of dry overburden over 30 cm of icy regolith.
    const equatorial = simulate({});
    const soil = equatorial.production.regolithKgPerDay;
    expect(equatorial.excavation.soilMovedKgPerDay).toBe(soil);
    expect(equatorial.excavation.overburdenKgPerDay).toBe(0);
    // v0.12: whole RASSORs (2 x 66 kg) replace the continuous 108.4 kg fleet.
    expect(equatorial.excavation.fleetMassKg).toBe(132);
    const polar = simulate({ site: "polar" });
    const ore = polar.production.regolithKgPerDay;
    expectRel(polar.excavation.overburdenKgPerDay, 0.667 * ore, 1e-12);
    expectRel(polar.excavation.soilMovedKgPerDay, 1.667 * ore, 1e-12);
    expect(polar.excavation.fleetMassKg).toBe(1122);
    // A lean deposit no longer pays 120 kJ per kg of soil: 24.54 -> 20.72 kWh/kg.
    expectRel(simulate({ site: "polar", chiIce: 0.01 }).energy.secTotal_kWhPerKg, 20.72, 0.001);
  });

  test("whole excavators sized from RASSOR kinematics (v0.12)", () => {
    // New and deliberate: Guerrero-Gonzalez & Zabel 2023's RASSOR makes 34
    // whole 300 m loops in a 16 h shift, 2.72 t/day, and only whole vehicles
    // land. Most landed masses move by tens of kilograms.
    const equatorial = simulate({});
    expect(equatorial.excavation.excavatorTripsPerDay).toBe(34);
    expect(equatorial.excavation.excavatorKgPerDay).toBe(2720);
    expect(equatorial.excavation.excavatorCount).toBe(2);
    expectRel(equatorial.logistics.totalInfraMassKg / 1000, 51.83, 0.001);
    // A small plant still lands a whole excavator.
    const small = simulate({ targetKgPerDay: 100 });
    expect(small.excavation.excavatorCount).toBe(1);
    expect(small.excavation.fleetMassKg).toBe(66);
    // Haul distance sets the fleet: 500 m legs leave 9 trips a day, so 7 vehicles.
    const far = simulate({ haulDistanceM: 500 });
    expect(far.excavation.excavatorTripsPerDay).toBe(9);
    expect(far.excavation.excavatorCount).toBe(7);
    expect(far.energy.secTotal_kWhPerKg).toBe(equatorial.energy.secTotal_kWhPerKg);
    // The ilmenite plant's 327 t/day takes 121 vehicles; its landing count
    // and payback do not move.
    const ilmenite = simulate({ equatorialProcess: "ilmenite" });
    expect(ilmenite.excavation.excavatorCount).toBe(121);
    expect(ilmenite.ilmenite!.miningMassKg).toBe(ilmenite.excavation.fleetMassKg);
    expectRel(ilmenite.campaign.paybackDays!, 585.8, 0.001);  // v0.14: electrolysis balance of plant
  });

  test("Sabatier plant mass is its own, sized on methane (v0.13)", () => {
    // New and deliberate: the loop no longer borrows the MRE reactor's 12 kg
    // per kg/day of water. It carries the water electrolyzer, a Sabatier block
    // of 33 kg per kg/day of methane, and a methane liquefier of 3.4
    // (Kleinhenz & Paz 2017).
    const sabatier = simulate({ site: "polar", enableSabatier: true });
    const plant = sabatier.logistics.manifest.find((row) => row.subsystem === "reactor/plant")!.massKg;
    expectRel(sabatier.production.ch4KgPerDay, 211.1, 0.001);
    expectRel(plant / 1000, 13.23, 0.001);
    expectRel(sabatier.logistics.totalInfraMassKg / 1000, 54.65, 0.001);  // v0.14: electrolysis balance of plant
    // MRE and polar water plants do not move.
    expectRel(simulate({}).logistics.totalInfraMassKg / 1000, 51.83, 0.001);
  });

  test("the fission radiator is charged by its area (v0.17)", () => {
    // New and deliberate: fission mass is shield + alphaSpecific per kW +
    // kRadiatorKgPerM2 per m^2 of radiator. alphaSpecific drops from 30 to
    // 28 kg/kW, the share the default 600 K radiator carried, so the default
    // moves by 0.02 kg/kW.
    const base = simulate({});
    expectRel(base.power.radiatorM2, 506.8, 0.001);
    expectRel(base.power.radiatorMassKg / 1000, 1.961, 0.001);
    expectRel(base.power.nuclearSpecificKgPerKw, 29.98, 0.001);
    expectRel(base.power.nuclearMassKg / 1000, 31.18, 0.001);
    expectRel(base.logistics.totalInfraMassKg / 1000, 51.81, 0.001);
    // The radiator now follows its temperature: at 400 K it is 1,924 m^2 and 7.4 t.
    const cold = simulate({ Tsink: 400 });
    expectRel(cold.power.radiatorMassKg / 1000, 7.446, 0.001);
    // v0.18: the colder cycle is more efficient, so its reactor is lighter:
    // 36.66 -> 33.18 t of fission system, 57.29 -> 53.82 t landed.
    expectRel(cold.power.nuclearMassKg / 1000, 33.18, 0.001);
    expectRel(cold.logistics.totalInfraMassKg / 1000, 53.82, 0.001);
  });

  test("the fission reactor is charged on its heat (v0.18)", () => {
    // New and deliberate: alphaSpecific (kg/kWe) is split into the reactor per
    // kW of heat and conversion per kW of output, in NASA FSP's proportion and
    // at the old 28 kg/kWe at the default 27.5% efficiency.
    const base = simulate({});
    expectRel(base.power.fissionThermalW / 1e6, 3.600, 0.001);
    expectRel(DEFAULTS.kReactorKgPerKwt * (base.power.fissionThermalW / 1000) / 1000, 13.93, 0.001);
    expectRel(base.power.nuclearMassKg / 1000, 31.18, 0.001);
    // The power trade's slope: reactor on the heat, conversion on the output, radiator on its area.
    for (const run of [base, simulate({ Tsink: 400 })]) {
      const kw = run.energy.gridPowerW / 1000;
      const slope =
        DEFAULTS.kReactorKgPerKwt * (run.power.fissionThermalW / 1000) / kw +
        DEFAULTS.kConversionKgPerKwe +
        DEFAULTS.kRadiatorKgPerM2 * run.power.radiatorM2 / kw;
      expectRel(run.power.nuclearSpecificKgPerKw, slope, 1e-9);
    }
    // The radiator temperature now has an optimum: colder grows the radiator,
    // hotter grows the reactor. The default plant is lightest near 520 K.
    const at = (Tsink: number) => simulate({ Tsink }).power.nuclearMassKg;
    expect(at(520)).toBeLessThan(at(400));
    expect(at(520)).toBeLessThan(at(600));
    expectRel(at(520) / 1000, 30.57, 0.001);
  });

  test("sizing the plant to its refuelling demand (v0.16)", () => {
    // New and deliberate: sizeToDemand finds the smallest target at which every
    // component the plant makes meets the lander's demand. simulate() does not
    // change, so no earlier anchor moves.
    const crew = { refuelDemand: "lander" } as const;
    const crewSize = sizeToDemand(crew)!;
    expectRel(crewSize.targetKgPerDay, 111.14, 0.001);
    const crewSized = simulate({ ...crew, targetKgPerDay: crewSize.targetKgPerDay });
    expectRel(crewSized.logistics.totalInfraMassKg / 1000, 13.91, 0.001);
    // A right-sized plant for one crewed sortie a year still does not pay back.
    expectRel(crewSized.campaign.returnRatio, 0.9211, 0.001);
    expect(crewSized.campaign.paysBackInCampaign).toBe(false);
    // At the pole the hydrogen sets the size; it pays back on the campaign's
    // last sortie, where 1 t/day never did.
    const polar = { site: "polar", polarProduct: "propellant", refuelDemand: "lander" } as const;
    const polarSize = sizeToDemand(polar)!;
    expect(polarSize.limitedBy).toBe("hydrogen");
    expectRel(polarSize.targetKgPerDay, 166.71, 0.001);
    const polarSized = simulate({ ...polar, targetKgPerDay: polarSize.targetKgPerDay });
    expectRel(polarSized.logistics.totalInfraMassKg / 1000, 22.42, 0.001);
    expectRel(polarSized.campaign.returnRatio, 1.0275, 0.001);
    expect(polarSized.campaign.paybackDays).toBe(polarSized.campaign.campaignEndDay);
    expect(simulate(polar).campaign.paysBackInCampaign).toBe(false);
    // Twenty sorties a year need 3.3 t/day: three landings and a lower return, but more saved.
    const busy = { ...polar, sortiesPerYear: 20 };
    const busySized = simulate({ ...busy, targetKgPerDay: sizeToDemand(busy)!.targetKgPerDay });
    expectRel(busySized.production.targetKgPerDay, 3334.3, 0.001);
    expect(busySized.logistics.nMissions).toBe(3);
    expectRel(busySized.campaign.returnRatio, 5.250, 0.001);
    expect(busySized.campaign.netLeoMassKg).toBeGreaterThan(simulate(busy).campaign.netLeoMassKg);
  });

  test("the initial overburden strip runs alongside commissioning (v0.15)", () => {
    // New and deliberate: before the first ore the whole fleet strips the cover
    // over the first stripAheadDays of mining. At the defaults the polar strip
    // (11.5 days) and the basalt strip (15.7) finish inside commissioning, so
    // no earlier number moves.
    const polar = simulate({ site: "polar" });
    expectRel(polar.excavation.initialStripDays, 11.54, 0.001);
    expect(polar.campaign.firstProductDay).toBe(DEFAULTS.commissioningDays);
    expect(simulate({}).excavation.initialStripDays).toBe(0);
    // A longer strip delays production: 90 days of basalt cover takes 47.1 days.
    const basalt = simulate({ equatorialProcess: "ilmenite", ilmFeed: "basalt", stripAheadDays: 90 });
    expectRel(basalt.campaign.firstProductDay, 47.09, 0.001);
    expectRel(basalt.campaign.paybackDays!, 262.7, 0.001);
    // NASA's sequencing strips the whole 223-day pit first: 266 t at two RASSORs' 5.44 t/day.
    const nasa = simulate({ site: "polar", polarProduct: "propellant", targetKgPerDay: 67.26, plantAvailability: 0.611, commissioningDays: 2, stripAheadDays: 223 });
    expectRel(nasa.excavation.initialStripDays, (223 * nasa.excavation.overburdenKgPerDay) / (2 * 2720), 1e-12);
    expectRel(nasa.campaign.firstProductDay, 49.04, 0.001);
  });

  test("ilmenite conversion from kinetics and reactor mass from bed hold-up (v0.10)", () => {
    // New and deliberate. Eagle's design point is unchanged: 90% at 1,000 °C
    // and 4 h, and an 18.6 t reactor at 1 t/day, so v0.8's anchors hold.
    const at = (patch: Partial<SimParams>) => simulate({ equatorialProcess: "ilmenite", ...patch });
    const base = at({});
    expectRel(base.ilmenite!.conversion, 0.9, 1e-12);
    expectRel(base.ilmenite!.reactorMassKg / 1000, 18.60, 0.001);
    // 100 °C cooler reduces 73%, so the plant mines and heats more soil.
    const cool = at({ TIlmReactor: 1173 });
    expectRel(cool.ilmenite!.conversion, 0.7286, 0.001);
    expectRel(cool.energy.secTotal_kWhPerKg, 22.82, 0.001);  // v0.14: electrolysis balance of plant
    // A 1 h stay reduces 53%; 8 h reduces 97% and lands less despite a heavier bed.
    expectRel(at({ tIlmResidenceH: 1 }).ilmenite!.conversion, 0.5327, 0.001);
    const long = at({ tIlmResidenceH: 8 });
    expectRel(long.ilmenite!.conversion, 0.9724, 0.001);
    expectRel(long.logistics.totalInfraMassKg / 1000, 91.68, 0.001);  // v0.14: electrolysis balance of plant
    // Feeding Eagle's mare soil unseparated: a 31.5 t reactor and 44.3 kWh/kg.
    const unseparated = at({ ilmConcentrateGrade: 0.075 });
    expectRel(unseparated.ilmenite!.reactorMassKg / 1000, 31.48, 0.001);
    expectRel(unseparated.energy.secTotal_kWhPerKg, 45.01, 0.001);  // v0.14: electrolysis balance of plant
  });

  test("basalt feed for the ilmenite plant (v0.11)", () => {
    // New and deliberate: Eagle's crushed high-Ti basalt, 33 wt% ilmenite.
    // The soil route does not move.
    const basalt = simulate({ equatorialProcess: "ilmenite", ilmFeed: "basalt" });
    const ilmenite = basalt.ilmenite!;
    expectRel(ilmenite.soilPerKgO2, 186.3, 0.001);
    expectRel(ilmenite.basaltFedKgPerDay / 1000, 88.49, 0.001);
    // 1.1 kg of overburden per kg of layer mined, moved by the shared fleet.
    expectRel(basalt.excavation.overburdenKgPerDay, 1.1 * ilmenite.soilKgPerDay, 1e-12);
    expectRel(basalt.energy.secTotal_kWhPerKg, 16.91, 0.001);  // v0.14: electrolysis balance of plant
    expectRel(basalt.energy.gridPowerW / 1000, 704.6, 0.001);
    expectRel(basalt.logistics.totalInfraMassKg / 1000, 85.04, 0.001);  // v0.14: electrolysis balance of plant
    // It fits one lander where the soil plant needs two: payback day 586 -> 246.
    expect(basalt.logistics.nMissions).toBe(1);
    expectRel(basalt.campaign.paybackDays!, 245.6, 0.001);  // v0.14: electrolysis balance of plant
    // Fed whole, the ground basalt loses nothing to liberation: less is mined.
    const unseparated = simulate({ equatorialProcess: "ilmenite", ilmFeed: "basalt", ilmConcentrateGrade: 0.33 });
    expectRel(unseparated.ilmenite!.soilPerKgO2, 118.1, 0.001);
    expectRel(unseparated.ilmenite!.reactorMassKg / 1000, 20.62, 0.001);
  });

  test("keeps the v1 aggregate electrolysis path reachable", () => {
    const fallback = simulate({ oxideModel: false });
    const direct = oxideModelYield({ ...DEFAULTS, oxideModel: false });
    expectRel(fallback.electrolysis.xO2Effective, DEFAULTS.xO2 * DEFAULTS.fExtract, 1e-12);
    expect(fallback.electrolysis.xO2Effective).toBe(direct.xO2Effective);
    expectRel(fallback.energy.secTotal_kWhPerKg, simulate({}).energy.secTotal_kWhPerKg, 1e-9);
  });
});

describe("warnings", () => {
  test("public simulate() emits reachable warnings", () => {
    expect(warningIds(simulate({ jOperating: 10000, Dox: 1e-11 })).has("anode-current")).toBe(true);
    expect(warningIds(simulate({ castDeltaT: 200 })).has("thermal-stress")).toBe(true);
    expect(warningIds(simulate({ targetKgPerDay: 1 })).has("param-clamped")).toBe(true);
    expect(warningIds(simulate({ M0leo: 500_000, dvTotal: 6500, IspLander: 310, MdryLander: 200_000 })).has("lander-no-payload")).toBe(true);
  });

  test("module-level tests cover branches outside bounded public inputs", () => {
    const constructionParams: SimParams = {
      ...DEFAULTS,
      rhoGasPlume: 0.1,
      vGasPlume: 4000,
      Cf: 0.02,
      tauAllowable: 100,
      FS: 4
    };
    const construction = simulateConstruction(constructionParams, 1000);
    expect(construction.warnings.some((warning) => warning.id === "pad-shear")).toBe(true);

    const powerParams: SimParams = { ...DEFAULTS, kConversionKgPerKwe: 1000 };
    const power = simulatePower(powerParams, 1000);
    expect(power.warnings.some((warning) => warning.id === "beta-le-alpha")).toBe(true);
  });
});
