import { DEFAULTS, PHYSICAL_CONSTANTS } from "../constants";
import type { OxideYield, SimParams, Warning } from "../types";

export interface ElectrolysisOutput {
  secElec_JPerKg: number;
  secThermal_JPerKg: number;
  secParasitic_JPerKg: number;
  currentA: number;
  cellVoltageV: number;
  jLimit_APerM2: number;
  jOperating_APerM2: number;
  meltViscosityPaS: number;
  drainVelocityMPerS: number;
  reactorMassKg: number;
  xO2Effective: number;
  oxideYield: OxideYield[];
  reversibleVoltageV: number;
  activationOverpotentialV: number;
  ohmicOverpotentialV: number;
  concentrationOverpotentialV: number;
  unallocatedVoltageV: number;
  voltageMarginV: number;
  electrodeAreaM2: number;
  currentUtilization: number;
  electricalInputW: number;
  chemicalPowerW: number;
  modeledLossPowerW: number;
  warnings: Warning[];
}

interface OxideDef {
  oxide: string;
  fraction: (params: SimParams) => number;
  oxygens: number;
  molarMassKgPerMol: number;
  ellA_JPerMolO2: number;
  ellB_JPerMolO2K: number;
}

interface OxideModelOutput {
  xO2Effective: number;
  oxideYield: OxideYield[];
  reversibleVoltageV: number;
  availableVoltageV: number;
}

interface VoltageLosses {
  activationV: number;
  ohmicV: number;
  concentrationV: number;
  availableVoltageV: number;
  jLimit_APerM2: number;
}

const OXIDES: OxideDef[] = [
  {
    oxide: "SiO2",
    fraction: (params) => params.oxideSiO2,
    oxygens: 2,
    molarMassKgPerMol: PHYSICAL_CONSTANTS.M_SiO2.value,
    ellA_JPerMolO2: PHYSICAL_CONSTANTS.oxideEllinghamSiO2A.value,
    ellB_JPerMolO2K: PHYSICAL_CONSTANTS.oxideEllinghamSiO2B.value
  },
  {
    oxide: "TiO2",
    fraction: (params) => params.oxideTiO2,
    oxygens: 2,
    molarMassKgPerMol: PHYSICAL_CONSTANTS.M_TiO2.value,
    ellA_JPerMolO2: PHYSICAL_CONSTANTS.oxideEllinghamTiO2A.value,
    ellB_JPerMolO2K: PHYSICAL_CONSTANTS.oxideEllinghamTiO2B.value
  },
  {
    oxide: "Al2O3",
    fraction: (params) => params.oxideAl2O3,
    oxygens: 3,
    molarMassKgPerMol: PHYSICAL_CONSTANTS.M_Al2O3.value,
    ellA_JPerMolO2: PHYSICAL_CONSTANTS.oxideEllinghamAl2O3A.value,
    ellB_JPerMolO2K: PHYSICAL_CONSTANTS.oxideEllinghamAl2O3B.value
  },
  {
    oxide: "FeO",
    fraction: (params) => params.oxideFeO,
    oxygens: 1,
    molarMassKgPerMol: PHYSICAL_CONSTANTS.M_FeO.value,
    ellA_JPerMolO2: PHYSICAL_CONSTANTS.oxideEllinghamFeOA.value,
    ellB_JPerMolO2K: PHYSICAL_CONSTANTS.oxideEllinghamFeOB.value
  },
  {
    oxide: "MgO",
    fraction: (params) => params.oxideMgO,
    oxygens: 1,
    molarMassKgPerMol: PHYSICAL_CONSTANTS.M_MgO.value,
    ellA_JPerMolO2: PHYSICAL_CONSTANTS.oxideEllinghamMgOA.value,
    ellB_JPerMolO2K: PHYSICAL_CONSTANTS.oxideEllinghamMgOB.value
  },
  {
    oxide: "CaO",
    fraction: (params) => params.oxideCaO,
    oxygens: 1,
    molarMassKgPerMol: PHYSICAL_CONSTANTS.M_CaO.value,
    ellA_JPerMolO2: PHYSICAL_CONSTANTS.oxideEllinghamCaOA.value,
    ellB_JPerMolO2K: PHYSICAL_CONSTANTS.oxideEllinghamCaOB.value
  }
];

export function secElecJPerKg(Vcell: number, etaCurrent: number): number {
  return (Vcell * 4 * PHYSICAL_CONSTANTS.F.value) / (PHYSICAL_CONSTANTS.M_O2.value * etaCurrent);
}

export function cpRegolithJPerKgK(T: number): number {
  return (
    PHYSICAL_CONSTANTS.cpRegMaierA.value +
    PHYSICAL_CONSTANTS.cpRegMaierB.value * T +
    PHYSICAL_CONSTANTS.cpRegMaierC.value / T ** 2
  );
}

export function sensibleHeatRegolithJPerKg(Tambient: number, Tmelt: number, cpScale: number): number {
  const a = PHYSICAL_CONSTANTS.cpRegMaierA.value;
  const b = PHYSICAL_CONSTANTS.cpRegMaierB.value;
  const c = PHYSICAL_CONSTANTS.cpRegMaierC.value;
  const baseIntegral =
    a * (Tmelt - Tambient) +
    (b / 2) * (Tmelt ** 2 - Tambient ** 2) -
    c * (1 / Tmelt - 1 / Tambient);
  return baseIntegral * (cpScale / DEFAULTS.cpRegMelt);
}

export function meltHeatJPerKg(params: SimParams): number {
  return sensibleHeatRegolithJPerKg(params.Tambient, params.Tmelt, params.cpRegMelt) + params.dHfus;
}

export function oxideO2KgPerKg(oxygens: number, molarMassKgPerMol: number): number {
  return ((oxygens / 2) * PHYSICAL_CONSTANTS.M_O2.value) / molarMassKgPerMol;
}

export function oxideDecompositionVoltage(ellA_JPerMolO2: number, ellB_JPerMolO2K: number, T: number): number {
  const dGf_JPerMolO2 = ellA_JPerMolO2 + ellB_JPerMolO2K * T;
  return -dGf_JPerMolO2 / (4 * PHYSICAL_CONSTANTS.F.value);
}

export function mreVoltageLosses(params: SimParams): VoltageLosses {
  const jLimit_APerM2 =
    (4 * PHYSICAL_CONSTANTS.F.value * params.Dox * params.Cbulk) / params.deltaDiff;
  const utilization = Math.min(0.999999, Math.max(0, params.jOperating / Math.max(1e-12, jLimit_APerM2)));
  const concentrationV =
    (PHYSICAL_CONSTANTS.R.value * params.Tmelt / (4 * PHYSICAL_CONSTANTS.F.value)) *
    Math.log(1 / Math.max(1e-9, 1 - utilization));
  const activationV = params.mreActivationOverpotentialV;
  const ohmicV = params.jOperating * params.mreAreaSpecificResistanceOhmM2;
  return {
    activationV,
    ohmicV,
    concentrationV,
    availableVoltageV: params.Vcell - activationV - ohmicV - concentrationV,
    jLimit_APerM2
  };
}

function compositionWeightedVoltage(params: SimParams, active: boolean[]): number {
  const rawFractions = OXIDES.map((oxide) => Math.max(0, oxide.fraction(params)));
  const scale = Math.max(1, rawFractions.reduce((total, value) => total + value, 0));
  let weighted = 0;
  let oxygenBasis = 0;
  for (let index = 0; index < OXIDES.length; index += 1) {
    if (!active[index]) continue;
    const oxide = OXIDES[index]!;
    const basis = rawFractions[index]! / scale * oxideO2KgPerKg(oxide.oxygens, oxide.molarMassKgPerMol);
    weighted += basis * oxideDecompositionVoltage(oxide.ellA_JPerMolO2, oxide.ellB_JPerMolO2K, params.Tmelt);
    oxygenBasis += basis;
  }
  return oxygenBasis > 0 ? weighted / oxygenBasis : 0;
}

export function oxideModelYield(params: SimParams): OxideModelOutput {
  const voltage = mreVoltageLosses(params);
  if (!params.oxideModel) {
    return {
      xO2Effective: params.xO2 * params.fExtract,
      oxideYield: OXIDES.map((oxide) => ({
        oxide: oxide.oxide,
        o2KgPerKg: 0,
        decomposed: false
      })),
      reversibleVoltageV: compositionWeightedVoltage(params, OXIDES.map(() => true)),
      availableVoltageV: voltage.availableVoltageV
    };
  }

  const rawFractions = OXIDES.map((oxide) => Math.max(0, oxide.fraction(params)));
  const rawTotal = rawFractions.reduce((total, value) => total + value, 0);
  if (rawTotal <= 0) {
    return {
      xO2Effective: params.xO2 * params.fExtract,
      oxideYield: OXIDES.map((oxide) => ({
        oxide: oxide.oxide,
        o2KgPerKg: 0,
        decomposed: false
      })),
      reversibleVoltageV: 0,
      availableVoltageV: voltage.availableVoltageV
    };
  }

  const fractionScale = Math.max(1, rawTotal);
  const recovery = params.fExtract * PHYSICAL_CONSTANTS.oxideRecoveryCalibration.value;
  let xO2Effective = 0;
  const oxideYield: OxideYield[] = [];

  for (let i = 0; i < OXIDES.length; i += 1) {
    const oxide = OXIDES[i]!;
    const massFrac = rawFractions[i]! / fractionScale;
    const decomposed =
      oxideDecompositionVoltage(oxide.ellA_JPerMolO2, oxide.ellB_JPerMolO2K, params.Tmelt) <=
      voltage.availableVoltageV;
    const o2KgPerKg = decomposed ? massFrac * oxideO2KgPerKg(oxide.oxygens, oxide.molarMassKgPerMol) * recovery : 0;
    xO2Effective += o2KgPerKg;
    oxideYield.push({
      oxide: oxide.oxide,
      o2KgPerKg,
      decomposed
    });
  }

  return {
    xO2Effective: Math.max(1e-9, xO2Effective),
    oxideYield,
    reversibleVoltageV: compositionWeightedVoltage(params, oxideYield.map((row) => row.decomposed)),
    availableVoltageV: voltage.availableVoltageV
  };
}

export function simulateElectrolysis(params: SimParams): ElectrolysisOutput {
  const secElec_JPerKg = secElecJPerKg(params.Vcell, params.etaCurrent);
  const voltageLosses = mreVoltageLosses(params);
  const oxideModel = oxideModelYield(params);
  const Rreg = 1 / oxideModel.xO2Effective;
  const Qmelt = meltHeatJPerKg(params);
  const secThermal_JPerKg = Rreg * Qmelt;
  const secParasitic_JPerKg = params.fParasitic * (secElec_JPerKg + secThermal_JPerKg);
  const mdotO2_kgPerS = params.targetKgPerDay / 86400;
  const currentA =
    (mdotO2_kgPerS * 4 * PHYSICAL_CONSTANTS.F.value) /
    (PHYSICAL_CONSTANTS.M_O2.value * params.etaCurrent);
  const meltViscosityPaS = params.Amu * params.Tmelt * Math.exp(params.Bmu / (params.Tmelt - params.T0vft));
  const drainVelocityMPerS =
    (params.rhoSlag * PHYSICAL_CONSTANTS.gL.value * params.hMelt ** 2 * Math.sin(params.thetaDrain)) /
    (3 * meltViscosityPaS);
  const jLimit_APerM2 = voltageLosses.jLimit_APerM2;
  const jOperating_APerM2 = params.jOperating;
  const electrodeAreaM2 = currentA / jOperating_APerM2;
  const currentUtilization = jOperating_APerM2 / jLimit_APerM2;
  const modeledRequiredVoltageV =
    oxideModel.reversibleVoltageV + voltageLosses.activationV + voltageLosses.ohmicV + voltageLosses.concentrationV;
  const voltageMarginV = params.Vcell - modeledRequiredVoltageV;
  const unallocatedVoltageV = Math.max(0, voltageMarginV);
  const electricalInputW = currentA * params.Vcell;
  const chemicalPowerW = currentA * params.etaCurrent * oxideModel.reversibleVoltageV;
  const modeledLossPowerW = Math.max(0, electricalInputW - chemicalPowerW);
  const reactorMassKg = params.kReactorMass * params.targetKgPerDay;
  const warnings: Warning[] = [];

  if (jOperating_APerM2 > 0.85 * jLimit_APerM2) {
    warnings.push({
      id: "anode-current",
      severity: "alarm",
      module: "electrolysis",
      message: "Operating current density exceeds 85% of limiting current density.",
      value: jOperating_APerM2,
      limit: 0.85 * jLimit_APerM2
    });
  }
  if (voltageMarginV < 0) {
    warnings.push({
      id: "mre-voltage-shortfall",
      severity: "alarm",
      module: "electrolysis",
      message: "Applied MRE voltage is below the modeled reversible, activation, ohmic, and concentration requirement.",
      value: params.Vcell,
      limit: modeledRequiredVoltageV
    });
  }
  if (oxideModel.oxideYield.every((row) => !row.decomposed) && params.oxideModel) {
    warnings.push({
      id: "mre-no-oxide-yield",
      severity: "alarm",
      module: "electrolysis",
      message: "No modeled oxide is energetically accessible at the current voltage-loss operating point.",
      value: oxideModel.availableVoltageV,
      limit: Math.min(...OXIDES.map((oxide) => oxideDecompositionVoltage(oxide.ellA_JPerMolO2, oxide.ellB_JPerMolO2K, params.Tmelt)))
    });
  }

  return {
    secElec_JPerKg,
    secThermal_JPerKg,
    secParasitic_JPerKg,
    currentA,
    cellVoltageV: params.Vcell,
    jLimit_APerM2,
    jOperating_APerM2,
    meltViscosityPaS,
    drainVelocityMPerS,
    reactorMassKg,
    xO2Effective: oxideModel.xO2Effective,
    oxideYield: oxideModel.oxideYield,
    reversibleVoltageV: oxideModel.reversibleVoltageV,
    activationOverpotentialV: voltageLosses.activationV,
    ohmicOverpotentialV: voltageLosses.ohmicV,
    concentrationOverpotentialV: voltageLosses.concentrationV,
    unallocatedVoltageV,
    voltageMarginV,
    electrodeAreaM2,
    currentUtilization,
    electricalInputW,
    chemicalPowerW,
    modeledLossPowerW,
    warnings
  };
}
