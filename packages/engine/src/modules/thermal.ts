import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams, SiteMode } from "../types";

export interface ThermalOutput {
  secSub_JPerKg: number | null;
  knudsenD_M2PerS: number;
  conductivity_WPerMK: number;
}

export function secSubJPerKg(chiIce: number, cpRegCold: number, Tpsr: number, Tsub: number): number {
  return (1 / chiIce) * cpRegCold * (Tsub - Tpsr) + PHYSICAL_CONSTANTS.dHsub_ice.value;
}

export function simulateThermal(params: SimParams): ThermalOutput {
  const T = params.site === "polar" ? params.Tsub : 300;
  const conductivity_WPerMK = params.kc + params.kr * T ** 3;
  const knudsenD_M2PerS =
    (2 / 3) *
    params.rPore *
    Math.sqrt((8 * PHYSICAL_CONSTANTS.R.value * T) / (Math.PI * PHYSICAL_CONSTANTS.M_H2O.value));

  return {
    secSub_JPerKg:
      params.site === "polar"
        ? secSubJPerKg(params.chiIce, params.cpRegCold, params.Tpsr, params.Tsub)
        : null,
    knudsenD_M2PerS,
    conductivity_WPerMK
  };
}

export function thermalSiteTemperature(site: SiteMode, Tsub: number): number {
  return site === "polar" ? Tsub : 300;
}
