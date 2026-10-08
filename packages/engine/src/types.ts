export type SiteMode = "equatorial" | "polar";
export type PowerArchitecture = "solar" | "nuclear";
export type PowerStrategy = "auto" | PowerArchitecture;
export type DeploymentManifest = "dedicated" | "shared";
export type PolarProduct = "water" | "propellant";
export type RefuelDemand = "none" | "lander";
export type EquatorialProcess = "mre" | "ilmenite";
export type IlmeniteFeed = "soil" | "basalt";
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
  /** liquefaction hardware for a liquefied product [kg] */
  liquefierMassKg: number;
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
  /** [J/kg-regolith] excavation and haul, per kg of soil moved */
  eMining: number;
  /** [kg/(kg-regolith/day)] excavation fleet, per kg/day of soil moved */
  kMiningMass: number;
  /** [kg/kg] polar dry overburden moved per kg of icy regolith mined */
  overburdenRatio: number;
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
  polarProduct: PolarProduct;
  /** vehicle O/F by mass [kg/kg] */
  mixtureRatio: number;
  /** [kg/(kg/day)] per water processed */
  kElectrolyzerMass: number;
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
  /** per-stream conditioning energy [kWh/kg] */
  secCondLox: number;
  /** [kWh/kg] */
  secCondWaterIce: number;
  /** [kWh/kg] */
  secCondLiquidWater: number;
  /** [kWh/kg] */
  secCondLh2: number;
  /** [kWh/kg] */
  secCondLch4: number;
  /** [kWh/kg] */
  secCondCo2: number;
  /** [kg/(kg/day)] */
  kCryoMass: number;
  /** [kg/(kg/day)] per LOX product */
  kLiquefierLox: number;
  /** [kg/(kg/day)] per LH2 product */
  kLiquefierLh2: number;
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
  /** [1/yr] */
  landingsPerYear: number;
  /** [day] */
  commissioningDays: number;
  /** [1] */
  plantAvailability: number;
  /** [1/yr] */
  sparesFracPerYear: number;
  deploymentManifest: DeploymentManifest;
  refuelDemand: RefuelDemand;
  /** [1/yr] */
  sortiesPerYear: number;
  /** [kg] */
  MdryReusable: number;
  /** [kg] */
  MtankReusable: number;
  /** [s] */
  IspReusable: number;
  /** [kg] */
  McargoDown: number;
  /** [kg] */
  McargoUp: number;
  /** [m/s] */
  dvDescent: number;
  /** [m/s] */
  dvAscent: number;
  equatorialProcess: EquatorialProcess;
  ilmFeed: IlmeniteFeed;
  /** [kg/kg] */
  fIlmenite: number;
  /** [1] */
  fIlmSized: number;
  /** [1] */
  etaIlmRecovery: number;
  /** [kg/kg] */
  ilmConcentrateGrade: number;
  /** [h] solids residence time in the reduction reactor */
  tIlmResidenceH: number;
  /** [J/mol] apparent activation energy of the bed's reduction rate */
  EaIlmReduction: number;
  /** [K] */
  TIlmReactor: number;
  /** [1] */
  etaIlmHeatRecovery: number;
  /** [1] */
  fIlmHeatLoss: number;
  /** [J/kg-regolith] */
  eIlmBeneficiation: number;
  /** [kg/(kg/day)] per soil processed */
  kIlmBeneficiationMass: number;
  /** [kg/kg] ilmenite in the basalt */
  fIlmBasalt: number;
  /** [1] share of the basalt's ilmenite freed by grinding */
  fIlmLiberated: number;
  /** [1] share of the ground basalt above the reactor's minimum size */
  fBasaltSized: number;
  /** [kg/kg] crushable basalt per kg of layer mined */
  fBasaltInMined: number;
  /** [kg/kg] overburden per kg of basalt layer mined */
  basaltOverburdenRatio: number;
  /** [J/kg] crushing, grinding, screening and separation per kg of basalt */
  eIlmComminution: number;
  /** [kg/(kg/day)] comminution plant per kg/day of basalt */
  kIlmComminutionMass: number;
  /** [kg/(kg/day)] per O2: hydrogen loop, heaters, radiators */
  kIlmGasLoopMass: number;
  /** [kg/kg] fluidized-bed reactor mass per kg of solids held */
  kIlmBedMass: number;
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
  /** captured / mobilized ice [1] */
  etaIceCapture: number;
  /** heat delivered to feed / heater input [1] */
  etaSubHeater: number;
  /** [kg/(kg-regolith/day)] */
  kIceExtractorMass: number;
  /** [K] */
  castDeltaT: number;
}

export interface CampaignResult {
  /** mass in LEO per kg landed: M0leo / (etaPack × payload) [kg/kg]; 0 when a lander lands nothing */
  leoMassPerLandedKg: number;
  /** last infrastructure landing [day] */
  deploymentDays: number;
  /** production start: deployment + commissioning [day] */
  firstProductDay: number;
  /** end of `missionYears` of production [day] */
  campaignEndDay: number;
  /** average product delivered after downtime: O2, water, propellant, or the Sabatier products [kg/day] */
  deliveredKgPerDay: number;
  /** delivered product that a demand uses, which the ledger credits; all of it when there is no demand [kg/day] */
  usedKgPerDay: number;
  /** days between the demand's sorties, which the ledger credits one at a time; null without a demand [day] */
  sortieIntervalDays: number | null;
  /** spares landed per year of operation [kg/yr] */
  resupplyKgPerYear: number;
  /** imported process feed (Sabatier CO2) landed per year of operation [kg/yr] */
  feedKgPerYear: number;
  /** product delivered over the campaign [kg] */
  cumulativeProductKg: number;
  /** product used over the campaign [kg] */
  cumulativeUsedKg: number;
  /** plant, spares, and imported feed landed over the campaign [kg] */
  landedMassKg: number;
  /** [kg in LEO] */
  leoMassSpentKg: number;
  /** [kg in LEO] */
  leoMassSavedKg: number;
  /** saved − spent [kg in LEO] */
  netLeoMassKg: number;
  /** saved / spent over the campaign [kg/kg]; 0 when nothing is spent */
  returnRatio: number;
  /** when cumulative saved first reaches spent, on a sortie day with a demand [day]; null if output never outpaces spares and feed */
  paybackDays: number | null;
  paysBackInCampaign: boolean;
}

/** Hydrogen reduction of ilmenite; energies per kg O2. */
export interface IlmeniteResult {
  /** fraction of the fed ilmenite reduced, from temperature and residence time [1] */
  conversion: number;
  /** soil or basalt layer mined per kg O2 [kg/kg] */
  soilPerKgO2: number;
  /** basalt crushed and ground, 0 on a soil feed [kg/day] */
  basaltFedKgPerDay: number;
  /** soil or basalt layer mined [kg/day] */
  soilKgPerDay: number;
  /** soil inside the reactor feed size window [kg/day] */
  sizedSoilKgPerDay: number;
  /** concentrate fed to the reactor [kg/day] */
  concentrateKgPerDay: number;
  /** ilmenite mass fraction of the concentrate actually fed [kg/kg] */
  concentrateGrade: number;
  /** solids rejected: soil by sizing and separation, or the basalt layer's soil and oversize plus the ground basalt separation rejects [kg/day] */
  tailingsKgPerDay: number;
  /** ilmenite reduced to iron and rutile [kg/day] */
  ilmeniteReducedKgPerDay: number;
  /** water made in the reactor and split [kg/day] */
  waterKgPerDay: number;
  /** hydrogen returned from electrolysis to the reactor [kg/day] */
  hydrogenRecycleKgPerDay: number;
  /** reduced concentrate discharged: iron, rutile, unreduced ilmenite and gangue [kg/day] */
  spentSolidsKgPerDay: number;
  /** metallic iron in the spent solids [kg/day] */
  ironKgPerDay: number;
  /** excavation energy per kg O2 [J/kg] */
  secMining_JPerKg: number;
  /** sizing, magnetic separation, and handling energy per kg O2 [J/kg] */
  secBeneficiation_JPerKg: number;
  /** feed heating after heat recovery, per kg O2 [J/kg] */
  secSensible_JPerKg: number;
  /** endothermic reduction heat per kg O2 [J/kg] */
  secReaction_JPerKg: number;
  /** reactor heat loss, heater inefficiency, and gas recycle per kg O2 [J/kg] */
  secReactorLoss_JPerKg: number;
  /** water electrolysis per kg O2 [J/kg] */
  secWaterElectrolysis_JPerKg: number;
  /** excavation fleet [kg] */
  miningMassKg: number;
  /** sizing, separation, and handling plant [kg] */
  beneficiationMassKg: number;
  /** solids held in the fluidized bed: feed rate × residence time [kg] */
  bedHoldupKg: number;
  /** fluidized-bed reactor, scaled with its hold-up [kg] */
  bedMassKg: number;
  /** reduction reactor: hydrogen loop, heaters and radiators plus the bed [kg] */
  reactorMassKg: number;
  /** water electrolyzer [kg] */
  electrolyzerMassKg: number;
}

/** A surface-based reusable lander refuelled with the plant's product. */
export interface RefuelResult {
  /** propellant burned landing from the staging orbit with the down cargo [kg] */
  descentPropellantKg: number;
  /** propellant burned climbing to the staging orbit with the up cargo and the descent load [kg] */
  ascentPropellantKg: number;
  /** propellant loaded on the surface per sortie [kg] */
  propellantPerSortieKg: number;
  /** [kg] */
  oxidizerPerSortieKg: number;
  /** hydrogen per sortie [kg] */
  fuelPerSortieKg: number;
  /** [kg/day] */
  demandO2KgPerDay: number;
  /** [kg/day] */
  demandFuelKgPerDay: number;
  /** oxygen the plant makes, after storage losses and downtime [kg/day] */
  supplyO2KgPerDay: number;
  /** hydrogen the plant makes, after storage losses and downtime; 0 at the equator [kg/day] */
  supplyH2KgPerDay: number;
  /** oxygen the plant supplies to the demand, after downtime [kg/day] */
  isruO2KgPerDay: number;
  /** hydrogen the plant supplies to the demand, after downtime [kg/day] */
  isruFuelKgPerDay: number;
  /** share of the propellant burned that the plant supplies [1] */
  isruShare: number;
  /** propellant the demand still needs from Earth [kg/yr] */
  earthPropellantKgPerYear: number;
  /** product made but not needed by the demand [kg/day] */
  surplusKgPerDay: number;
  /** sorties a year whose oxidizer the plant could supply [1/yr] */
  oxidizerSortiesPerYear: number;
  /** sorties a year whose hydrogen the plant could supply; 0 if it makes none [1/yr] */
  fuelSortiesPerYear: number;
  /** product the demand uses, after downtime [kg/day] */
  usedKgPerDay: number;
  /** days between sorties: 365 / sortiesPerYear [day] */
  sortieIntervalDays: number;
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
    /** LOX + LH2 usable at the vehicle mixture ratio [kg/day]; 0 outside propellant mode */
    propellantKgPerDay: number;
    /** oxygen beyond the mixture ratio [kg/day] */
    excessO2KgPerDay: number;
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
    /** [kg/day] soil the fleet moves: the plant's feed plus any overburden */
    soilMovedKgPerDay: number;
    /** [kg/day] overburden stripped: polar dry regolith over the ice, or the soil over an ilmenite plant's basalt; 0 otherwise */
    overburdenKgPerDay: number;
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
    /** heat delivered to the feed per kg of captured water [J/kg H2O] */
    secSub_JPerKg: number | null;
    /** heater input lost before reaching the feed, per kg of captured water [J/kg H2O] */
    heaterLoss_JPerKg: number | null;
    /** polar water-extractor hardware mass [kg] */
    extractorMassKg: number;
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
    /** product each landed kilogram is measured against: O2, water, usable propellant, or the Sabatier products [kg/day] */
    productKgPerDay: number;
    /** [kg] */
    totalInfraMassKg: number;
    nMissions: number;
    /** annual product × mission years × gearRatio / landed plant mass [kg/kg] */
    leverageL: number;
    /** landed plant mass / product [day] */
    plantMassThroughputDays: number;
    manifest: ManifestRow[];
  };
  /** deployment-to-end mass ledger in kg of LEO mass; see modules/campaign.ts */
  campaign: CampaignResult;
  /** null unless a refuelling demand is set and the plant makes oxygen or LOX/LH2 */
  refuel: RefuelResult | null;
  /** null unless the equatorial plant reduces ilmenite */
  ilmenite: IlmeniteResult | null;
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
  supplementalLoads?: readonly SimulationSupplementalLoad[];
  supplementalMasses?: readonly SimulationSupplementalMass[];
}

export interface SimulationSupplementalLoad {
  id: string;
  label: string;
  powerW: number;
  disposition: "useful" | "loss";
}

export interface SimulationSupplementalMass {
  subsystem: string;
  massKg: number;
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
