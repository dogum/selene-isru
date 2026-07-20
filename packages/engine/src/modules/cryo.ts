import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams } from "../types";

export interface CryoOutput {
  qLeakW: number;
  boiloffKgPerDay: number;
  cryocoolerPowerW: number;
  mliFlux_WPerM2: number;
  cryoMassKg: number;
}

export function simulateCryo(params: SimParams): CryoOutput {
  const productKgPerDay = params.targetKgPerDay;
  const Vtank = (params.reserveDays * productKgPerDay) / params.rhoCryo;
  const rTank = (3 * Vtank / (4 * Math.PI)) ** (1 / 3);
  const Atank = 4 * Math.PI * rTank ** 2;
  const Aproj = Math.PI * rTank ** 2;
  const illum = params.site === "polar" ? 0 : 1;
  const qSolar = params.alphaTank * PHYSICAL_CONSTANTS.ISOLAR.value * Aproj * illum;
  const qAlbedo = params.alphaTank * PHYSICAL_CONSTANTS.ISOLAR.value * 0.12 * params.Fview * Atank * illum;
  const qIR = params.epsTank * PHYSICAL_CONSTANTS.sigma.value * params.Tsurface ** 4 * params.Fview * Atank;
  const qSpace =
    params.epsTank *
    PHYSICAL_CONSTANTS.sigma.value *
    (params.Ttank ** 4 - 3 ** 4) *
    Atank *
    (1 - params.Fview);
  const qEnv = qSolar + qAlbedo + qIR - qSpace;
  const teqRaw = qEnv > 0 ? (qEnv / (params.epsTank * PHYSICAL_CONSTANTS.sigma.value * Atank)) ** 0.25 : params.Ttank;
  const Thot = Math.max(teqRaw, params.Ttank);
  const Tcold = params.Ttank;
  const Tm = (Thot + Tcold) / 2;
  const layerDensityForCorrelation = params.Nlaydens / 10;
  const mliFlux_WPerM2 =
    (params.C1mli * layerDensityForCorrelation ** params.rExp * Tm * (Thot - Tcold)) / params.Nmli +
    (params.C2mli * params.epsLayer * (Thot ** 4.67 - Tcold ** 4.67)) / params.Nmli;
  const qLeakW = Math.max(0, mliFlux_WPerM2 * Atank) + params.qStrutW;
  const boiloffKgPerDay = (qLeakW / PHYSICAL_CONSTANTS.dHvap_LOX.value) * 86400;
  const cryocoolerPowerW = (qLeakW * (Thot - Tcold)) / (params.eta2ndLaw * Tcold);
  const cryoMassKg = params.kCryoMass * productKgPerDay;

  return {
    qLeakW,
    boiloffKgPerDay,
    cryocoolerPowerW,
    mliFlux_WPerM2,
    cryoMassKg
  };
}
