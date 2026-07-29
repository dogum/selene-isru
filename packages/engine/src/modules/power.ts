import { PHYSICAL_CONSTANTS } from "../constants";
import { resolvePolarProfile } from "./siteProfile";
import type {
  PolarProfileSummary,
  PowerStrategy,
  SimParams,
  Warning
} from "../types";

export interface PowerOutput {
  architecture: "solar" | "nuclear";
  solarMassKg: number;
  nuclearMassKg: number;
  solarArrayM2: number;
  radiatorM2: number;
  pCritW: number;
  pCritDynamicW: number;
  beamedFloorPowerW: number | null;
  beamDeliveryMarginW: number | null;
  solarDeliveredCapacityW: number;
  siteDayHours: number;
  siteNightHours: number;
  siteProfile: PolarProfileSummary;
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

export function siteCycleHours(params: SimParams, profile?: PolarProfileSummary): { dayHours: number; nightHours: number } {
  if (params.site === "equatorial") {
    return {
      dayHours: PHYSICAL_CONSTANTS.tDay.value,
      nightHours: PHYSICAL_CONSTANTS.tNight.value
    };
  }
  const nightHours = profile?.longestReceiverOutageHours ?? params.polarLongestShadowHours;
  const fraction = profile === undefined
    ? params.polarIlluminationFraction
    : profile.averageDeliveredFraction;
  const cycle = profile?.cycleHours ?? nightHours / (1 - fraction);
  const dayHours = Math.max(1e-6, cycle * fraction);
  return { dayHours, nightHours };
}

export function simulatePower(
  params: SimParams,
  gridPowerW: number,
  profile?: PolarProfileSummary,
  strategy: PowerStrategy = "auto"
): PowerOutput {
  const Pgrid = gridPowerW;
  const activeProfile = profile ?? resolvePolarProfile(params).profile;
  const { dayHours, nightHours } = siteCycleHours(params, activeProfile);
  const beamTransfer =
    params.site === "polar"
      ? beamEfficiency(
          params.w0Beam,
          params.thetaDivBeam,
          params.zCraterDrop,
          params.rReceiver,
          params.etaEmitter,
          params.etaPvReceiver
        )
      : 1;
  const deliveryEfficiency = params.etaWire * beamTransfer;
  const Parray =
    Pgrid / deliveryEfficiency +
    (Pgrid * nightHours) / (dayHours * params.etaRoundTrip * deliveryEfficiency);
  const solarDeliveredCapacityW = Parray * deliveryEfficiency;
  const solarDenominator =
    PHYSICAL_CONSTANTS.ISOLAR.value * params.etaCell * Math.cos(params.thetaSun) * params.Fdegrade;
  const solarArrayM2 = Parray / Math.max(1e-9, solarDenominator);
  const EstorageWh = (Pgrid * nightHours) / (params.DoD * params.etaDischarge);
  const Mstorage = EstorageWh / params.SEstorage;
  const solarMassKg = params.Rarray * (Parray / 1000) + Mstorage;
  const betaSolar = solarMassKg / (Pgrid / 1000);

  const etaThermRaw = (1 - params.Tsink / params.Tsource) * params.etaMech;
  const etaTherm = Math.max(1e-9, etaThermRaw);
  const Qfission = Pgrid / etaTherm;
  const Qreject = Qfission - Pgrid;
  const radiatorDenominator =
    params.etaRad *
    params.epsRad *
    PHYSICAL_CONSTANTS.sigma.value *
    (params.Tsink ** 4 - params.Tenv ** 4);
  const radiatorM2 = Qreject / Math.max(1e-9, radiatorDenominator);
  const nuclearMassKg = params.MshieldKg + params.alphaSpecific * (Pgrid / 1000);
  const architecture = strategy === "auto"
    ? solarMassKg <= nuclearMassKg ? "solar" : "nuclear"
    : strategy;
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
  if (params.Tsource <= params.Tsink) {
    warnings.push({
      id: "power-hot-side",
      severity: "alarm",
      module: "power",
      message: "Fission hot-side temperature must exceed sink temperature.",
      value: params.Tsource,
      limit: params.Tsink
    });
  }
  if (params.Tsink <= params.Tenv) {
    warnings.push({
      id: "radiator-temperature",
      severity: "alarm",
      module: "power",
      message: "Radiator sink temperature must exceed its environment temperature.",
      value: params.Tsink,
      limit: params.Tenv
    });
  }

  const beamedFloorPowerW =
    params.site === "polar" && architecture === "solar"
      ? beamedPowerW(
          Parray,
          params.w0Beam,
          params.thetaDivBeam,
          params.zCraterDrop,
          params.rReceiver,
          params.etaEmitter,
          params.etaPvReceiver
        ) * params.etaWire
      : null;
  const beamDeliveryMarginW = beamedFloorPowerW === null ? null : beamedFloorPowerW - Pgrid;

  if (beamDeliveryMarginW !== null && beamDeliveryMarginW < -1e-6) {
    warnings.push({
      id: "beam-power-shortfall",
      severity: "alarm",
      module: "power",
      message: "Delivered beamed power is below the crater-floor load.",
      value: beamedFloorPowerW ?? 0,
      limit: Pgrid
    });
  }

  return {
    architecture,
    solarMassKg,
    nuclearMassKg,
    solarArrayM2,
    radiatorM2,
    pCritW: pCrit === null ? 0 : pCrit * 1000,
    pCritDynamicW: pCritDynamic === null ? 0 : pCritDynamic * 1000,
    beamedFloorPowerW,
    beamDeliveryMarginW,
    solarDeliveredCapacityW,
    siteDayHours: dayHours,
    siteNightHours: nightHours,
    siteProfile: activeProfile,
    selectedPowerMassKg,
    warnings
  };
}

export function beamEfficiency(
  w0Beam: number,
  thetaDivBeam: number,
  zCraterDrop: number,
  rReceiver: number,
  etaEmitter: number,
  etaPvReceiver: number
): number {
  const wBeam = w0Beam + thetaDivBeam * zCraterDrop;
  const etaGeo = 1 - Math.exp((-2 * rReceiver ** 2) / wBeam ** 2);
  return etaEmitter * etaGeo * etaPvReceiver;
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
  return ParrayRimW * beamEfficiency(w0Beam, thetaDivBeam, zCraterDrop, rReceiver, etaEmitter, etaPvReceiver);
}
