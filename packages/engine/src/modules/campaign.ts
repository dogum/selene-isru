import type { CampaignResult, SimParams, Warning } from "../types";

const DAYS_PER_YEAR = 365;
/** Landings marked one by one; beyond this the grid samples show the staircase. */
const MAX_LANDING_EVENTS = 100;
/** Regular samples per timeline, whatever step was asked for. */
const MAX_SAMPLES = 2000;

/**
 * Campaign mass ledger. Everything is counted in one currency, mass in low
 * Earth orbit [kg], so spend and return compare directly:
 *
 *   spent(t) = M0leo × (infrastructure landers arrived by t)       [dedicated]
 *            or (M0leo / lander capacity) × plant mass landed by t  [shared]
 *            + (M0leo / lander capacity) × (spares + imported feed) landed by t
 *   saved(t) = gearRatio × product delivered by t
 *
 * Landers arrive at the cadence `landingsPerYear` from day 0, each carrying up
 * to one lander capacity of plant. Production starts once the last one has
 * landed and commissioning is done (all-up deployment), then runs for
 * `missionYears` at the plant's product rate × `plantAvailability`. Spares
 * (`sparesFracPerYear` of the landed plant per year) and any imported process
 * feed (the Sabatier loop's CO2, which has no lunar source in this model)
 * ride as a mass share of other cargo. Times are days from the first landing.
 */
export interface CampaignOutput extends CampaignResult {
  warnings: Warning[];
}

/** Cumulative ledger at one time. */
export interface CampaignPoint {
  /** [day] */
  tDays: number;
  /** infrastructure landers arrived */
  landers: number;
  /** [kg] */
  landedMassKg: number;
  /** [kg] */
  productKg: number;
  /** [kg in LEO] */
  leoMassSpentKg: number;
  /** [kg in LEO] */
  leoMassSavedKg: number;
}

/** The logistics terms the ledger is built on; `SimResult["logistics"]` satisfies it. */
export interface CampaignBasis {
  totalInfraMassKg: number;
  nMissions: number;
  payloadPerMissionKg: number;
}

/** What the running plant delivers and consumes from Earth. */
export interface CampaignFlows {
  /** product delivered at full availability [kg/day] */
  productKgPerDay: number;
  /** process feed that must be landed [kg/day] */
  importedFeedKgPerDay: number;
}

function capacityKg(params: SimParams, basis: CampaignBasis): number {
  return params.etaPack * basis.payloadPerMissionKg;
}

/** Days between infrastructure landings. */
function landingIntervalDays(params: SimParams): number {
  return DAYS_PER_YEAR / params.landingsPerYear;
}

export function simulateCampaign(params: SimParams, basis: CampaignBasis, flows: CampaignFlows): CampaignOutput {
  const capacity = capacityKg(params, basis);
  // A lander that lands nothing deploys no plant: the ledger stays empty.
  const deployable = capacity > 0;
  const leoMassPerLandedKg = deployable ? params.M0leo / capacity : 0;
  const deploymentDays = Math.max(0, basis.nMissions - 1) * landingIntervalDays(params);
  const firstProductDay = deploymentDays + params.commissioningDays;
  const operatingDays = params.missionYears * DAYS_PER_YEAR;
  const campaignEndDay = firstProductDay + operatingDays;
  const deliveredKgPerDay = deployable ? flows.productKgPerDay * params.plantAvailability : 0;
  const resupplyKgPerYear = deployable ? params.sparesFracPerYear * basis.totalInfraMassKg : 0;
  // Feed is consumed with production, so downtime reduces it too.
  const feedKgPerYear = deployable ? flows.importedFeedKgPerDay * params.plantAvailability * DAYS_PER_YEAR : 0;

  const infraLeoKg =
    params.deploymentManifest === "shared"
      ? leoMassPerLandedKg * basis.totalInfraMassKg
      : basis.nMissions * params.M0leo;
  const savedPerDay = params.gearRatio * deliveredKgPerDay;
  const resupplyLeoPerDay = (leoMassPerLandedKg * (resupplyKgPerYear + feedKgPerYear)) / DAYS_PER_YEAR;

  const cumulativeProductKg = deliveredKgPerDay * operatingDays;
  const landedMassKg = deployable ? basis.totalInfraMassKg + (resupplyKgPerYear + feedKgPerYear) * params.missionYears : 0;
  const leoMassSpentKg = infraLeoKg + resupplyLeoPerDay * operatingDays;
  const leoMassSavedKg = savedPerDay * operatingDays;
  const paybackDays =
    savedPerDay > resupplyLeoPerDay ? firstProductDay + infraLeoKg / (savedPerDay - resupplyLeoPerDay) : null;

  const warnings: Warning[] = [];
  if (!deployable) {
    warnings.push({
      id: "lander-no-payload",
      severity: "alarm",
      module: "logistics",
      message: "The lander delivers no payload at these inputs, so the plant cannot be landed and the campaign ledger is empty.",
      value: basis.payloadPerMissionKg,
      limit: 0
    });
  }

  return {
    leoMassPerLandedKg,
    deploymentDays,
    firstProductDay,
    campaignEndDay,
    deliveredKgPerDay,
    resupplyKgPerYear,
    feedKgPerYear,
    cumulativeProductKg,
    landedMassKg,
    leoMassSpentKg,
    leoMassSavedKg,
    netLeoMassKg: leoMassSavedKg - leoMassSpentKg,
    returnRatio: leoMassSpentKg > 0 ? leoMassSavedKg / leoMassSpentKg : 0,
    paybackDays,
    paysBackInCampaign: paybackDays !== null && paybackDays <= campaignEndDay,
    warnings
  };
}

function landersBy(params: SimParams, basis: CampaignBasis, tDays: number): number {
  if (tDays < 0 || basis.nMissions === 0) return 0;
  // Tolerance so a landing evaluated at its own time counts.
  return Math.min(basis.nMissions, Math.floor(tDays / landingIntervalDays(params) + 1e-9) + 1);
}

/** A result carrying the ledger: `SimResult` satisfies it. */
export interface CampaignSource {
  logistics: CampaignBasis;
  campaign: CampaignResult;
}

function ledgerAt(params: SimParams, { logistics: basis, campaign }: CampaignSource, tDays: number, landers: number): CampaignPoint {
  const capacity = capacityKg(params, basis);
  const plantLandedKg = capacity > 0 ? Math.min(basis.totalInfraMassKg, landers * capacity) : 0;
  const operatingDays = Math.min(
    Math.max(0, tDays - campaign.firstProductDay),
    campaign.campaignEndDay - campaign.firstProductDay
  );
  const suppliesKg = ((campaign.resupplyKgPerYear + campaign.feedKgPerYear) * operatingDays) / DAYS_PER_YEAR;
  const productKg = campaign.deliveredKgPerDay * operatingDays;
  return {
    tDays,
    landers,
    landedMassKg: plantLandedKg + suppliesKg,
    productKg,
    leoMassSpentKg:
      (params.deploymentManifest === "shared" ? campaign.leoMassPerLandedKg * plantLandedKg : landers * params.M0leo) +
      campaign.leoMassPerLandedKg * suppliesKg,
    leoMassSavedKg: params.gearRatio * productKg
  };
}

/**
 * The ledger at `tDays`, counting landings at exactly `tDays`. Uses the same
 * terms as `simulateCampaign`, so at `campaignEndDay` it reproduces the totals
 * and at `paybackDays` saved equals spent.
 */
export function campaignAt(params: SimParams, source: CampaignSource, tDays: number): CampaignPoint {
  return ledgerAt(params, source, tDays, landersBy(params, source.logistics, tDays));
}

export interface CampaignTimelinePoint extends CampaignPoint {
  /** what happens at this time, or "" for a regular sample */
  event: string;
}

/**
 * Ledger samples for plotting and export: every `stepDays`, plus each landing
 * (just before and at it, so the step draws vertically), production start,
 * payback, and campaign end.
 */
export function campaignTimeline(params: SimParams, source: CampaignSource, stepDays = 30): CampaignTimelinePoint[] {
  const { logistics: basis, campaign } = source;
  const points: CampaignTimelinePoint[] = [];
  const add = (tDays: number, event: string, landers = landersBy(params, basis, tDays)): void => {
    points.push({ ...ledgerAt(params, source, tDays, landers), event });
  };
  const interval = landingIntervalDays(params);
  // A near-empty lander can need millions of landings: mark each one only
  // when there are few enough to draw, otherwise the first and the last.
  const marked =
    basis.nMissions <= MAX_LANDING_EVENTS
      ? Array.from({ length: basis.nMissions }, (_, i) => i)
      : [0, basis.nMissions - 1];
  for (const i of marked) {
    if (i > 0) add(i * interval, `before landing ${i + 1}`, i);
    add(i * interval, `landing ${i + 1}`, i + 1);
  }
  add(campaign.firstProductDay, "production start");
  if (campaign.paysBackInCampaign && campaign.paybackDays !== null) add(campaign.paybackDays, "payback");
  add(campaign.campaignEndDay, "campaign end");

  const eventDays = points.map((point) => point.tDays);
  const step = Math.max(1, stepDays, campaign.campaignEndDay / MAX_SAMPLES);
  for (let k = 0; k * step < campaign.campaignEndDay; k += 1) {
    const t = k * step;
    if (!eventDays.some((day) => Math.abs(day - t) < 1e-9)) add(t, "");
  }
  // Stable sort keeps each "before landing" ahead of its landing.
  return points.sort((a, b) => a.tDays - b.tDays);
}
