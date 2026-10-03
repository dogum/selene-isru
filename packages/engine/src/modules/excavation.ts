import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams } from "../types";
import { ilmeniteSoilPerKgO2, reducesIlmenite } from "./ilmenite";

export interface ExcavationOutput {
  cuttingForceN: number;
  mechPowerW: number;
  fleetMassKg: number;
  secExcavation_JPerKg: number;
  regolithPerKgProduct: number;
  /** [kg/kg product] feed plus overburden */
  soilMovedPerKgProduct: number;
  /** [kg/day] */
  soilMovedKgPerDay: number;
  /** [kg/day] */
  overburdenKgPerDay: number;
}

export function regolithPerKgProduct(params: SimParams, xO2Effective?: number): number {
  if (reducesIlmenite(params)) return ilmeniteSoilPerKgO2(params);
  if (params.site === "equatorial") {
    return 1 / (xO2Effective ?? params.xO2 * params.fExtract);
  }
  // Only the captured share of the mobilized ice becomes product water.
  return 1 / (params.chiIce * params.etaIceCapture);
}

export function simulateExcavation(params: SimParams, xO2Effective?: number): ExcavationOutput {
  const gL = PHYSICAL_CONSTANTS.gL.value;
  const q = params.rhoReg * gL * params.zDepth;
  const cuttingForceN =
    (params.c * params.Nc +
      q * params.Nq +
      0.5 * params.rhoReg * gL * params.wBlade * params.dBlade * params.Ngamma) *
    params.wBlade *
    params.dBlade;
  const mechPowerW = (cuttingForceN * params.vCut) / params.etaDrive;
  const regolithPerKg = regolithPerKgProduct(params, xO2Effective);
  // Every plant's mining energy and fleet scale with the soil it moves. The
  // polar pit mine also strips dry overburden to reach the icy regolith.
  const overburdenPerKg = params.site === "polar" ? params.overburdenRatio * regolithPerKg : 0;
  const soilMovedPerKg = regolithPerKg + overburdenPerKg;
  const soilMovedKgPerDay = params.targetKgPerDay * soilMovedPerKg;

  return {
    cuttingForceN,
    mechPowerW,
    fleetMassKg: params.kMiningMass * soilMovedKgPerDay,
    secExcavation_JPerKg: params.eMining * soilMovedPerKg,
    regolithPerKgProduct: regolithPerKg,
    soilMovedPerKgProduct: soilMovedPerKg,
    soilMovedKgPerDay,
    overburdenKgPerDay: params.targetKgPerDay * overburdenPerKg
  };
}
