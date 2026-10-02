import { PHYSICAL_CONSTANTS } from "../constants";
import type {
  CryoControlMode,
  PolarProfileSummary,
  ResolvedStorageStream,
  SimParams,
  StorageInventory,
  Warning
} from "../types";

const PC = PHYSICAL_CONSTANTS;

interface StreamProperties {
  densityKgPerM3: number;
  storageTemperatureK: number;
  latentHeatJPerKg: number;
  conditioningSecKWhPerKg: number;
  phaseLossEnabled: boolean;
}

export interface StorageDemand {
  id: string;
  stream: ResolvedStorageStream;
  role: StorageInventory["role"];
  rateKgPerDay: number;
}

interface PendingInventory extends StorageInventory {
  latentHeatJPerKg: number;
  phaseLossEnabled: boolean;
  areaM2: number;
  mliFluxWPerM2: number;
  hotSideTemperatureK: number;
}

export interface CryoOutput extends StreamProperties {
  stream: ResolvedStorageStream;
  controlMode: CryoControlMode;
  qLeakW: number;
  qRemovedW: number;
  qResidualW: number;
  unmitigatedBoiloffKgPerDay: number;
  boiloffKgPerDay: number;
  cryocoolerPowerW: number;
  mliFlux_WPerM2: number;
  cryoMassKg: number;
  totalReserveVolumeM3: number;
  totalConditioningPowerW: number;
  inventories: StorageInventory[];
  warnings: Warning[];
}

function propertiesFor(stream: ResolvedStorageStream, params: SimParams): StreamProperties {
  switch (stream) {
    // Fluid properties are physical constants; conditioning energy per stream
    // is a design input (constants.json is the single source of both).
    case "lox":
      return { densityKgPerM3: PC.rhoStore_LOX.value, storageTemperatureK: PC.Tstore_LOX.value, latentHeatJPerKg: PC.dHvap_LOX.value, conditioningSecKWhPerKg: params.secCondLox, phaseLossEnabled: true };
    case "water-ice":
      return { densityKgPerM3: PC.rhoStore_waterIce.value, storageTemperatureK: PC.Tstore_waterIce.value, latentHeatJPerKg: PC.dHsub_ice.value, conditioningSecKWhPerKg: params.secCondWaterIce, phaseLossEnabled: true };
    case "liquid-water":
      return { densityKgPerM3: PC.rhoStore_liquidWater.value, storageTemperatureK: PC.Tstore_liquidWater.value, latentHeatJPerKg: 0, conditioningSecKWhPerKg: params.secCondLiquidWater, phaseLossEnabled: false };
    case "lh2":
      return { densityKgPerM3: PC.rhoStore_LH2.value, storageTemperatureK: PC.Tstore_LH2.value, latentHeatJPerKg: PC.dHvap_LH2.value, conditioningSecKWhPerKg: params.secCondLh2, phaseLossEnabled: true };
    case "lch4":
      return { densityKgPerM3: PC.rhoStore_LCH4.value, storageTemperatureK: PC.Tstore_LCH4.value, latentHeatJPerKg: PC.dHvap_LCH4.value, conditioningSecKWhPerKg: params.secCondLch4, phaseLossEnabled: true };
    case "co2-feed":
      return { densityKgPerM3: PC.rhoStore_CO2.value, storageTemperatureK: PC.Tstore_CO2.value, latentHeatJPerKg: PC.dHsub_CO2.value, conditioningSecKWhPerKg: params.secCondCo2, phaseLossEnabled: true };
    case "custom":
      return { densityKgPerM3: params.rhoCryo, storageTemperatureK: params.Ttank, latentHeatJPerKg: params.customLatentHeatJPerKg, conditioningSecKWhPerKg: params.secLiquefaction, phaseLossEnabled: true };
  }
}

function pendingInventory(
  params: SimParams,
  demand: StorageDemand,
  profile: PolarProfileSummary
): PendingInventory {
  const properties = propertiesFor(demand.stream, params);
  const reserveInventoryKg = params.reserveDays * demand.rateKgPerDay;
  const volumeM3 = reserveInventoryKg / properties.densityKgPerM3;
  const radiusM = (3 * volumeM3 / (4 * Math.PI)) ** (1 / 3);
  const areaM2 = 4 * Math.PI * radiusM ** 2;
  const projectedAreaM2 = Math.PI * radiusM ** 2;
  const illumination = params.site === "polar" ? profile.averageIllumination : 1;
  const surfaceTemperatureK = params.site === "polar" ? profile.maximumSurfaceTemperatureK : params.Tsurface;
  const qSolarW = params.alphaTank * PHYSICAL_CONSTANTS.ISOLAR.value * projectedAreaM2 * illumination;
  const qAlbedoW = params.alphaTank * PHYSICAL_CONSTANTS.ISOLAR.value * PC.albedoLunar.value * params.Fview * areaM2 * illumination;
  const qIrW = params.epsTank * PHYSICAL_CONSTANTS.sigma.value * surfaceTemperatureK ** 4 * params.Fview * areaM2;
  const coldK = properties.storageTemperatureK;
  const qSpaceW = params.epsTank * PHYSICAL_CONSTANTS.sigma.value * (coldK ** 4 - PC.Tspace.value ** 4) * areaM2 * (1 - params.Fview);
  const qEnvironmentW = qSolarW + qAlbedoW + qIrW - qSpaceW;
  const equilibriumK = qEnvironmentW > 0
    ? (qEnvironmentW / (params.epsTank * PHYSICAL_CONSTANTS.sigma.value * areaM2)) ** 0.25
    : coldK;
  const hotK = Math.max(equilibriumK, coldK);
  const meanK = (hotK + coldK) / 2;

  // v0.1's coefficient is calibrated with layer density in layers/mm. Keep the
  // coefficient/unit pair intact until the open absolute heat-flux benchmark is accepted.
  const calibratedLayerDensity = params.Nlaydens / 10;
  const mliFluxWPerM2 =
    (params.C1mli * calibratedLayerDensity ** params.rExp * meanK * (hotK - coldK)) / params.Nmli +
    (params.C2mli * params.epsLayer * (hotK ** 4.67 - coldK ** 4.67)) / params.Nmli;
  const qLeakW = Math.max(0, mliFluxWPerM2 * areaM2) + params.qStrutW;
  const conditioningPowerW = demand.rateKgPerDay / 86_400 * properties.conditioningSecKWhPerKg * 3_600_000;

  return {
    id: demand.id,
    stream: demand.stream,
    role: demand.role,
    rateKgPerDay: demand.rateKgPerDay,
    reserveInventoryKg,
    volumeM3,
    storageMassKg: params.kCryoMass * demand.rateKgPerDay,
    densityKgPerM3: properties.densityKgPerM3,
    storageTemperatureK: properties.storageTemperatureK,
    conditioningSecKWhPerKg: properties.conditioningSecKWhPerKg,
    conditioningPowerW,
    qLeakW,
    qRemovedW: 0,
    qResidualW: qLeakW,
    unmitigatedLossKgPerDay: 0,
    actualLossKgPerDay: 0,
    latentHeatJPerKg: properties.latentHeatJPerKg,
    phaseLossEnabled: properties.phaseLossEnabled,
    areaM2,
    mliFluxWPerM2,
    hotSideTemperatureK: hotK
  };
}

export function simulateCryo(
  params: SimParams,
  demands: StorageDemand[],
  profile: PolarProfileSummary
): CryoOutput {
  const activeDemands = demands.filter((demand) => demand.rateKgPerDay > 1e-12);
  const fallback: StorageDemand = {
    id: "primary-product",
    stream: params.site === "equatorial" ? "lox" : "water-ice",
    role: "product",
    rateKgPerDay: params.targetKgPerDay
  };
  const pending = (activeDemands.length > 0 ? activeDemands : [fallback]).map((demand) => pendingInventory(params, demand, profile));
  const totalLeakW = pending.reduce((total, item) => total + item.qLeakW, 0);
  const removalBudgetW =
    params.cryoControlMode === "passive"
      ? 0
      : params.cryoControlMode === "capacity-limited"
        ? Math.min(totalLeakW, params.coolerCapacityW)
        : totalLeakW;
  let cryocoolerPowerW = 0;
  for (const item of pending) {
    item.qRemovedW = totalLeakW > 0 ? removalBudgetW * item.qLeakW / totalLeakW : 0;
    item.qResidualW = Math.max(0, item.qLeakW - item.qRemovedW);
    const lossFactor = item.phaseLossEnabled ? 86_400 / item.latentHeatJPerKg : 0;
    item.unmitigatedLossKgPerDay = item.qLeakW * lossFactor;
    item.actualLossKgPerDay = item.qResidualW * lossFactor;
    if (item.qRemovedW > 0 && item.hotSideTemperatureK > item.storageTemperatureK) {
      cryocoolerPowerW +=
        item.qRemovedW * (item.hotSideTemperatureK - item.storageTemperatureK) /
        (params.eta2ndLaw * item.storageTemperatureK);
    }
  }
  const inventories: StorageInventory[] = pending.map(({ latentHeatJPerKg: _latent, phaseLossEnabled: _phase, areaM2: _area, mliFluxWPerM2: _flux, hotSideTemperatureK: _hot, ...item }) => item);
  const primary = pending[0]!;
  const qRemovedW = pending.reduce((total, item) => total + item.qRemovedW, 0);
  const qResidualW = pending.reduce((total, item) => total + item.qResidualW, 0);
  const unmitigatedBoiloffKgPerDay = pending.reduce((total, item) => total + item.unmitigatedLossKgPerDay, 0);
  const boiloffKgPerDay = pending.reduce((total, item) => total + item.actualLossKgPerDay, 0);
  const cryoMassKg = pending.reduce((total, item) => total + item.storageMassKg, 0);
  const totalReserveVolumeM3 = pending.reduce((total, item) => total + item.volumeM3, 0);
  const totalConditioningPowerW = pending.reduce((total, item) => total + item.conditioningPowerW, 0);
  const totalAreaM2 = pending.reduce((total, item) => total + item.areaM2, 0);
  const warnings: Warning[] = [];
  if (params.cryoControlMode === "capacity-limited" && qResidualW > 1e-9) {
    warnings.push({ id: "cryo-capacity-shortfall", severity: "caution", module: "storage", message: "Shared cryocooler capacity is below the multi-inventory heat leak; residual phase loss remains.", value: qRemovedW, limit: totalLeakW });
  }

  return {
    stream: primary.stream,
    controlMode: params.cryoControlMode,
    densityKgPerM3: primary.densityKgPerM3,
    storageTemperatureK: primary.storageTemperatureK,
    latentHeatJPerKg: primary.latentHeatJPerKg,
    conditioningSecKWhPerKg: totalConditioningPowerW * 86_400 / (params.targetKgPerDay * 3_600_000),
    phaseLossEnabled: primary.phaseLossEnabled,
    qLeakW: totalLeakW,
    qRemovedW,
    qResidualW,
    unmitigatedBoiloffKgPerDay,
    boiloffKgPerDay,
    cryocoolerPowerW,
    mliFlux_WPerM2: totalAreaM2 > 0 ? pending.reduce((total, item) => total + item.mliFluxWPerM2 * item.areaM2, 0) / totalAreaM2 : 0,
    cryoMassKg,
    totalReserveVolumeM3,
    totalConditioningPowerW,
    inventories,
    warnings
  };
}
