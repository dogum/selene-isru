import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams } from "../types";

export interface SabatierOutput {
  secWaterElectrolysis_JPerKg: number;
  grossH2KgPerDay: number;
  h2ConsumedKgPerDay: number;
  h2UnreactedKgPerDay: number;
  o2KgPerDay: number;
  co2ImportedKgPerDay: number;
  ch4KgPerDay: number;
  waterRecycleKgPerDay: number;
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
  const grossH2KgPerDay = waterKgPerDay * (PHYSICAL_CONSTANTS.M_H2.value / PHYSICAL_CONSTANTS.M_H2O.value);
  const o2KgPerDay = waterKgPerDay * ((PHYSICAL_CONSTANTS.M_O2.value / 2) / PHYSICAL_CONSTANTS.M_H2O.value);
  const h2ConsumedKgPerDay = grossH2KgPerDay * params.fConversion;
  const h2UnreactedKgPerDay = grossH2KgPerDay - h2ConsumedKgPerDay;
  const co2ImportedKgPerDay =
    h2ConsumedKgPerDay * (PHYSICAL_CONSTANTS.M_CO2.value / (4 * PHYSICAL_CONSTANTS.M_H2.value));
  const ch4KgPerDay =
    h2ConsumedKgPerDay *
    (PHYSICAL_CONSTANTS.M_CH4.value / (4 * PHYSICAL_CONSTANTS.M_H2.value));
  const waterRecycleKgPerDay =
    h2ConsumedKgPerDay * ((2 * PHYSICAL_CONSTANTS.M_H2O.value) / (4 * PHYSICAL_CONSTANTS.M_H2.value));
  const mdotCH4_molPerS = (ch4KgPerDay / 86400) / PHYSICAL_CONSTANTS.M_CH4.value;
  const qSabatierW = mdotCH4_molPerS * Math.abs(PHYSICAL_CONSTANTS.dH_sabatier.value);
  const kp = sabatierKp(params.Tsabatier);

  return {
    secWaterElectrolysis_JPerKg,
    grossH2KgPerDay,
    h2ConsumedKgPerDay,
    h2UnreactedKgPerDay,
    o2KgPerDay,
    co2ImportedKgPerDay,
    ch4KgPerDay,
    waterRecycleKgPerDay,
    qSabatierW,
    kp
  };
}
