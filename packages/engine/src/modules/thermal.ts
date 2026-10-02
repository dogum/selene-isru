import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams } from "../types";

export interface ThermalOutput {
  /** heat delivered to the feed per kg of captured water [J/kg] */
  secSub_JPerKg: number | null;
  /** heater input that never reaches the feed, per kg of captured water [J/kg] */
  heaterLoss_JPerKg: number | null;
  /** polar water-extractor hardware [kg] */
  extractorMassKg: number;
  knudsenD_M2PerS: number;
  conductivity_WPerMK: number;
}

/**
 * Thermodynamic minimum per kg of *mobilized* water: sensible heating of the
 * regolith that carries it plus the sublimation enthalpy [J/kg].
 */
export function secSubJPerKg(chiIce: number, cpRegCold: number, Tpsr: number, Tsub: number): number {
  return (1 / chiIce) * cpRegCold * (Tsub - Tpsr) + PHYSICAL_CONSTANTS.dHsub_ice.value;
}

/**
 * Heat delivered to the feed per kg of *captured* water [J/kg]. Ice that is
 * mobilized but not captured still had its regolith heated and its
 * sublimation enthalpy paid, so the minimum is divided by the capture
 * efficiency.
 */
export function secSubDeliveredJPerKg(params: SimParams): number {
  return secSubJPerKg(params.chiIce, params.cpRegCold, params.Tpsr, params.Tsub) / params.etaIceCapture;
}

export function simulateThermal(params: SimParams): ThermalOutput {
  const T = params.site === "polar" ? params.Tsub : PHYSICAL_CONSTANTS.TrefRegolith.value;
  const conductivity_WPerMK = params.kc + params.kr * T ** 3;
  const knudsenD_M2PerS =
    (2 / 3) *
    params.rPore *
    Math.sqrt((8 * PHYSICAL_CONSTANTS.R.value * T) / (Math.PI * PHYSICAL_CONSTANTS.M_H2O.value));

  const polar = params.site === "polar";
  const delivered = polar ? secSubDeliveredJPerKg(params) : null;
  // Extractor hardware scales with the regolith it must heat, which is what
  // makes ice-poor deposits expensive (regolith/day = target / (chi * capture)).
  const regolithKgPerDay = polar ? params.targetKgPerDay / (params.chiIce * params.etaIceCapture) : 0;

  return {
    secSub_JPerKg: delivered,
    heaterLoss_JPerKg: delivered === null ? null : delivered * (1 / params.etaSubHeater - 1),
    extractorMassKg: params.kIceExtractorMass * regolithKgPerDay,
    knudsenD_M2PerS,
    conductivity_WPerMK
  };
}
