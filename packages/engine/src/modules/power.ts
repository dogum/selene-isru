import { PHYSICAL_CONSTANTS } from "../constants";
import { resolvePolarProfile } from "./siteProfile";
import type {
  PolarProfileSummary,
  PowerStrategy,
  SimParams,
  Warning
} from "../types";

export interface PowerOutput {
  architecture: "solar" | "nuclear";
  solarMassKg: number;
  nuclearMassKg: number;
  solarArrayM2: number;
  radiatorM2: number;
  radiatorMassKg: number;
  radiatorEffectiveK: number;
  shieldMassKg: number;
  cableMassKg: number;
  cableLossW: number;
  fissionThermalW: number;
  nuclearSpecificKgPerKw: number;
  pCritW: number;
  pCritDynamicW: number;
  beamedFloorPowerW: number | null;
  beamDeliveryMarginW: number | null;
  solarDeliveredCapacityW: number;
  siteDayHours: number;
  siteNightHours: number;
  siteProfile: PolarProfileSummary;
  selectedPowerMassKg: number;
  warnings: Warning[];
}

/**
 * Shield mass at a power [kg]: MshieldKg up to its reference power refKw, then
 * times (kw / refKw)^nShield above it. A smaller reactor keeps the reference
 * shield. The engine calls it on reactor heat; the power chart calls it on
 * electrical output with `shieldRefKwe`.
 */
export function shieldMassKg(MshieldKg: number, refKw: number, nShield: number, kw: number): number {
  return MshieldKg * Math.max(1, kw / refKw) ** nShield;
}

/** Shield mass relative to its reference separation: (dShieldRefKm / dSeparationKm)^nShieldDistance [1]. */
export function shieldDistanceFactor(params: SimParams): number {
  return (PHYSICAL_CONSTANTS.dShieldRefKm.value / params.dSeparationKm) ** params.nShieldDistance;
}

/**
 * Fission shield at a reactor heat and the case's separation [kg]: the power
 * law of `shieldMassKg`, times the distance factor. A closer outpost needs a
 * thicker shield and a wider shadow (Mason 2025's 52°, 36°, and 22° included
 * angles at 0.5, 1, and 2 km).
 */
export function fissionShieldKg(params: SimParams, thermalKw: number): number {
  return shieldMassKg(params.MshieldKg, params.QshieldRefKwt, params.nShield, thermalKw) * shieldDistanceFactor(params);
}

/** Fraction of the fission plant's electrical output the cable delivers to the outpost [1]. */
export function lineEfficiency(params: SimParams): number {
  return 1 - params.fCableLossPerKm * params.dSeparationKm;
}

/**
 * Aluminium conductor per kW sent per km of route, sized to lose
 * fCableLossPerKm [kg/(kW km)]. Two conductors at the line voltage: the loss
 * fraction 2 rho L P / (V^2 A) is held at fCableLossPerKm per km, so the
 * conductor mass 2 A L rho_m = 4 rho rho_m P L / (V^2 f), with P in kW and L in km.
 */
export function cableConductorKgPerKwKm(params: SimParams): number {
  return (
    (4 * PHYSICAL_CONSTANTS.rhoAluminumOhmM.value * PHYSICAL_CONSTANTS.densityAluminumKgPerM3.value * 1e9) /
    (PHYSICAL_CONSTANTS.VCableV.value ** 2 * params.fCableLossPerKm)
  );
}

/** Reactor-to-outpost cable mass at a sent electrical power [kg]: a fixed mass per km plus the conductor. */
export function cableMassKg(params: SimParams, sentKwe: number): number {
  return params.dSeparationKm * (params.kCableKgPerKm + cableConductorKgPerKwKm(params) * sentKwe);
}

/** Delivered output at which the shield reaches its reference heat [kW]. */
export function shieldRefKwe(params: SimParams): number {
  return params.QshieldRefKwt * fissionEfficiency(params) * lineEfficiency(params);
}

/**
 * Solar/nuclear crossover [kW]: beta P = Mshield max(1, P / Pref)^n + alpha P.
 * Below the shield's reference power the shield is fixed and this is
 * Mshield / (beta - alpha); above it the closed form of the power law.
 */
export function pCritKw(MshieldKg: number, beta: number, alpha: number, shieldRefKw = 1, nShield = 0): number | null {
  if (beta <= alpha) {
    return null;
  }
  const fixed = MshieldKg / (beta - alpha);
  if (fixed <= shieldRefKw || nShield === 0) {
    return fixed;
  }
  return (MshieldKg / ((beta - alpha) * shieldRefKw ** nShield)) ** (1 / (1 - nShield));
}

/**
 * Solar specific mass after `tYears` of array degradation [kg/kW].
 * Exported so UI charts plot the same slope the crossover is derived from.
 */
export function solarSlopeAtYear(beta: number, dSolar: number, tYears: number): number {
  return beta / (1 - dSolar) ** tYears;
}

/**
 * Nuclear specific mass after `tYears` of reactor derating [kg/kW].
 * Exported so UI charts plot the same slope the crossover is derived from.
 */
export function nuclearSlopeAtYear(alpha: number, dNuclear: number, tYears: number): number {
  return alpha * (1 + dNuclear * tYears);
}

export function pCritDynamicKw(
  MshieldKg: number,
  beta: number,
  alpha: number,
  dSolar: number,
  dNuclear: number,
  tYears: number,
  shieldRefKw = 1,
  nShield = 0
): number | null {
  return pCritKw(
    MshieldKg,
    solarSlopeAtYear(beta, dSolar, tYears),
    nuclearSlopeAtYear(alpha, dNuclear, tYears),
    shieldRefKw,
    nShield
  );
}

/** Temperatures and per-unit-flow work and heat of a recuperated Brayton cycle [K]. */
export interface BraytonCycle {
  /** Compressor pressure ratio the cycle runs at [1] */
  pressureRatio: number;
  compressorExitK: number;
  turbineExitK: number;
  heaterInletK: number;
  /** Gas cooler inlet, where the recuperator hands the waste heat to the radiator loop [K] */
  coolerInletK: number;
  /** Net work over mass flow times heat capacity [K] */
  netWorkK: number;
  /** Reactor heat over mass flow times heat capacity [K] */
  heatInK: number;
}

const RP_MIN = 1.05;
const RP_MAX = 8;
const RP_GRID = 48;
const RP_BISECTIONS = 60;

/**
 * Recuperated closed Brayton cycle on an ideal monatomic gas at a pressure
 * ratio: turbine inlet at Tsource, compressor inlet at Tsink. Work and heat are
 * per unit mass flow and heat capacity, so their ratio is the cycle efficiency.
 */
export function braytonCycleAt(params: SimParams, rp: number): BraytonCycle {
  const gamma = PHYSICAL_CONSTANTS.gammaHeXe.value;
  const k = (gamma - 1) / gamma;
  const t1 = params.Tsink;
  const t3 = params.Tsource;
  const t2 = t1 * (1 + (rp ** k - 1) / params.etaCompressor);
  const expansion = Math.max(1, rp * (1 - params.fPressureLoss));
  const t4 = t3 * (1 - params.etaTurbine * (1 - expansion ** -k));
  const t5 = t2 + params.epsRecuperator * Math.max(0, t4 - t2);
  return {
    pressureRatio: rp,
    compressorExitK: t2,
    turbineExitK: t4,
    heaterInletK: t5,
    coolerInletK: t4 - (t5 - t2),
    netWorkK: t3 - t4 - (t2 - t1),
    heatInK: t3 - t5
  };
}

/** Sign-carrying numerator of d(netWork / heatIn) / d(pressure ratio), from braytonCycleAt's own terms. */
function braytonSlope(params: SimParams, rp: number): number {
  const gamma = PHYSICAL_CONSTANTS.gammaHeXe.value;
  const k = (gamma - 1) / gamma;
  const t1 = params.Tsink;
  const t3 = params.Tsource;
  const loss = 1 - params.fPressureLoss;
  const t2 = t1 * (1 + (rp ** k - 1) / params.etaCompressor);
  const dt2 = (t1 * k * rp ** (k - 1)) / params.etaCompressor;
  const expansion = rp * loss;
  let t4 = t3;
  let dt4 = 0;
  if (expansion > 1) {
    t4 = t3 * (1 - params.etaTurbine * (1 - expansion ** -k));
    dt4 = -t3 * params.etaTurbine * k * expansion ** (-k - 1) * loss;
  }
  let t5 = t2;
  let dt5 = dt2;
  if (t4 > t2) {
    t5 = t2 + params.epsRecuperator * (t4 - t2);
    dt5 = dt2 + params.epsRecuperator * (dt4 - dt2);
  }
  const netWork = t3 - t4 - (t2 - t1);
  return (-dt4 - dt2) * (t3 - t5) + netWork * dt5;
}

/**
 * The Brayton cycle at the pressure ratio that maximizes its efficiency. A
 * log-spaced grid over RP_MIN..RP_MAX finds the best point; bisection on the
 * sign of the analytic slope between its neighbours then finds the optimum.
 * Bisecting a slope, unlike comparing two nearly equal efficiencies, converges
 * to the same pressure ratio in any floating-point implementation.
 */
export function braytonCycle(params: SimParams): BraytonCycle {
  const value = (rp: number): number => {
    const cycle = braytonCycleAt(params, rp);
    return cycle.heatInK > 0 ? cycle.netWorkK / cycle.heatInK : -1e9;
  };
  const grid = Array.from({ length: RP_GRID }, (_, i) => RP_MIN * (RP_MAX / RP_MIN) ** (i / (RP_GRID - 1)));
  let best = 0;
  let bestValue = value(grid[0]!);
  for (let i = 1; i < RP_GRID; i++) {
    const v = value(grid[i]!);
    if (v > bestValue) {
      best = i;
      bestValue = v;
    }
  }
  let lo = grid[Math.max(0, best - 1)]!;
  let hi = grid[Math.min(RP_GRID - 1, best + 1)]!;
  for (let i = 0; i < RP_BISECTIONS; i++) {
    const mid = (lo + hi) / 2;
    const cycle = braytonCycleAt(params, mid);
    const rising = cycle.netWorkK > 0 && cycle.heatInK > 0 ? braytonSlope(params, mid) > 0 : mid < grid[best]!;
    if (rising) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return braytonCycleAt(params, (lo + hi) / 2);
}

/**
 * Fission conversion efficiency, electrical output over reactor heat [1].
 * Brayton: the cycle's net work over its heat input at its best pressure
 * ratio, times the alternator and power conditioning efficiency. Stirling: a
 * fixed fraction of Carnot between the hot and cold ends, which suits a cycle
 * whose ideal is Carnot's.
 */
export function fissionEfficiency(params: SimParams): number {
  if (params.fissionConverter === "stirling") {
    return Math.max(1e-9, (1 - params.Tsink / params.Tsource) * params.fCarnotStirling);
  }
  const cycle = braytonCycle(params);
  if (cycle.netWorkK <= 0 || cycle.heatInK <= 0) {
    return 1e-9;
  }
  return Math.max(1e-9, (cycle.netWorkK / cycle.heatInK) * params.etaAlternator);
}

/**
 * Radiator coolant's cold and hot ends [K]. Brayton: the gas cools from the gas
 * cooler inlet to the compressor inlet, and the radiator loop runs
 * dTGasCoolerK below it. Stirling: rejects at its cold end.
 */
export function radiatorTemperaturesK(params: SimParams): { coldK: number; hotK: number } {
  if (params.fissionConverter === "stirling") {
    return { coldK: params.Tsink, hotK: params.Tsink };
  }
  const cycle = braytonCycle(params);
  const coldK = params.Tsink - params.dTGasCoolerK;
  return { coldK, hotK: Math.max(coldK, cycle.coolerInletK - params.dTGasCoolerK) };
}

/** Antiderivative of 1 / (T^4 - a^4) with respect to T, for T > a. */
function inverseFluxIntegral(t: number, a: number): number {
  return Math.log((t - a) / (t + a)) / (4 * a ** 3) - Math.atan(t / a) / (2 * a ** 3);
}

/**
 * Net radiated flux averaged over the radiator, its coolant falling linearly
 * in temperature from the hot end to the cold [W/m^2].
 */
export function radiatorFluxWPerM2(params: SimParams): number {
  const k = params.etaRad * params.epsRad * PHYSICAL_CONSTANTS.sigma.value;
  const { coldK, hotK } = radiatorTemperaturesK(params);
  const a = params.Tenv;
  if (coldK <= a || hotK - coldK < 1e-6) {
    return k * (coldK ** 4 - a ** 4);
  }
  return (k * (hotK - coldK)) / (inverseFluxIntegral(hotK, a) - inverseFluxIntegral(coldK, a));
}

function radiatorM2PerKwAt(params: SimParams, etaTherm: number): number {
  return (1000 * (1 / etaTherm - 1)) / Math.max(1e-9, radiatorFluxWPerM2(params));
}

/**
 * Fission radiating area per kW of electrical output [m^2/kW]: the waste heat
 * per kW over the radiator's net flux to its environment.
 */
export function radiatorM2PerKw(params: SimParams): number {
  return radiatorM2PerKwAt(params, fissionEfficiency(params));
}

/**
 * Reactor and conversion specific-mass factor at a reactor heat [1]:
 * (Q / QscaleRefKwt)^(bFissionScale - 1). Below 1 the plant is past the
 * reference size and gains economy of scale.
 */
export function fissionScaleFactor(params: SimParams, thermalKw: number): number {
  return (Math.max(thermalKw, 1e-9) / params.QscaleRefKwt) ** (params.bFissionScale - 1);
}

/**
 * Power conversion and power management mass per kW of electrical output at a
 * reactor heat [kg/kW]. Brayton scales with the reactor (bFissionScale);
 * Stirling's modular convertors by bStirlingScale.
 */
export function conversionKgPerKwe(params: SimParams, thermalKw: number): number {
  if (params.fissionConverter === "stirling") {
    const stirlingScale = (Math.max(thermalKw, 1e-9) / params.QscaleRefKwt) ** (params.bStirlingScale - 1);
    return params.kConversionStirlingKgPerKwe * stirlingScale;
  }
  return params.kConversionKgPerKwe * fissionScaleFactor(params, thermalKw);
}

/** Per delivered kW: reactor, conversion, radiator, and cable conductor, all sized on the sent power. */
function specificKgPerKwe(params: SimParams, eta: number, radiatorKgPerKwe: number, kwe: number): number {
  const line = lineEfficiency(params);
  const heatKw = kwe / line / eta;
  const perSentKwe =
    (params.kReactorKgPerKwt / eta) * fissionScaleFactor(params, heatKw) +
    conversionKgPerKwe(params, heatKw) +
    radiatorKgPerKwe +
    params.dSeparationKm * cableConductorKgPerKwKm(params);
  return perSentKwe / line;
}

/**
 * Fission specific mass per kW delivered at an output, excluding the shield
 * and the cable's fixed mass [kg/kW]: the reactor on the heat it makes and
 * conversion and power management on the sent output, both scaled with size,
 * the radiator on its area, and the cable conductor, all grossed up for the
 * cable's loss. Defaults to the output at the scaling reference heat.
 */
export function nuclearSpecificKgPerKw(params: SimParams, kwe?: number): number {
  const eta = fissionEfficiency(params);
  const atKwe = kwe ?? params.QscaleRefKwt * eta * lineEfficiency(params);
  return specificKgPerKwe(params, eta, params.kRadiatorKgPerM2 * radiatorM2PerKwAt(params, eta), atKwe);
}

/** Fission mass against delivered output and age, with the efficiency and radiator evaluated once. */
function massCurve(params: SimParams): (kwe: number, tYears: number) => number {
  const eta = fissionEfficiency(params);
  const line = lineEfficiency(params);
  const radiatorKgPerKwe = params.kRadiatorKgPerM2 * radiatorM2PerKwAt(params, eta);
  const cableFixedKg = params.dSeparationKm * params.kCableKgPerKm;
  return (kwe, tYears) => {
    const shield = fissionShieldKg(params, kwe / line / eta);
    const specific = specificKgPerKwe(params, eta, radiatorKgPerKwe, kwe);
    return shield + cableFixedKg + nuclearSlopeAtYear(specific, params.dNuclear, tYears) * kwe;
  };
}

/**
 * Fission system mass at a delivered electrical output after `tYears` of
 * derating [kg]: the shield and the cable's fixed mass plus the aged rest. The power chart draws this curve, so it
 * and the crossover come from the same mass.
 */
export function nuclearMassAtKwe(params: SimParams, kwe: number, tYears = 0): number {
  return massCurve(params)(kwe, tYears);
}

/**
 * Electrical output above which fission is lighter than solar [kW], or null
 * if it never is below 1 TW. Solar mass is linear in output and fission mass
 * concave, so the gap has one root; it is found by bisection on a log scale.
 */
export function fissionCrossoverKw(params: SimParams, beta: number, tYears = 0): number | null {
  const betaT = solarSlopeAtYear(beta, params.dSolar, tYears);
  const mass = massCurve(params);
  const gap = (kw: number): number => betaT * kw - mass(kw, tYears);
  let lo = 1e-6;
  let hi = 1e9;
  if (gap(hi) <= 0) {
    return null;
  }
  for (let i = 0; i < 100; i++) {
    const mid = Math.sqrt(lo * hi);
    if (gap(mid) > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

export function siteCycleHours(params: SimParams, profile?: PolarProfileSummary): { dayHours: number; nightHours: number } {
  if (params.site === "equatorial") {
    return {
      dayHours: PHYSICAL_CONSTANTS.tDay.value,
      nightHours: PHYSICAL_CONSTANTS.tNight.value
    };
  }
  const nightHours = profile?.longestReceiverOutageHours ?? params.polarLongestShadowHours;
  const fraction = profile === undefined
    ? params.polarIlluminationFraction
    : profile.averageDeliveredFraction;
  const cycle = profile?.cycleHours ?? nightHours / (1 - fraction);
  const dayHours = Math.max(1e-6, cycle * fraction);
  return { dayHours, nightHours };
}

export function simulatePower(
  params: SimParams,
  gridPowerW: number,
  profile?: PolarProfileSummary,
  strategy: PowerStrategy = "auto"
): PowerOutput {
  const Pgrid = gridPowerW;
  const activeProfile = profile ?? resolvePolarProfile(params).profile;
  const { dayHours, nightHours } = siteCycleHours(params, activeProfile);
  const beamTransfer =
    params.site === "polar"
      ? beamEfficiency(
          params.w0Beam,
          params.thetaDivBeam,
          params.zCraterDrop,
          params.rReceiver,
          params.etaEmitter,
          params.etaPvReceiver
        )
      : 1;
  const deliveryEfficiency = params.etaWire * beamTransfer;
  const Parray =
    Pgrid / deliveryEfficiency +
    (Pgrid * nightHours) / (dayHours * params.etaRoundTrip * deliveryEfficiency);
  const solarDeliveredCapacityW = Parray * deliveryEfficiency;
  const solarDenominator =
    PHYSICAL_CONSTANTS.ISOLAR.value * params.etaCell * Math.cos(params.thetaSun) * params.Fdegrade;
  const solarArrayM2 = Parray / Math.max(1e-9, solarDenominator);
  const EstorageWh = (Pgrid * nightHours) / (params.DoD * params.etaDischarge);
  const Mstorage = EstorageWh / params.SEstorage;
  const solarMassKg = params.Rarray * (Parray / 1000) + Mstorage;
  const betaSolar = solarMassKg / (Pgrid / 1000);

  const etaTherm = fissionEfficiency(params);
  // The reactor sends enough to cover the cable's loss to the outpost.
  const Psent = Pgrid / lineEfficiency(params);
  const Qfission = Psent / etaTherm;
  const Qreject = Qfission - Psent;
  const radiatorFlux = radiatorFluxWPerM2(params);
  const radiatorM2 = Qreject / Math.max(1e-9, radiatorFlux);
  const radiatorColdK = radiatorTemperaturesK(params).coldK;
  const radiatorEffectiveK =
    radiatorFlux > 0
      ? (radiatorFlux / (params.etaRad * params.epsRad * PHYSICAL_CONSTANTS.sigma.value) + params.Tenv ** 4) ** 0.25
      : radiatorColdK;
  // The reactor is charged on the heat it makes and the radiator on its area,
  // so both follow the cycle's efficiency and temperatures; conversion and
  // power management scale with electrical output.
  const radiatorMassKg = params.kRadiatorKgPerM2 * radiatorM2;
  const shieldKg = fissionShieldKg(params, Qfission / 1000);
  const cableKg = cableMassKg(params, Psent / 1000);
  const scale = fissionScaleFactor(params, Qfission / 1000);
  const nuclearMassKg =
    shieldKg +
    params.kReactorKgPerKwt * (Qfission / 1000) * scale +
    conversionKgPerKwe(params, Qfission / 1000) * (Psent / 1000) +
    radiatorMassKg +
    cableKg;
  const alphaWithRadiator = nuclearSpecificKgPerKw(params, Pgrid / 1000);
  const architecture = strategy === "auto"
    ? solarMassKg <= nuclearMassKg ? "solar" : "nuclear"
    : strategy;
  const selectedPowerMassKg = architecture === "solar" ? solarMassKg : nuclearMassKg;
  const pCrit = fissionCrossoverKw(params, betaSolar);
  const pCritDynamic = fissionCrossoverKw(params, betaSolar, params.missionYears);
  const warnings: Warning[] = [];

  if (pCrit === null) {
    warnings.push({
      id: "beta-le-alpha",
      severity: "caution",
      module: "power",
      message: "Solar stays lighter than fission at every power level.",
      value: betaSolar,
      limit: alphaWithRadiator
    });
  }
  if (params.Tsource <= params.Tsink) {
    warnings.push({
      id: "power-hot-side",
      severity: "alarm",
      module: "power",
      message: "Fission hot-side temperature must exceed sink temperature.",
      value: params.Tsource,
      limit: params.Tsink
    });
  }
  const cycle = braytonCycle(params);
  if (params.fissionConverter === "stirling" && params.Tsource > PHYSICAL_CONSTANTS.TStirlingMaxK.value) {
    warnings.push({
      id: "stirling-hot-end",
      severity: "caution",
      module: "power",
      message: "Stirling hot end is above NASA's 1,050 K refractory Stirling design.",
      value: params.Tsource,
      limit: PHYSICAL_CONSTANTS.TStirlingMaxK.value
    });
  }
  if (params.fissionConverter === "brayton" && params.Tsource > params.Tsink && (cycle.netWorkK <= 0 || cycle.heatInK <= 0)) {
    warnings.push({
      id: "fission-no-net-work",
      // An alarm only when the plant runs on it; solar then carries the load.
      severity: architecture === "nuclear" ? "alarm" : "caution",
      module: "power",
      message: "The Brayton cycle makes no net work at these temperatures and component efficiencies.",
      value: params.Tsource / params.Tsink,
      limit: cycle.netWorkK
    });
  }
  if (radiatorColdK <= params.Tenv) {
    warnings.push({
      id: "radiator-temperature",
      severity: "alarm",
      module: "power",
      message: "Radiator cold end must exceed its environment temperature.",
      value: radiatorColdK,
      limit: params.Tenv
    });
  }

  const beamedFloorPowerW =
    params.site === "polar" && architecture === "solar"
      ? beamedPowerW(
          Parray,
          params.w0Beam,
          params.thetaDivBeam,
          params.zCraterDrop,
          params.rReceiver,
          params.etaEmitter,
          params.etaPvReceiver
        ) * params.etaWire
      : null;
  const beamDeliveryMarginW = beamedFloorPowerW === null ? null : beamedFloorPowerW - Pgrid;

  if (beamDeliveryMarginW !== null && beamDeliveryMarginW < -1e-6) {
    warnings.push({
      id: "beam-power-shortfall",
      severity: "alarm",
      module: "power",
      message: "Delivered beamed power is below the crater-floor load.",
      value: beamedFloorPowerW ?? 0,
      limit: Pgrid
    });
  }

  return {
    architecture,
    solarMassKg,
    nuclearMassKg,
    solarArrayM2,
    radiatorM2,
    radiatorMassKg,
    radiatorEffectiveK,
    shieldMassKg: shieldKg,
    cableMassKg: cableKg,
    cableLossW: Psent - Pgrid,
    fissionThermalW: Qfission,
    nuclearSpecificKgPerKw: alphaWithRadiator,
    pCritW: pCrit === null ? 0 : pCrit * 1000,
    pCritDynamicW: pCritDynamic === null ? 0 : pCritDynamic * 1000,
    beamedFloorPowerW,
    beamDeliveryMarginW,
    solarDeliveredCapacityW,
    siteDayHours: dayHours,
    siteNightHours: nightHours,
    siteProfile: activeProfile,
    selectedPowerMassKg,
    warnings
  };
}

export function beamEfficiency(
  w0Beam: number,
  thetaDivBeam: number,
  zCraterDrop: number,
  rReceiver: number,
  etaEmitter: number,
  etaPvReceiver: number
): number {
  const wBeam = w0Beam + thetaDivBeam * zCraterDrop;
  const etaGeo = 1 - Math.exp((-2 * rReceiver ** 2) / wBeam ** 2);
  return etaEmitter * etaGeo * etaPvReceiver;
}

export function beamedPowerW(
  ParrayRimW: number,
  w0Beam: number,
  thetaDivBeam: number,
  zCraterDrop: number,
  rReceiver: number,
  etaEmitter: number,
  etaPvReceiver: number
): number {
  return ParrayRimW * beamEfficiency(w0Beam, thetaDivBeam, zCraterDrop, rReceiver, etaEmitter, etaPvReceiver);
}
