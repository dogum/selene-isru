import { DEFAULTS, PARAM_META, PHYSICAL_CONSTANTS } from "./constants";
import { normalizeParams } from "./normalize";
import { simulateConstruction } from "./modules/construction";
import { simulateCryo } from "./modules/cryo";
import { simulateElectrolysis } from "./modules/electrolysis";
import { simulateExcavation } from "./modules/excavation";
import { simulateLogistics } from "./modules/logistics";
import { simulatePower } from "./modules/power";
import { simulateSabatier } from "./modules/sabatier";
import { simulateThermal } from "./modules/thermal";
import type {
  FlowEdge,
  SimParams,
  SimResult,
  TimeseriesOptions,
  TimeseriesResult,
  UncertaintyBand,
  UncertaintyResult,
  UncertaintySpec,
  Warning
} from "./types";

const J_PER_KWH = 3_600_000;
const SECONDS_PER_DAY = 86_400;

export { DEFAULTS, PARAM_META, PHYSICAL_CONSTANTS };
export { shieldFullBalanceM } from "./modules/construction";
export {
  cpRegolithJPerKgK,
  meltHeatJPerKg,
  oxideDecompositionVoltage,
  oxideModelYield,
  oxideO2KgPerKg,
  secElecJPerKg,
  sensibleHeatRegolithJPerKg
} from "./modules/electrolysis";
export { payloadPerMissionKg } from "./modules/logistics";
export { beamedPowerW, pCritDynamicKw, pCritKw } from "./modules/power";
export { sabatierKp } from "./modules/sabatier";
export { secSubJPerKg } from "./modules/thermal";
export type {
  FlowEdge,
  ManifestRow,
  OxideYield,
  ParamMeta,
  SimParams,
  SimResult,
  TimeseriesOptions,
  TimeseriesPoint,
  TimeseriesResult,
  UncertaintyBand,
  UncertaintyResult,
  UncertaintySpec,
  Warning
} from "./types";

export function simulate(input: Partial<SimParams> = {}): SimResult {
  const normalized = normalizeParams(input);
  const params = normalized.params;
  const electrolysis = simulateElectrolysis(params);
  const excavation = simulateExcavation(params, electrolysis.xO2Effective);
  const thermal = simulateThermal(params);
  const cryo = simulateCryo(params);
  const sabatier =
    params.site === "polar" && params.enableSabatier
      ? simulateSabatier(params, params.targetKgPerDay)
      : null;

  const production = productionState(params, excavation.regolithPerKgProduct, sabatier);
  const energyLines = energyLineItems(params, excavation.secExcavation_JPerKg, electrolysis, thermal.secSub_JPerKg, cryo.cryocoolerPowerW, sabatier);
  const flows = energyLines.map((line) => ({
    from: line.from,
    to: line.to,
    kWhPerKg: line.jPerKg / J_PER_KWH
  }));
  const secTotal_JPerKg = energyLines.reduce((total, line) => total + line.jPerKg, 0);
  const secTotal_kWhPerKg = secTotal_JPerKg / J_PER_KWH;
  const gridPowerW = (params.targetKgPerDay / SECONDS_PER_DAY) * secTotal_JPerKg;
  const power = simulatePower(params, gridPowerW);
  const reactorMassKg =
    params.site === "equatorial" || params.enableSabatier
      ? params.kReactorMass * params.targetKgPerDay
      : 0;
  const logistics = simulateLogistics(
    params,
    excavation.fleetMassKg,
    reactorMassKg,
    power.selectedPowerMassKg,
    cryo.cryoMassKg
  );
  const construction = simulateConstruction(params, params.site === "equatorial" ? production.slagKgPerDay : 0);
  const warnings: Warning[] = [
    ...normalized.warnings,
    ...(params.site === "equatorial" ? electrolysis.warnings : []),
    ...power.warnings,
    ...(params.site === "equatorial" ? construction.warnings : [])
  ];

  return {
    site: params.site,
    production,
    energy: {
      secTotal_kWhPerKg,
      flows,
      gridPowerW
    },
    excavation: {
      cuttingForceN: excavation.cuttingForceN,
      mechPowerW: excavation.mechPowerW,
      fleetMassKg: excavation.fleetMassKg
    },
    electrolysis: {
      secElec_JPerKg: params.site === "equatorial" ? electrolysis.secElec_JPerKg : 0,
      secThermal_JPerKg: params.site === "equatorial" ? electrolysis.secThermal_JPerKg : 0,
      currentA: params.site === "equatorial" ? electrolysis.currentA : 0,
      cellVoltageV: params.Vcell,
      jLimit_APerM2: electrolysis.jLimit_APerM2,
      jOperating_APerM2: params.jOperating,
      meltViscosityPaS: electrolysis.meltViscosityPaS,
      drainVelocityMPerS: electrolysis.drainVelocityMPerS,
      xO2Effective: electrolysis.xO2Effective,
      oxideYield: electrolysis.oxideYield
    },
    thermal,
    cryo: {
      qLeakW: cryo.qLeakW,
      boiloffKgPerDay: cryo.boiloffKgPerDay,
      cryocoolerPowerW: cryo.cryocoolerPowerW,
      mliFlux_WPerM2: cryo.mliFlux_WPerM2
    },
    power: {
      architecture: power.architecture,
      solarMassKg: power.solarMassKg,
      nuclearMassKg: power.nuclearMassKg,
      solarArrayM2: power.solarArrayM2,
      radiatorM2: power.radiatorM2,
      pCritW: power.pCritW,
      pCritDynamicW: power.pCritDynamicW,
      beamedFloorPowerW: power.beamedFloorPowerW
    },
    logistics,
    construction,
    warnings
  };
}

interface EnergyLine {
  from: string;
  to: string;
  jPerKg: number;
}

interface ProductionState {
  targetKgPerDay: number;
  regolithKgPerDay: number;
  slagKgPerDay: number;
  o2KgPerDay: number;
  waterKgPerDay: number;
  h2KgPerDay: number;
  ch4KgPerDay: number;
}

interface ActiveElectrolysis {
  secElec_JPerKg: number;
  secThermal_JPerKg: number;
  secParasitic_JPerKg: number;
}

interface ActiveSabatier {
  secWaterElectrolysis_JPerKg: number;
  h2KgPerDay: number;
  o2KgPerDay: number;
  ch4KgPerDay: number;
}

function productionState(
  params: SimParams,
  regolithPerKgProduct: number,
  sabatier: ActiveSabatier | null
): ProductionState {
  const regolithKgPerDay = params.targetKgPerDay * regolithPerKgProduct;
  if (params.site === "equatorial") {
    return {
      targetKgPerDay: params.targetKgPerDay,
      regolithKgPerDay,
      slagKgPerDay: regolithKgPerDay - params.targetKgPerDay,
      o2KgPerDay: params.targetKgPerDay,
      waterKgPerDay: 0,
      h2KgPerDay: 0,
      ch4KgPerDay: 0
    };
  }

  return {
    targetKgPerDay: params.targetKgPerDay,
    regolithKgPerDay,
    slagKgPerDay: 0,
    o2KgPerDay: sabatier === null ? 0 : sabatier.o2KgPerDay,
    waterKgPerDay: params.targetKgPerDay,
    h2KgPerDay: sabatier === null ? 0 : sabatier.h2KgPerDay,
    ch4KgPerDay: sabatier === null ? 0 : sabatier.ch4KgPerDay
  };
}

function energyLineItems(
  params: SimParams,
  secExcavation_JPerKg: number,
  electrolysis: ActiveElectrolysis,
  secSub_JPerKg: number | null,
  cryocoolerPowerW: number,
  sabatier: ActiveSabatier | null
): EnergyLine[] {
  const mdotProduct_kgPerS = params.targetKgPerDay / SECONDS_PER_DAY;
  const cryoJPerKg =
    params.secLiquefaction * J_PER_KWH +
    (mdotProduct_kgPerS > 0 ? cryocoolerPowerW / mdotProduct_kgPerS : 0);

  if (params.site === "equatorial") {
    return [
      { from: "mine", to: "melt", jPerKg: secExcavation_JPerKg },
      { from: "melt", to: "electrolysis", jPerKg: electrolysis.secThermal_JPerKg },
      { from: "electrolysis", to: "product", jPerKg: electrolysis.secElec_JPerKg },
      { from: "electrolysis", to: "parasitic", jPerKg: electrolysis.secParasitic_JPerKg },
      { from: "cryo", to: "product", jPerKg: cryoJPerKg }
    ];
  }

  const sublimationJPerKg = secSub_JPerKg === null ? 0 : secSub_JPerKg;
  const lines: EnergyLine[] = [
    { from: "mine", to: "sublimation", jPerKg: secExcavation_JPerKg },
    { from: "sublimation", to: "product", jPerKg: sublimationJPerKg },
    { from: "sublimation", to: "parasitic", jPerKg: params.fDistill * sublimationJPerKg },
    { from: "cryo", to: "product", jPerKg: cryoJPerKg }
  ];

  if (sabatier !== null) {
    lines.push({
      from: "electrolysis",
      to: "product",
      jPerKg: sabatier.secWaterElectrolysis_JPerKg
    });
  }

  return lines;
}

/**
 * Sample one or more lunar day/night cycles from the steady-state simulation.
 * Time is in hours; powers are W; tank inventory is kg; production/boil-off are kg/day.
 */
export function simulateTimeseries(
  input: Partial<SimParams> = {},
  opts: Partial<TimeseriesOptions> = {}
): TimeseriesResult {
  const params = normalizeParams(input).params;
  const result = simulate(params);
  const cycles = Math.max(1, Math.trunc(opts.cycles ?? 1));
  const samplesPerCycle = Math.max(2, Math.trunc(opts.samplesPerCycle ?? 96));
  const tDay = PHYSICAL_CONSTANTS.tDay.value;
  const tNight = PHYSICAL_CONSTANTS.tNight.value;
  const cycleHours = tDay + tNight;
  const steps = cycles * samplesPerCycle;
  const dtHours = cycleHours / samplesPerCycle;
  const loadNominalW = result.energy.gridPowerW;
  const pArrayW =
    loadNominalW / params.etaWire + (loadNominalW * tNight) / (tDay * params.etaRoundTrip);
  const reserveSoC = 1 - params.DoD;
  const netProductionNominalKgPerDay = Math.max(0, result.production.targetKgPerDay - result.cryo.boiloffKgPerDay);
  const points = [];
  let deliveredWh = 0;
  const requestedWh = loadNominalW * steps * dtHours;

  for (let step = 0; step <= steps; step += 1) {
    const tHours = step * dtHours;
    const inCycle = tHours % cycleHours;
    const daylight = inCycle < tDay;
    let solarOutputW = 0;
    let batterySoC = 1;
    let loadW = loadNominalW;

    if (result.power.architecture === "solar") {
      solarOutputW = daylight ? pArrayW : 0;
      if (daylight) {
        batterySoC = Math.min(1, reserveSoC + params.DoD * (inCycle / tDay));
      } else {
        batterySoC = Math.max(reserveSoC, 1 - params.DoD * ((inCycle - tDay) / tNight));
      }
      if (!daylight && batterySoC <= reserveSoC && params.DoD <= 0) {
        loadW = 0;
      }
    } else {
      solarOutputW = 0;
      batterySoC = 1;
    }

    if (step < steps) {
      deliveredWh += loadW * dtHours;
    }

    const loadFraction = loadNominalW > 0 ? loadW / loadNominalW : 1;
    const netProductionKgPerDay = netProductionNominalKgPerDay * loadFraction;
    const tankFillKg = Math.max(0, (tHours / 24) * netProductionKgPerDay);
    points.push({
      tHours,
      daylight,
      solarOutputW,
      loadW,
      batterySoC,
      tankFillKg,
      boiloffKgPerDay: result.cryo.boiloffKgPerDay,
      netProductionKgPerDay
    });
  }

  const minSoC = points.reduce((minimum, point) => Math.min(minimum, point.batterySoC), 1);
  const tankPeakKg = points.reduce((maximum, point) => Math.max(maximum, point.tankFillKg), 0);
  const dutyCycle = loadNominalW > 0 ? deliveredWh / requestedWh : 1;
  const curtailedRaw = Math.max(0, 1 - dutyCycle);
  const curtailedFraction = curtailedRaw < 1e-12 ? 0 : curtailedRaw;

  return {
    points,
    summary: {
      minSoC,
      dutyCycle,
      tankPeakKg,
      curtailedFraction
    }
  };
}

/**
 * Deterministically sample Gaussian relative parameter uncertainty with splitmix64
 * and return percentile bands for the headline steady-state KPIs.
 */
export function sampleUncertainty(
  base: Partial<SimParams>,
  spec: UncertaintySpec[],
  opts: { n: number; seed: number }
): UncertaintyResult {
  const n = Math.max(1, Math.trunc(opts.n));
  const rng = new SplitMix64(opts.seed);
  const baseParams = normalizeParams(base).params;
  const samples: Record<keyof UncertaintyResult, number[]> = {
    paybackDays: [],
    secTotal: [],
    nMissions: [],
    leverageL: []
  };

  for (let i = 0; i < n; i += 1) {
    const params: Partial<SimParams> = { ...baseParams };
    for (const item of spec) {
      const baseValue = baseParams[item.key];
      if (typeof baseValue !== "number" || !Number.isFinite(baseValue)) {
        continue;
      }
      const rel = Number.isFinite(item.rel) ? item.rel : 0;
      const sampled = baseValue * (1 + rel * rng.gaussian());
      (params as Record<string, unknown>)[item.key] = sampled;
    }
    const result = simulate(params);
    samples.paybackDays.push(result.logistics.paybackDays);
    samples.secTotal.push(result.energy.secTotal_kWhPerKg);
    samples.nMissions.push(result.logistics.nMissions);
    samples.leverageL.push(result.logistics.leverageL);
  }

  return {
    paybackDays: summarize(samples.paybackDays),
    secTotal: summarize(samples.secTotal),
    nMissions: summarize(samples.nMissions),
    leverageL: summarize(samples.leverageL)
  };
}

const U64_MASK = (1n << 64n) - 1n;
const DOUBLE_UNIT = 9007199254740992;

class SplitMix64 {
  private state: bigint;

  constructor(seed: number) {
    this.state = BigInt.asUintN(64, BigInt(Math.trunc(seed)));
  }

  nextDouble(): number {
    const bits = this.nextU64() >> 11n;
    return Number(bits) / DOUBLE_UNIT;
  }

  gaussian(): number {
    const u1 = Math.max(this.nextDouble(), Number.MIN_VALUE);
    const u2 = this.nextDouble();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private nextU64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & U64_MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
    return (z ^ (z >> 31n)) & U64_MASK;
  }
}

function summarize(values: number[]): UncertaintyBand {
  const sorted = values.slice().sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    mean: total / values.length
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) {
    return sorted[0]!;
  }
  const rank = (sorted.length - 1) * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lowerValue = sorted[lower]!;
  const upperValue = sorted[upper]!;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}
