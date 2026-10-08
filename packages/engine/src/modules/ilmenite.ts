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
export function ilmeniteSeparates(params: Pick<SimParams, "ilmConcentrateGrade" | "fIlmenite" | "ilmFeed" | "fIlmBasalt">): boolean {
  return params.ilmConcentrateGrade > ilmeniteFeedGrade(params);
}

/** True when the ilmenite plant crushes and grinds basalt instead of sizing soil. */
export function feedsBasalt(params: Pick<SimParams, "ilmFeed">): boolean {
  return params.ilmFeed === "basalt";
}

/** Ilmenite mass fraction of the feed before separation [kg/kg]. */
export function ilmeniteFeedGrade(params: Pick<SimParams, "fIlmenite" | "ilmFeed" | "fIlmBasalt">): number {
  return feedsBasalt(params) ? params.fIlmBasalt : params.fIlmenite;
}

/**
 * Feed inside the reactor's size window per kg of the stream it comes from
 * [kg/kg]: the sized share of soil, or the coarse share of ground basalt.
 */
function sizedShare(params: SimParams): number {
  return feedsBasalt(params) ? params.fBasaltSized : params.fIlmSized;
}

/**
 * Feed (soil, or basalt to the crushers) per kg of oxygen [kg/kg]. Only feed
 * inside the reactor's size window reaches it; the separator, when there is
 * one, recovers part of its ilmenite (on basalt, only the grains grinding
 * freed); and the reactor reduces part of what it is fed.
 */
function feedPerKgO2(params: SimParams): number {
  const separates = ilmeniteSeparates(params);
  const recovery = separates ? params.etaIlmRecovery * (feedsBasalt(params) ? params.fIlmLiberated : 1) : 1;
  return 1 / (ilmeniteFeedGrade(params) * sizedShare(params) * recovery * ilmeniteConversion(params) * ilmeniteOxygenFraction());
}

/**
 * Fraction of the fed ilmenite reduced [1]. Each fluidized-bed stage is
 * treated as well mixed, with a rate first order in the ilmenite left:
 *   X = 1 − (1 + k·τ/N)^−N,  k = k_ref · exp(−Ea/R · (1/T − 1/T_ref))
 * k_ref is fixed by Eagle's design point (90% at T_ref and τ_ref in N
 * stages) and Ea defaults to Zhao & Shadman's measurement, so temperature
 * and residence time both move conversion. A screening form, not a grain model.
 */
export function ilmeniteConversion(params: Pick<SimParams, "TIlmReactor" | "tIlmResidenceH" | "EaIlmReduction">): number {
  const stages = PHYSICAL_CONSTANTS.nIlmBedStages.value;
  const refRatePerH =
    (stages * (Math.pow(1 - PHYSICAL_CONSTANTS.ilmConversionRef.value, -1 / stages) - 1)) /
    PHYSICAL_CONSTANTS.tIlmResidenceRefH.value;
  const ratePerH =
    refRatePerH *
    Math.exp(
      (-params.EaIlmReduction / PHYSICAL_CONSTANTS.R.value) *
        (1 / params.TIlmReactor - 1 / PHYSICAL_CONSTANTS.TIlmReactorRef.value)
    );
  return 1 - Math.pow(1 + (ratePerH * params.tIlmResidenceH) / stages, -stages);
}

/**
 * Soil mined per kg of oxygen [kg/kg]. Only soil inside the reactor's size
 * window is fed, the separator (when there is one) recovers part of its
 * ilmenite, and the reactor reduces part of what it is fed.
 */
export function ilmeniteSoilPerKgO2(params: SimParams): number {
  // A basalt mine digs a layer that is part basalt, part soil and oversize.
  return feedsBasalt(params) ? feedPerKgO2(params) / params.fBasaltInMined : feedPerKgO2(params);
}

/** Overburden stripped per kg of oxygen [kg/kg]; a soil plant mines the surface. */
export function ilmeniteOverburdenPerKgO2(params: SimParams): number {
  return feedsBasalt(params) ? params.basaltOverburdenRatio * ilmeniteSoilPerKgO2(params) : 0;
}

/**
 * Hydrogen reduction of ilmenite: soil is mined, sized, and magnetically
 * concentrated; the concentrate is heated to TIlmReactor and reduced by
 * hydrogen; the water made is split, its hydrogen returned to the reactor,
 * and its oxygen sent to storage. Energies are per kg of O2.
 */
export function simulateIlmenite(params: SimParams, o2KgPerDay: number): IlmeniteResult {
  const conversion = ilmeniteConversion(params);
  const reducedPerKgO2 = 1 / ilmeniteOxygenFraction();
  const fedIlmenitePerKgO2 = reducedPerKgO2 / conversion;
  const soilPerKgO2 = ilmeniteSoilPerKgO2(params);
  const basalt = feedsBasalt(params);
  const basaltPerKgO2 = basalt ? feedPerKgO2(params) : 0;
  const sizedSoilPerKgO2 = (basalt ? basaltPerKgO2 : soilPerKgO2) * sizedShare(params);
  // Soil is sized and separated; basalt is crushed, ground, screened, and separated.
  const beneficiatedPerKgO2 = basalt ? basaltPerKgO2 : soilPerKgO2;
  const beneficiationJPerKg = basalt ? params.eIlmComminution : params.eIlmBeneficiation;
  const beneficiationMassCoefficient = basalt ? params.kIlmComminutionMass : params.kIlmBeneficiationMass;
  const movedPerKgO2 = soilPerKgO2 + ilmeniteOverburdenPerKgO2(params);
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
  // The bed holds the feed for its residence time; the slower the reduction
  // or the leaner the feed, the more it holds and the heavier it is.
  const bedHoldupKg = (concentrateKgPerDay / 24) * params.tIlmResidenceH;
  const bedMassKg = params.kIlmBedMass * bedHoldupKg;

  return {
    conversion,
    soilPerKgO2,
    soilKgPerDay,
    basaltFedKgPerDay: o2KgPerDay * basaltPerKgO2,
    sizedSoilKgPerDay: o2KgPerDay * sizedSoilPerKgO2,
    concentrateKgPerDay,
    concentrateGrade: fedIlmenitePerKgO2 / concentratePerKgO2,
    tailingsKgPerDay: soilKgPerDay - concentrateKgPerDay,
    ilmeniteReducedKgPerDay: o2KgPerDay * reducedPerKgO2,
    waterKgPerDay: o2KgPerDay * waterPerKgO2,
    hydrogenRecycleKgPerDay: water.grossH2KgPerDay,
    spentSolidsKgPerDay: concentrateKgPerDay - o2KgPerDay,
    ironKgPerDay: o2KgPerDay * ironPerKgO2,
    secMining_JPerKg: params.eMining * movedPerKgO2,
    secBeneficiation_JPerKg: beneficiationJPerKg * beneficiatedPerKgO2,
    secSensible_JPerKg,
    secReaction_JPerKg,
    secReactorLoss_JPerKg: params.fIlmHeatLoss * (secSensible_JPerKg + secReaction_JPerKg),
    secWaterElectrolysis_JPerKg: water.secWaterElectrolysis_JPerKg * waterPerKgO2,
    miningMassKg: params.kMiningMass * (o2KgPerDay * movedPerKgO2),
    beneficiationMassKg: beneficiationMassCoefficient * o2KgPerDay * beneficiatedPerKgO2,
    bedHoldupKg,
    bedMassKg,
    reactorMassKg: params.kIlmGasLoopMass * o2KgPerDay + bedMassKg,
    electrolyzerMassKg: params.kElectrolyzerMass * o2KgPerDay * waterPerKgO2
  };
}
