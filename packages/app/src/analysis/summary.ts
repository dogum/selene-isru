import type { SimParams, SimResult } from "@selene-isru/engine";
import { formatQtyProse } from "../lib/format";

type Stream = SimResult["cryo"]["inventories"][number]["stream"];

const STREAM_NAMES: Record<Stream, string> = {
  lox: "liquid oxygen",
  "water-ice": "water ice",
  "liquid-water": "water",
  lh2: "liquid hydrogen",
  lch4: "liquid methane",
  "co2-feed": "CO₂ feed",
  custom: "custom cryogen"
};

const STREAM_SHORT: Record<Stream, string> = {
  lox: "O₂",
  "water-ice": "WATER",
  "liquid-water": "WATER",
  lh2: "H₂",
  lch4: "CH₄",
  "co2-feed": "CO₂",
  custom: "PRODUCT"
};

function productInventories(result: SimResult): SimResult["cryo"]["inventories"] {
  return result.cryo.inventories.filter((inventory) => inventory.role === "product");
}

/** What the plant delivers: its product inventories, or a user-defined custom stream. */
function deliveredInventories(result: SimResult): SimResult["cryo"]["inventories"] {
  const products = productInventories(result);
  return products.length > 0 ? products : result.cryo.inventories.filter((inventory) => inventory.role === "custom");
}

/** Whether the plant splits its water into other products (Sabatier loop or propellant mode). */
function convertsWater(params: SimParams): boolean {
  return params.site === "polar" && (params.enableSabatier || params.polarProduct === "propellant");
}

/**
 * Plain label for the OUTPUT KPI, which is the engine's target throughput.
 * With one product that is the product itself; when the plant converts its
 * water into other products it is the water processed, however many of them
 * a storage what-if keeps.
 */
export function outputLabel(params: SimParams, result: SimResult): string {
  if (convertsWater(params)) return "WATER PROCESSED";
  const products = productInventories(result);
  if (products.length === 1) {
    return `${STREAM_SHORT[products[0]!.stream]} OUTPUT`;
  }
  return params.site === "polar" ? "WATER PROCESSED" : "TARGET THROUGHPUT";
}

/**
 * What "per kg" means in per-kg results such as energy per kg: the engine's
 * target throughput, which is water processed when water is converted.
 */
export function perKgBasis(params: SimParams, result: SimResult): string {
  const label = outputLabel(params, result);
  return label === "WATER PROCESSED" ? "water processed" : label === "TARGET THROUGHPUT" ? "target throughput" : "product";
}

/**
 * What a newcomer can read before any KPI: what the plant makes, what it
 * lands, what powers it, and when its product repays the launch mass. Every
 * number is an engine output.
 */
export function caseSummary(params: SimParams, result: SimResult): string {
  const plant =
    params.site === "polar"
      ? params.enableSabatier
        ? "Polar ice plant with Sabatier loop"
        : params.polarProduct === "propellant"
          ? "Polar ice-to-propellant plant"
          : "Polar ice plant"
      : result.ilmenite !== null
        ? `Equatorial ilmenite-reduction plant mining ${formatQtyProse(result.ilmenite.soilKgPerDay, "kg/day")} of ${params.ilmFeed === "basalt" ? "high-Ti basalt layer" : "soil"}`
        : "Equatorial molten-regolith plant";
  const named = [...deliveredInventories(result)]
    .sort((a, b) => b.rateKgPerDay - a.rateKgPerDay)
    .map((inventory) => `${formatQtyProse(inventory.rateKgPerDay, "kg/day")} ${STREAM_NAMES[inventory.stream]}`);
  const products =
    named.length > 1
      ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`
      : (named[0] ?? `${formatQtyProse(result.production.targetKgPerDay, "kg/day")} of product`);
  const landings = result.logistics.nMissions;
  const usable =
    result.production.propellantKgPerDay > 0
      ? ` (${formatQtyProse(result.production.propellantKgPerDay, "kg/day")} usable at O/F ${params.mixtureRatio})`
      : "";
  const parts = [
    plant,
    `makes ${products}${usable}`,
    `from ${formatQtyProse(result.logistics.totalInfraMassKg, "kg")} landed in ${landings} landing${landings === 1 ? "" : "s"}`,
    `on ${formatQtyProse(result.energy.gridPowerW, "W")} of ${result.power.architecture} power`
  ];
  const alarms = result.warnings.filter((warning) => warning.severity === "alarm").length;
  const { campaign } = result;
  // With a demand, only the propellant the lander burns repays anything.
  const credited = result.refuel === null ? "Its product" : "The propellant burned";
  const payback =
    campaign.leoMassSpentKg === 0
      ? ""
      : campaign.paysBackInCampaign && campaign.paybackDays !== null
        ? ` ${credited} repays the launch mass by day ${Math.round(campaign.paybackDays).toLocaleString("en-US")}.`
        : ` ${credited} does not repay the launch mass within the campaign.`;
  const refuel =
    result.refuel === null
      ? ""
      : ` A reusable lander flying ${params.sortiesPerYear} sortie${params.sortiesPerYear === 1 ? "" : "s"} a year burns ${formatQtyProse(
          result.refuel.usedKgPerDay,
          "kg/day"
        )} of it, ${Math.round(result.refuel.isruShare * 100)}% of the propellant it needs.`;
  const sentence = `${parts[0]} ${parts.slice(1).join(" ")}.${refuel}${payback}`;
  return alarms > 0
    ? `${sentence} ${alarms} implemented constraint${alarms === 1 ? " is" : "s are"} violated.`
    : sentence;
}
