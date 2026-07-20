export type SiteMode = "equatorial" | "polar";
export type PowerArchitecture = "solar" | "nuclear";
export type WarningSeverity = "info" | "caution" | "alarm";

export interface Warning {
  id: string;
  severity: WarningSeverity;
  module: string;
  message: string;
  value: number;
  limit: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  /** [kWh/kg product] */
  kWhPerKg: number;
}

export interface ManifestRow {
  subsystem: string;
  /** [kg] */
  massKg: number;
}

export interface OxideYield {
  oxide: string;
  /** [kg O2/kg regolith] */
  o2KgPerKg: number;
  decomposed: boolean;
}

export interface ParamMeta {
  value: number | string | boolean;
  min?: number;
  max?: number;
  unit: string;
  kind: "parameter";
  group: string;
  description: string;
  source: string;
}

export interface PhysicalConstantMeta {
  value: number;
  unit: string;
  kind: "physical";
  description: string;
  source: string;
}

export interface SimParams {
  site: SiteMode;
  /** [kg/day] */
  targetKgPerDay: number;
  /** [yr] */
  missionYears: number;
  enableSabatier: boolean;
  /** [kg/m^3] */
  rhoReg: number;
  /** [Pa] */
  c: number;
  Nc: number;
  Nq: number;
  Ngamma: number;
  /** [m] */
  zDepth: number;
  /** [m] */
  wBlade: number;
  /** [m] */
  dBlade: number;
  /** [m/s] */
  vCut: number;
  etaDrive: number;
  /** [J/kg-regolith] */
  eMining: number;
  /** [kg/(kg/day)] */
  kExcFleet: number;
  chiIce: number;
  /** [J/(kg*K)] */
  cpRegCold: number;
  /** [K] */
  Tpsr: number;
  /** [K] */
  Tsub: number;
  /** [W/(m*K)] */
  kc: number;
  /** [W/(m*K^4)] */
  kr: number;
  /** [m] */
  rPore: number;
  /** [V] */
  Vcell: number;
  etaCurrent: number;
  xO2: number;
  fExtract: number;
  oxideModel: boolean;
  oxideSiO2: number;
  oxideTiO2: number;
  oxideAl2O3: number;
  oxideFeO: number;
  oxideMgO: number;
  oxideCaO: number;
  /** [J/(kg*K)] */
  cpRegMelt: number;
  /** [K] */
  Tmelt: number;
  /** [K] */
  Tambient: number;
  /** [J/kg] */
  dHfus: number;
  fParasitic: number;
  /** [Pa*s/K] */
  Amu: number;
  /** [K] */
  Bmu: number;
  /** [K] */
  T0vft: number;
  /** [kg/m^3] */
  rhoSlag: number;
  /** [m] */
  hMelt: number;
  /** [rad] */
  thetaDrain: number;
  /** [m^2/s] */
  Dox: number;
  /** [mol/m^3] */
  Cbulk: number;
  /** [m] */
  deltaDiff: number;
  /** [A/m^2] */
  jOperating: number;
  /** [kg/(kg/day)] */
  kReactorMass: number;
  /** [V] */
  Vel: number;
  etaFaradayEl: number;
  fConversion: number;
  /** [K] */
  Tsabatier: number;
  /** [day] */
  reserveDays: number;
  /** [kg/m^3] */
  rhoCryo: number;
  alphaTank: number;
  epsTank: number;
  Fview: number;
  /** [K] */
  Tsurface: number;
  /** [K] */
  Ttank: number;
  /** [layers] */
  Nmli: number;
  /** [layers/cm] */
  Nlaydens: number;
  C1mli: number;
  rExp: number;
  C2mli: number;
  epsLayer: number;
  /** [W] */
  qStrutW: number;
  eta2ndLaw: number;
  /** [kWh/kg] */
  secLiquefaction: number;
  /** [kg/(kg/day)] */
  kCryoMass: number;
  etaWire: number;
  etaRoundTrip: number;
  etaCell: number;
  /** [rad] */
  thetaSun: number;
  Fdegrade: number;
  DoD: number;
  etaDischarge: number;
  /** [Wh/kg] */
  SEstorage: number;
  /** [kg/kW] */
  Rarray: number;
  /** [K] */
  Tsource: number;
  /** [K] */
  Tsink: number;
  /** [K] */
  Tenv: number;
  etaMech: number;
  etaRad: number;
  epsRad: number;
  /** [kg] */
  MshieldKg: number;
  /** [kg/kW] */
  alphaSpecific: number;
  /** [1/yr] */
  dSolar: number;
  /** [1/yr] */
  dNuclear: number;
  /** [m] */
  w0Beam: number;
  /** [rad] */
  thetaDivBeam: number;
  /** [m] */
  zCraterDrop: number;
  /** [m] */
  rReceiver: number;
  etaEmitter: number;
  etaPvReceiver: number;
  /** [kg] */
  M0leo: number;
  /** [m/s] */
  dvTotal: number;
  /** [s] */
  IspLander: number;
  /** [kg] */
  MdryLander: number;
  /** [kg] */
  MresidProp: number;
  etaPack: number;
  /** [kg/kg] */
  gearRatio: number;
  /** [Pa] */
  Pinternal: number;
  /** [Pa] */
  Eslag: number;
  /** [1/K] */
  alphaCte: number;
  nu: number;
  /** [Pa] */
  sigmaTensile: number;
  /** [kg/m^3] */
  rhoGasPlume: number;
  /** [m/s] */
  vGasPlume: number;
  Cf: number;
  /** [Pa] */
  tauAllowable: number;
  FS: number;
  /** [m] */
  dPad: number;
  /** [m] */
  tPad: number;
  /** [m] */
  shieldDesignM: number;
  /** [m^2] */
  areaHabRoof: number;
  fDistill: number;
  /** [K] */
  castDeltaT: number;
}

export interface SimResult {
  site: SiteMode;
  production: {
    targetKgPerDay: number;
    regolithKgPerDay: number;
    slagKgPerDay: number;
    o2KgPerDay: number;
    waterKgPerDay: number;
    h2KgPerDay: number;
    ch4KgPerDay: number;
  };
  energy: {
    secTotal_kWhPerKg: number;
    flows: FlowEdge[];
    /** [W] */
    gridPowerW: number;
  };
  excavation: {
    /** [N] */
    cuttingForceN: number;
    /** [W] */
    mechPowerW: number;
    /** [kg] */
    fleetMassKg: number;
  };
  electrolysis: {
    /** [J/kg O2] */
    secElec_JPerKg: number;
    /** [J/kg O2] */
    secThermal_JPerKg: number;
    /** [A] */
    currentA: number;
    /** [V] */
    cellVoltageV: number;
    /** [A/m^2] */
    jLimit_APerM2: number;
    /** [A/m^2] */
    jOperating_APerM2: number;
    /** [Pa*s] */
    meltViscosityPaS: number;
    /** [m/s] */
    drainVelocityMPerS: number;
    /** [kg O2/kg regolith] */
    xO2Effective: number;
    oxideYield: OxideYield[];
  };
  thermal: {
    /** [J/kg H2O] */
    secSub_JPerKg: number | null;
    /** [m^2/s] */
    knudsenD_M2PerS: number;
    /** [W/(m*K)] */
    conductivity_WPerMK: number;
  };
  cryo: {
    /** [W] */
    qLeakW: number;
    /** [kg/day] */
    boiloffKgPerDay: number;
    /** [W] */
    cryocoolerPowerW: number;
    /** [W/m^2] */
    mliFlux_WPerM2: number;
  };
  power: {
    architecture: PowerArchitecture;
    /** [kg] */
    solarMassKg: number;
    /** [kg] */
    nuclearMassKg: number;
    /** [m^2] */
    solarArrayM2: number;
    /** [m^2] */
    radiatorM2: number;
    /** [W] */
    pCritW: number;
    /** [W] */
    pCritDynamicW: number;
    /** [W] */
    beamedFloorPowerW: number | null;
  };
  logistics: {
    /** [kg] */
    payloadPerMissionKg: number;
    /** [kg] */
    totalInfraMassKg: number;
    nMissions: number;
    leverageL: number;
    paybackDays: number;
    manifest: ManifestRow[];
  };
  construction: {
    /** [t/yr] */
    slagPerYearT: number;
    /** [m] */
    shieldFullBalanceM: number;
    /** [m] */
    shieldDesignM: number;
    /** [K] */
    maxSafeCoolingDeltaK: number;
    /** [Pa] */
    padShearPa: number;
    padJointUtilization: number;
    padsPerYear: number;
    daysToShieldHabitat: number;
  };
  warnings: Warning[];
}

export interface TimeseriesOptions {
  cycles: number;
  samplesPerCycle: number;
}

export interface TimeseriesPoint {
  /** [h] */
  tHours: number;
  daylight: boolean;
  /** [W] */
  solarOutputW: number;
  /** [W] */
  loadW: number;
  /** [0..1] */
  batterySoC: number;
  /** [kg] */
  tankFillKg: number;
  /** [kg/day] */
  boiloffKgPerDay: number;
  /** [kg/day] */
  netProductionKgPerDay: number;
}

export interface TimeseriesResult {
  points: TimeseriesPoint[];
  summary: {
    minSoC: number;
    dutyCycle: number;
    /** [kg] */
    tankPeakKg: number;
    curtailedFraction: number;
  };
}

export interface UncertaintySpec {
  key: keyof SimParams;
  /** relative sigma */
  rel: number;
}

export interface UncertaintyBand {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

export type UncertaintyResult = Record<"paybackDays" | "secTotal" | "nMissions" | "leverageL", UncertaintyBand>;
