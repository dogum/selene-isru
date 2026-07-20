import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams, Warning } from "../types";

export interface ConstructionOutput {
  slagPerYearT: number;
  shieldFullBalanceM: number;
  shieldDesignM: number;
  maxSafeCoolingDeltaK: number;
  padShearPa: number;
  padJointUtilization: number;
  padsPerYear: number;
  daysToShieldHabitat: number;
  warnings: Warning[];
}

export function shieldFullBalanceM(Pinternal: number, rhoSlag: number): number {
  return Pinternal / (rhoSlag * PHYSICAL_CONSTANTS.gL.value);
}

export function simulateConstruction(params: SimParams, slagKgPerDay: number): ConstructionOutput {
  const shieldFull = shieldFullBalanceM(params.Pinternal, params.rhoSlag);
  const maxSafeCoolingDeltaK =
    (params.sigmaTensile * (1 - params.nu)) / (params.Eslag * params.alphaCte);
  const padShearPa = 0.5 * params.rhoGasPlume * params.vGasPlume ** 2 * params.Cf;
  const padJointUtilization = padShearPa / (params.tauAllowable / params.FS);
  const padMassKg = (Math.PI / 4) * params.dPad ** 2 * params.tPad * params.rhoSlag;
  const padsPerYear = slagKgPerDay > 0 ? (slagKgPerDay * 365) / padMassKg : 0;
  const habShieldMass = params.areaHabRoof * params.shieldDesignM * params.rhoSlag;
  const daysToShieldHabitat = slagKgPerDay > 0 ? habShieldMass / slagKgPerDay : 0;
  const warnings: Warning[] = [];

  if (params.castDeltaT > maxSafeCoolingDeltaK) {
    warnings.push({
      id: "thermal-stress",
      severity: "alarm",
      module: "construction",
      message: "Slag casting cooling delta exceeds the thermal stress limit.",
      value: params.castDeltaT,
      limit: maxSafeCoolingDeltaK
    });
  }

  if (padJointUtilization > 1) {
    warnings.push({
      id: "pad-shear",
      severity: "alarm",
      module: "construction",
      message: "Landing pad joint shear utilization exceeds unity.",
      value: padJointUtilization,
      limit: 1
    });
  }

  return {
    slagPerYearT: (slagKgPerDay * 365) / 1000,
    shieldFullBalanceM: shieldFull,
    shieldDesignM: params.shieldDesignM,
    maxSafeCoolingDeltaK,
    padShearPa,
    padJointUtilization,
    padsPerYear,
    daysToShieldHabitat,
    warnings
  };
}
