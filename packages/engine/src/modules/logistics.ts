import { PHYSICAL_CONSTANTS } from "../constants";
import type { ManifestRow, SimParams } from "../types";

export interface LogisticsOutput {
  payloadPerMissionKg: number;
  totalInfraMassKg: number;
  nMissions: number;
  leverageL: number;
  paybackDays: number;
  manifest: ManifestRow[];
}

export function payloadPerMissionKg(params: SimParams): number {
  return (
    params.M0leo * Math.exp(-params.dvTotal / (params.IspLander * PHYSICAL_CONSTANTS.g0.value)) -
    params.MdryLander -
    params.MresidProp
  );
}

export function simulateLogistics(
  params: SimParams,
  fleetMassKg: number,
  reactorMassKg: number,
  powerMassKg: number,
  cryoMassKg: number
): LogisticsOutput {
  const payload = payloadPerMissionKg(params);
  const totalInfraMassKg = fleetMassKg + reactorMassKg + powerMassKg + cryoMassKg;
  const capacity = params.etaPack * payload;
  const nMissions = capacity > 0 ? Math.max(0, Math.ceil(totalInfraMassKg / capacity)) : 0;
  const paybackDays = totalInfraMassKg / params.targetKgPerDay;
  const annualProductKg = params.targetKgPerDay * 365;
  const leverageL = totalInfraMassKg !== 0 ? (annualProductKg * params.missionYears * params.gearRatio) / totalInfraMassKg : 0;
  const manifest: ManifestRow[] = [
    { subsystem: "excavation fleet", massKg: fleetMassKg },
    { subsystem: "reactor/plant", massKg: reactorMassKg },
    { subsystem: "power system", massKg: powerMassKg },
    { subsystem: "cryo block", massKg: cryoMassKg }
  ];

  return {
    payloadPerMissionKg: payload,
    totalInfraMassKg,
    nMissions,
    leverageL,
    paybackDays,
    manifest
  };
}
