import { PHYSICAL_CONSTANTS } from "../constants";
import type { EnergyProcessBalance, SimParams } from "../types";
import type { CryoOutput } from "./cryo";
import type { ElectrolysisOutput } from "./electrolysis";

interface EnergyLine {
  from: string;
  to: string;
  jPerKg: number;
}

interface SabatierEnergy {
  secWaterElectrolysis_JPerKg: number;
}

export interface EnergyLedger {
  balances: EnergyProcessBalance[];
  maxAbsResidualW: number;
  gridAllocationResidualW: number;
}

function balance(
  id: string,
  label: string,
  electricalInputW: number,
  coupledInputW: number,
  usefulOutputW: number,
  rejectedHeatW: number,
  accumulationW: number
): EnergyProcessBalance {
  const raw = electricalInputW + coupledInputW - usefulOutputW - rejectedHeatW - accumulationW;
  const scale = Math.max(
    1,
    Math.abs(electricalInputW),
    Math.abs(coupledInputW),
    Math.abs(usefulOutputW),
    Math.abs(rejectedHeatW),
    Math.abs(accumulationW)
  );
  const roundoffToleranceW = 64 * Number.EPSILON * scale;
  return {
    id,
    label,
    electricalInputW,
    coupledInputW,
    usefulOutputW,
    rejectedHeatW,
    accumulationW,
    residualW: Math.abs(raw) <= roundoffToleranceW ? 0 : raw
  };
}

export function energyLedger(
  params: SimParams,
  gridPowerW: number,
  lines: EnergyLine[],
  excavationMechPowerW: number,
  electrolysis: ElectrolysisOutput,
  cryo: CryoOutput,
  sabatier: SabatierEnergy | null
): EnergyLedger {
  const productMassFlowKgPerS = params.targetKgPerDay / 86_400;
  const powerFor = (from: string, to: string): number =>
    (lines.find((line) => line.from === from && line.to === to)?.jPerKg ?? 0) * productMassFlowKgPerS;
  const balances: EnergyProcessBalance[] = [];

  const excavationInputW = powerFor("mine", params.site === "equatorial" ? "melt" : "sublimation");
  const excavationUsefulW = Math.min(excavationInputW, Math.max(0, excavationMechPowerW));
  balances.push(balance("excavation-energy", "Excavation drive", excavationInputW, 0, excavationUsefulW, excavationInputW - excavationUsefulW, 0));

  if (params.site === "equatorial") {
    const meltInputW = powerFor("melt", "electrolysis");
    balances.push(balance("mre-melt-energy", "Regolith melt duty", meltInputW, 0, 0, 0, meltInputW));

    const electrolysisInputW = powerFor("electrolysis", "product");
    const chemicalW = Math.min(electrolysisInputW, Math.max(0, electrolysis.chemicalPowerW));
    balances.push(balance("mre-electrolysis-energy", "MRE voltage and reaction", electrolysisInputW, 0, chemicalW, electrolysisInputW - chemicalW, 0));

    const auxiliariesW = powerFor("electrolysis", "parasitic");
    balances.push(balance("mre-aux-energy", "MRE radiation and auxiliaries", auxiliariesW, 0, 0, auxiliariesW, 0));
  } else {
    const sublimationInputW = powerFor("sublimation", "product");
    balances.push(balance("sublimation-energy", "Polar heating and sublimation", sublimationInputW, 0, 0, 0, sublimationInputW));
    const distillationW = powerFor("sublimation", "parasitic");
    balances.push(balance("polar-aux-energy", "Vapor handling and process allowance", distillationW, 0, 0, distillationW, 0));

    if (sabatier !== null) {
      const waterElectrolysisW = powerFor("electrolysis", "product");
      const thermoneutralFraction = Math.min(
        1,
        PHYSICAL_CONSTANTS.VthermoneutralWater.value * params.etaFaradayEl / params.Vel
      );
      const chemicalW = waterElectrolysisW * thermoneutralFraction;
      balances.push(balance("water-electrolysis-energy", "Water electrolysis", waterElectrolysisW, 0, chemicalW, waterElectrolysisW - chemicalW, 0));
    }
  }

  balances.push(balance("storage-conditioning-energy", "Product conditioning", cryo.totalConditioningPowerW, 0, 0, 0, cryo.totalConditioningPowerW));
  balances.push(balance("storage-cooling-energy", "Storage heat lift", cryo.cryocoolerPowerW, cryo.qRemovedW, 0, cryo.cryocoolerPowerW + cryo.qRemovedW, 0));

  const allocatedElectricalW = balances.reduce((total, item) => total + item.electricalInputW, 0);
  const gridAllocationRaw = gridPowerW - allocatedElectricalW;
  const allocationScale = Math.max(1, Math.abs(gridPowerW), Math.abs(allocatedElectricalW));
  const gridAllocationResidualW =
    Math.abs(gridAllocationRaw) <= 64 * Number.EPSILON * allocationScale ? 0 : gridAllocationRaw;
  const maxAbsResidualW = balances.reduce((maximum, item) => Math.max(maximum, Math.abs(item.residualW)), Math.abs(gridAllocationResidualW));
  return { balances, maxAbsResidualW, gridAllocationResidualW };
}
