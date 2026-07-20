import { PHYSICAL_CONSTANTS } from "../constants";
import type { SimParams, Warning } from "../types";

export interface PowerOutput {
  architecture: "solar" | "nuclear";
  solarMassKg: number;
  nuclearMassKg: number;
  solarArrayM2: number;
  radiatorM2: number;
  pCritW: number;
  pCritDynamicW: number;
  beamedFloorPowerW: number | null;
  selectedPowerMassKg: number;
  warnings: Warning[];
}

export function pCritKw(MshieldKg: number, beta: number, alpha: number): number | null {
  if (beta <= alpha) {
    return null;
  }
  return MshieldKg / (beta - alpha);
}

export function pCritDynamicKw(
  MshieldKg: number,
  beta: number,
  alpha: number,
  dSolar: number,
  dNuclear: number,
  tYears: number
): number | null {
  const denominator = beta / (1 - dSolar) ** tYears - alpha * (1 + dNuclear * tYears);
  if (denominator <= 0) {
    return null;
  }
  return MshieldKg / denominator;
}

export function simulatePower(params: SimParams, gridPowerW: number): PowerOutput {
  const Pgrid = gridPowerW;
  const Parray = Pgrid / params.etaWire + (Pgrid * PHYSICAL_CONSTANTS.tNight.value) / (PHYSICAL_CONSTANTS.tDay.value * params.etaRoundTrip);
  const solarDenominator =
    PHYSICAL_CONSTANTS.ISOLAR.value * params.etaCell * Math.cos(params.thetaSun) * params.Fdegrade;
  const solarArrayM2 = Parray / solarDenominator;
  const EstorageWh =
    (Pgrid * PHYSICAL_CONSTANTS.tNight.value) / (params.DoD * params.etaDischarge);
  const Mstorage = EstorageWh / params.SEstorage;
  const solarMassKg = params.Rarray * (Parray / 1000) + Mstorage;
  const betaSolar = solarMassKg / (Pgrid / 1000);

  const etaTherm = (1 - params.Tsink / params.Tsource) * params.etaMech;
  const Qfission = Pgrid / etaTherm;
  const Qreject = Qfission - Pgrid;
  const radiatorM2 =
    Qreject /
    (params.etaRad *
      params.epsRad *
      PHYSICAL_CONSTANTS.sigma.value *
      (params.Tsink ** 4 - params.Tenv ** 4));
  const nuclearMassKg = params.MshieldKg + params.alphaSpecific * (Pgrid / 1000);
  const architecture = solarMassKg <= nuclearMassKg ? "solar" : "nuclear";
  const selectedPowerMassKg = architecture === "solar" ? solarMassKg : nuclearMassKg;
  const pCrit = pCritKw(params.MshieldKg, betaSolar, params.alphaSpecific);
  const pCritDynamic = pCritDynamicKw(
    params.MshieldKg,
    betaSolar,
    params.alphaSpecific,
    params.dSolar,
    params.dNuclear,
    params.missionYears
  );
  const warnings: Warning[] = [];

  if (pCrit === null) {
    warnings.push({
      id: "beta-le-alpha",
      severity: "caution",
      module: "power",
      message: "Solar specific mass is less than or equal to nuclear specific mass.",
      value: betaSolar,
      limit: params.alphaSpecific
    });
  }

  const beamedFloorPowerW =
    params.site === "polar"
      ? beamedPowerW(
          Parray,
          params.w0Beam,
          params.thetaDivBeam,
          params.zCraterDrop,
          params.rReceiver,
          params.etaEmitter,
          params.etaPvReceiver
        )
      : null;

  return {
    architecture,
    solarMassKg,
    nuclearMassKg,
    solarArrayM2,
    radiatorM2,
    pCritW: pCrit === null ? 0 : pCrit * 1000,
    pCritDynamicW: pCritDynamic === null ? 0 : pCritDynamic * 1000,
    beamedFloorPowerW,
    selectedPowerMassKg,
    warnings
  };
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
  const wBeam = w0Beam + thetaDivBeam * zCraterDrop;
  const etaGeo = 1 - Math.exp((-2 * rReceiver ** 2) / wBeam ** 2);
  return ParrayRimW * etaEmitter * etaGeo * etaPvReceiver;
}
