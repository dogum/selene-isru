import { PHYSICAL_CONSTANTS } from "../constants";
import type { IlmeniteResult, SimParams } from "../types";
import { simulateWaterElectrolysis } from "./sabatier";

/** Oxygen removed per kg of ilmenite reduced, FeTiO3 + H2 → Fe + TiO2 + H2O [kg/kg]. */
export function ilmeniteOxygenFraction(): number {
  return (PHYSICAL_CONSTANTS.M_O2.value / 2) / (PHYSICAL_CONSTANTS.M_FeO.value + PHYSICAL_CONSTANTS.M_TiO2.value);
}

/** True when the equatorial plant reduces ilmenite instead of running MRE. */
export function reducesIlmenite(params: Pick<SimParams, "site" | "equatorialProcess">): boolean {
  return params.site === "equatorial" && params.equatorialProcess === "ilmenite";
}

/**
 * True when magnetic separation enriches the feed. A concentrate no richer
 * than the soil is no separation at all: the whole sized stream goes to the
 * reactor with all its ilmenite, and no recovery loss applies.
 */
export function ilmeniteSeparates(params: Pick<SimParams, "ilmConcentrateGrade" | "fIlmenite">): boolean {
  return params.ilmConcentrateGrade > params.fIlmenite;
}

/**
 * Soil mined per kg of oxygen [kg/kg]. Only soil inside the reactor's size
 * window is fed, the separator (when there is one) recovers part of its
 * ilmenite, and the reactor reduces part of what it is fed.
 */
export function ilmeniteSoilPerKgO2(params: SimParams): number {
  const recovery = ilmeniteSeparates(params) ? params.etaIlmRecovery : 1;
  return 1 / (params.fIlmenite * params.fIlmSized * recovery * params.fIlmConversion * ilmeniteOxygenFraction());
}

/**
 * Hydrogen reduction of ilmenite: soil is mined, sized, and magnetically
 * concentrated; the concentrate is heated to TIlmReactor and reduced by
 * hydrogen; the water made is split, its hydrogen returned to the reactor,
 * and its oxygen sent to storage. Energies are per kg of O2.
 */
export function simulateIlmenite(params: SimParams, o2KgPerDay: number): IlmeniteResult {
  const reducedPerKgO2 = 1 / ilmeniteOxygenFraction();
  const fedIlmenitePerKgO2 = reducedPerKgO2 / params.fIlmConversion;
  const soilPerKgO2 = ilmeniteSoilPerKgO2(params);
  const sizedSoilPerKgO2 = soilPerKgO2 * params.fIlmSized;
  // Without enrichment the reactor takes the whole sized stream.
  const concentratePerKgO2 = ilmeniteSeparates(params) ? fedIlmenitePerKgO2 / params.ilmConcentrateGrade : sizedSoilPerKgO2;
  const waterPerKgO2 = PHYSICAL_CONSTANTS.M_H2O.value / (PHYSICAL_CONSTANTS.M_O2.value / 2);
  const ironPerKgO2 =
    reducedPerKgO2 * (PHYSICAL_CONSTANTS.M_FeO.value - PHYSICAL_CONSTANTS.M_O2.value / 2) /
    (PHYSICAL_CONSTANTS.M_FeO.value + PHYSICAL_CONSTANTS.M_TiO2.value);

  const secSensible_JPerKg =
    concentratePerKgO2 *
    PHYSICAL_CONSTANTS.cpIlmeniteFeed.value *
    (params.TIlmReactor - params.Tambient) *
    (1 - params.etaIlmHeatRecovery);
  const secReaction_JPerKg = PHYSICAL_CONSTANTS.dHIlmeniteReduction.value * reducedPerKgO2;
  const water = simulateWaterElectrolysis(params, o2KgPerDay * waterPerKgO2);
  const soilKgPerDay = o2KgPerDay * soilPerKgO2;
  const concentrateKgPerDay = o2KgPerDay * concentratePerKgO2;

  return {
    soilPerKgO2,
    soilKgPerDay,
    sizedSoilKgPerDay: o2KgPerDay * sizedSoilPerKgO2,
    concentrateKgPerDay,
    concentrateGrade: fedIlmenitePerKgO2 / concentratePerKgO2,
    tailingsKgPerDay: soilKgPerDay - concentrateKgPerDay,
    ilmeniteReducedKgPerDay: o2KgPerDay * reducedPerKgO2,
    waterKgPerDay: o2KgPerDay * waterPerKgO2,
    hydrogenRecycleKgPerDay: water.grossH2KgPerDay,
    spentSolidsKgPerDay: concentrateKgPerDay - o2KgPerDay,
    ironKgPerDay: o2KgPerDay * ironPerKgO2,
    secMining_JPerKg: params.eIlmMining * soilPerKgO2,
    secBeneficiation_JPerKg: params.eIlmBeneficiation * soilPerKgO2,
    secSensible_JPerKg,
    secReaction_JPerKg,
    secReactorLoss_JPerKg: params.fIlmHeatLoss * (secSensible_JPerKg + secReaction_JPerKg),
    secWaterElectrolysis_JPerKg: water.secWaterElectrolysis_JPerKg * waterPerKgO2,
    miningMassKg: params.kIlmMiningMass * soilKgPerDay,
    beneficiationMassKg: params.kIlmBeneficiationMass * soilKgPerDay,
    reactorMassKg: params.kIlmReactorMass * o2KgPerDay,
    electrolyzerMassKg: params.kElectrolyzerMass * o2KgPerDay * waterPerKgO2
  };
}
