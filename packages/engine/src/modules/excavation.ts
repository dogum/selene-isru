import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams } from "../types";

export interface ExcavationOutput {
  cuttingForceN: number;
  mechPowerW: number;
  fleetMassKg: number;
  secExcavation_JPerKg: number;
  regolithPerKgProduct: number;
}

export function regolithPerKgProduct(params: SimParams, xO2Effective?: number): number {
  if (params.site === "equatorial") {
    return 1 / (xO2Effective ?? params.xO2 * params.fExtract);
  }
  return 1 / params.chiIce;
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
  const secExcavation_JPerKg = params.eMining * regolithPerKg;
  const fleetMassKg = params.kExcFleet * params.targetKgPerDay;

  return {
    cuttingForceN,
    mechPowerW,
    fleetMassKg,
    secExcavation_JPerKg,
    regolithPerKgProduct: regolithPerKg
  };
}
