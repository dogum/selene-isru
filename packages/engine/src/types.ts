export type SiteMode = "equatorial" | "polar";
export type PowerArchitecture = "solar" | "nuclear";
export type PowerStrategy = "auto" | PowerArchitecture;
export type WarningSeverity = "info" | "caution" | "alarm";
export type StorageStreamSelection = "auto" | "lox" | "water-ice" | "liquid-water" | "lh2" | "lch4" | "co2-feed" | "custom";
export type ResolvedStorageStream = Exclude<StorageStreamSelection, "auto">;
export type CryoControlMode = "zero-boiloff" | "passive" | "capacity-limited";
export type PolarProfileMode = "scalar" | "profile";

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

export interface MaterialFlow {
  material: string;
  from: string;
  to: string;
  /** [kg/day] */
  kgPerDay: number;
}

export interface ProcessBalance {
  id: string;
  label: string;
  /** [kg/day] */
  massInKgPerDay: number;
  /** [kg/day] */
  massOutKgPerDay: number;
  /** mass-in minus mass-out [kg/day] */
  residualKgPerDay: number;
}

export interface StorageInventory {
  id: string;
  stream: ResolvedStorageStream;
  role: "product" | "feed" | "buffer" | "custom";
  /** [kg/day] */
  rateKgPerDay: number;
  /** [kg] */
  reserveInventoryKg: number;
  /** [m^3] */
  volumeM3: number;
  /** [kg] */
  storageMassKg: number;
  /** [kg/m^3] */
  densityKgPerM3: number;
  /** [K] */
  storageTemperatureK: number;
  /** [kWh/kg] */
  conditioningSecKWhPerKg: number;
  /** [W] */
  conditioningPowerW: number;
  /** [W] */
  qLeakW: number;
  /** [W] */
  qRemovedW: number;
  /** [W] */
  qResidualW: number;
  /** [kg/day] */
  unmitigatedLossKgPerDay: number;
  /** [kg/day] */
  actualLossKgPerDay: number;
}

export interface EnergyProcessBalance {
  id: string;
  label: string;
  /** modeled electrical/process input [W] */
  electricalInputW: number;
  /** heat or chemical energy entering across the node boundary [W] */
  coupledInputW: number;
  /** useful duty or stored chemical/thermal rate [W] */
  usefulOutputW: number;
  /** rejected heat and modeled losses [W] */
  rejectedHeatW: number;
  /** retained inventory or state-energy rate [W] */
  accumulationW: number;
  /** inputs minus outputs [W] */
  residualW: number;
}

export interface PolarProfilePoint {
  /** elapsed profile hour; points must be strictly increasing */
  hour: number;
  /** normalized array illumination [0..1] */
  illumination: number;
  /** normalized beam receiver visibility [0..1] */
  receiverVisibility: number;
  /** local surface temperature [K] */
  surfaceTemperatureK: number;
}

export interface PolarProfileSummary {
  mode: PolarProfileMode;
  name: string;
  /** [h] */
  cycleHours: number;
  averageIllumination: number;
  averageReceiverVisibility: number;
  /** cycle average of illumination * receiver visibility */
  averageDeliveredFraction: number;
  /** [h] */
  longestShadowHours: number;
  /** [h] */
  longestReceiverOutageHours: number;
  /** [K] */
  minimumSurfaceTemperatureK: number;
  /** [K] */
  maximumSurfaceTemperatureK: number;
  points: PolarProfilePoint[];
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
  /** [V] */
  mreActivationOverpotentialV: number;
  /** [ohm*m^2] */
  mreAreaSpecificResistanceOhmM2: number;
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
  storageStream: StorageStreamSelection;
  cryoControlMode: CryoControlMode;
  /** cold-side heat-removal capacity [W] */
  coolerCapacityW: number;
  /** [kg/m^3] */
  rhoCryo: number;
  /** [J/kg] */
  customLatentHeatJPerKg: number;
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
  polarIlluminationFraction: number;
  /** [h] */
  polarLongestShadowHours: number;
  polarProfileMode: PolarProfileMode;
  /** canonical JSON site-profile payload */
  polarProfileData: string;
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
    grossH2KgPerDay: number;
    h2KgPerDay: number;
    co2ImportedKgPerDay: number;
    ch4KgPerDay: number;
    waterRecycleKgPerDay: number;
  };
  energy: {
    secTotal_kWhPerKg: number;
    flows: FlowEdge[];
    /** [W] */
    gridPowerW: number;
    balances: EnergyProcessBalance[];
    /** [W] */
    maxAbsResidualW: number;
    /** grid power minus the modeled electrical allocations [W] */
    gridAllocationResidualW: number;
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
    /** O2-yield-weighted equilibrium decomposition voltage [V] */
    reversibleVoltageV: number;
    /** [V] */
    activationOverpotentialV: number;
    /** [V] */
    ohmicOverpotentialV: number;
    /** [V] */
    concentrationOverpotentialV: number;
    /** [V] */
    unallocatedVoltageV: number;
    /** applied voltage minus modeled required voltage [V] */
    voltageMarginV: number;
    /** [m^2] */
    electrodeAreaM2: number;
    /** operating / limiting current density */
    currentUtilization: number;
    /** [W] */
    electricalInputW: number;
    /** [W] */
    chemicalPowerW: number;
    /** [W] */
    modeledLossPowerW: number;
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
    stream: ResolvedStorageStream;
    controlMode: CryoControlMode;
    /** [kg/m^3] */
    densityKgPerM3: number;
    /** [K] */
    storageTemperatureK: number;
    /** [kWh/kg] */
    conditioningSecKWhPerKg: number;
    /** [W] */
    qLeakW: number;
    /** [W] */
    qRemovedW: number;
    /** [W] */
    qResidualW: number;
    /** [kg/day] */
    unmitigatedBoiloffKgPerDay: number;
    /** [kg/day] */
    boiloffKgPerDay: number;
    /** [W] */
    cryocoolerPowerW: number;
    /** [W/m^2] */
    mliFlux_WPerM2: number;
    inventories: StorageInventory[];
    /** [kg] */
    totalStorageMassKg: number;
    /** [m^3] */
    totalReserveVolumeM3: number;
    /** [W] */
    totalConditioningPowerW: number;
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
    /** [W] */
    beamDeliveryMarginW: number | null;
    /** [W] */
    solarDeliveredCapacityW: number;
    /** [h] */
    siteDayHours: number;
    /** [h] */
    siteNightHours: number;
    siteProfile: PolarProfileSummary;
  };
  logistics: {
    /** [kg] */
    payloadPerMissionKg: number;
    /** [kg] */
    totalInfraMassKg: number;
    nMissions: number;
    leverageL: number;
    plantMassThroughputDays: number;
    manifest: ManifestRow[];
  };
  materials: {
    flows: MaterialFlow[];
    balances: ProcessBalance[];
    /** [kg/day] */
    maxAbsResidualKgPerDay: number;
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

export interface SimulationOptions {
  powerStrategy?: PowerStrategy;
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
  illumination: number;
  receiverVisibility: number;
  /** [K] */
  surfaceTemperatureK: number;
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

export type UncertaintyResult = Record<"plantMassThroughputDays" | "secTotal" | "nMissions" | "leverageL", UncertaintyBand>;
