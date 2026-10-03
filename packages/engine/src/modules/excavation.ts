import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams } from "../types";
import { ilmeniteSoilPerKgO2, reducesIlmenite } from "./ilmenite";

export interface ExcavationOutput {
  cuttingForceN: number;
  mechPowerW: number;
  fleetMassKg: number;
  secExcavation_JPerKg: number;
  regolithPerKgProduct: number;
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
  // MRE and polar fleets scale with product; an ilmenite plant moves tens of
  // times more soil per kg of oxygen, so its fleet scales with soil mined.
  const ilmenite = reducesIlmenite(params);
  const secExcavation_JPerKg = (ilmenite ? params.eIlmMining : params.eMining) * regolithPerKg;
  const fleetMassKg = ilmenite
    ? params.kIlmMiningMass * (params.targetKgPerDay * regolithPerKg)
    : params.kExcFleet * params.targetKgPerDay;

  return {
    cuttingForceN,
    mechPowerW,
    fleetMassKg,
    secExcavation_JPerKg,
    regolithPerKgProduct: regolithPerKg
  };
}
