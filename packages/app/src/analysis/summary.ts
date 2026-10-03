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

/**
 * Plain label for the OUTPUT KPI, which is the engine's target throughput.
 * With one product that is the product itself; when the target stream is
 * converted into several products (polar + Sabatier) it is what was processed.
 */
export function outputLabel(params: SimParams, result: SimResult): string {
  const products = productInventories(result);
  if (products.length === 1) {
    return `${STREAM_SHORT[products[0]!.stream]} OUTPUT`;
  }
  return params.site === "polar" ? "WATER PROCESSED" : "TARGET THROUGHPUT";
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
        : "Polar ice plant"
      : "Equatorial molten-regolith plant";
  const named = [...productInventories(result)]
    .sort((a, b) => b.rateKgPerDay - a.rateKgPerDay)
    .map((inventory) => `${formatQtyProse(inventory.rateKgPerDay, "kg/day")} ${STREAM_NAMES[inventory.stream]}`);
  const products = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}` : (named[0] ?? "");
  const landings = result.logistics.nMissions;
  const parts = [
    plant,
    `makes ${products}`,
    `from ${formatQtyProse(result.logistics.totalInfraMassKg, "kg")} landed in ${landings} landing${landings === 1 ? "" : "s"}`,
    `on ${formatQtyProse(result.energy.gridPowerW, "W")} of ${result.power.architecture} power`
  ];
  const alarms = result.warnings.filter((warning) => warning.severity === "alarm").length;
  const { campaign } = result;
  const payback =
    campaign.leoMassSpentKg === 0
      ? ""
      : campaign.paysBackInCampaign && campaign.paybackDays !== null
        ? ` Its product repays the launch mass by day ${Math.round(campaign.paybackDays).toLocaleString("en-US")}.`
        : " Its product does not repay the launch mass within the campaign.";
  const sentence = `${parts[0]} ${parts.slice(1).join(" ")}.${payback}`;
  return alarms > 0
    ? `${sentence} ${alarms} implemented constraint${alarms === 1 ? " is" : "s are"} violated.`
    : sentence;
}
