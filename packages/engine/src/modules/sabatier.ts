import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams } from "../types";

export interface SabatierOutput {
  secWaterElectrolysis_JPerKg: number;
  h2KgPerDay: number;
  o2KgPerDay: number;
  ch4KgPerDay: number;
  qSabatierW: number;
  kp: number;
}

export function sabatierKp(T: number): number {
  const dH = PHYSICAL_CONSTANTS.dH_sabatier.value;
  const dS = PHYSICAL_CONSTANTS.dS_sabatier.value;
  const R = PHYSICAL_CONSTANTS.R.value;
  return Math.exp(-(dH - T * dS) / (R * T));
}

export function simulateSabatier(params: SimParams, waterKgPerDay: number): SabatierOutput {
  const secWaterElectrolysis_JPerKg =
    (params.Vel * 2 * PHYSICAL_CONSTANTS.F.value) /
    (PHYSICAL_CONSTANTS.M_H2O.value * params.etaFaradayEl);
  const h2KgPerDay = waterKgPerDay * (PHYSICAL_CONSTANTS.M_H2.value / PHYSICAL_CONSTANTS.M_H2O.value);
  const o2KgPerDay = waterKgPerDay * ((PHYSICAL_CONSTANTS.M_O2.value / 2) / PHYSICAL_CONSTANTS.M_H2O.value);
  const ch4KgPerDay =
    h2KgPerDay *
    params.fConversion *
    (PHYSICAL_CONSTANTS.M_CH4.value / (4 * PHYSICAL_CONSTANTS.M_H2.value));
  const mdotCH4_molPerS = (ch4KgPerDay / 86400) / PHYSICAL_CONSTANTS.M_CH4.value;
  const qSabatierW = mdotCH4_molPerS * Math.abs(PHYSICAL_CONSTANTS.dH_sabatier.value);
  const kp = sabatierKp(params.Tsabatier);

  return {
    secWaterElectrolysis_JPerKg,
    h2KgPerDay,
    o2KgPerDay,
    ch4KgPerDay,
    qSabatierW,
    kp
  };
}
