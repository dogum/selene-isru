import { describe, expect, test } from "vitest";
import { campaignAt, campaignTimeline, normalizeParams, simulate } from "../src/index";
import type { SimParams } from "../src/types";

function run(input: Partial<SimParams>): { params: SimParams; result: ReturnType<typeof simulate> } {
  const params = normalizeParams(input).params;
  return { params, result: simulate(params) };
}

function expectRel(actual: number, expected: number, relTol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1e-9, Math.abs(expected) * relTol));
}

const CASES: Array<[string, Partial<SimParams>]> = [
  ["equatorial default", {}],
  ["polar default", { site: "polar" }],
  ["multi-lander", { targetKgPerDay: 10000, landingsPerYear: 2 }],
  ["shared pilot", { site: "polar", targetKgPerDay: 10, deploymentManifest: "shared" }]
];

describe("campaign ledger agrees with itself", () => {
  test.each(CASES)("%s: the ledger at campaign end reproduces the totals", (_name, input) => {
    const { params, result } = run(input);
    const { campaign } = result;
    const end = campaignAt(params, result, campaign.campaignEndDay);
    expectRel(end.productKg, campaign.cumulativeProductKg, 1e-12);
    expectRel(end.landedMassKg, campaign.landedMassKg, 1e-12);
    expectRel(end.leoMassSpentKg, campaign.leoMassSpentKg, 1e-12);
    expectRel(end.leoMassSavedKg, campaign.leoMassSavedKg, 1e-12);
    expect(end.landers).toBe(result.logistics.nMissions);
    // Nothing accrues after the campaign ends.
    expect(campaignAt(params, result, campaign.campaignEndDay + 1000)).toEqual({ ...end, tDays: campaign.campaignEndDay + 1000 });
  });

  test.each(CASES)("%s: saved equals spent at the payback day", (_name, input) => {
    const { params, result } = run(input);
    const { campaign } = result;
    expect(campaign.paybackDays).not.toBeNull();
    const at = campaignAt(params, result, campaign.paybackDays!);
    expectRel(at.leoMassSavedKg, at.leoMassSpentKg, 1e-9);
    const before = campaignAt(params, result, campaign.paybackDays! - 1);
    expect(before.leoMassSavedKg).toBeLessThan(before.leoMassSpentKg);
  });

  test.each(CASES)("%s: the timeline is ordered, cumulative, and marks its events", (_name, input) => {
    const { params, result } = run(input);
    const timeline = campaignTimeline(params, result, 60);
    for (let i = 1; i < timeline.length; i += 1) {
      const [a, b] = [timeline[i - 1]!, timeline[i]!];
      expect(b.tDays).toBeGreaterThanOrEqual(a.tDays);
      expect(b.leoMassSpentKg).toBeGreaterThanOrEqual(a.leoMassSpentKg);
      expect(b.leoMassSavedKg).toBeGreaterThanOrEqual(a.leoMassSavedKg);
      expect(b.landedMassKg).toBeGreaterThanOrEqual(a.landedMassKg);
    }
    const events = timeline.map((point) => point.event).filter((event) => event !== "");
    expect(events).toContain("production start");
    expect(events.at(-1)).toBe("campaign end");
    expect(events.filter((event) => event.startsWith("landing "))).toHaveLength(result.logistics.nMissions);
    if (result.campaign.paysBackInCampaign) expect(events).toContain("payback");
  });
});

describe("campaign ledger behaviour", () => {
  test("nothing is produced before commissioning ends", () => {
    const { params, result } = run({ targetKgPerDay: 10000, landingsPerYear: 2 });
    const { campaign } = result;
    expect(result.logistics.nMissions).toBeGreaterThan(1);
    expectRel(campaign.deploymentDays, ((result.logistics.nMissions - 1) * 365) / 2, 1e-12);
    expectRel(campaign.firstProductDay, campaign.deploymentDays + params.commissioningDays, 1e-12);
    expect(campaignAt(params, result, campaign.firstProductDay).productKg).toBe(0);
    expect(campaignAt(params, result, campaign.firstProductDay + 1).productKg).toBeGreaterThan(0);
  });

  test("a dedicated landing steps the spend by one whole lander", () => {
    const { params, result } = run({ targetKgPerDay: 10000, landingsPerYear: 2 });
    const timeline = campaignTimeline(params, result, 90);
    const before = timeline.find((point) => point.event === "before landing 2")!;
    const after = timeline.find((point) => point.event === "landing 2")!;
    expect(after.tDays).toBe(before.tDays);
    expect(after.landers - before.landers).toBe(1);
    expectRel(after.leoMassSpentKg - before.leoMassSpentKg, params.M0leo, 1e-12);
  });

  test("a shared manifest charges only the plant's mass share", () => {
    const shared = run({ deploymentManifest: "shared" });
    const dedicated = run({});
    const { campaign } = shared.result;
    // Everything landed is charged at the same LEO cost per landed kg.
    expectRel(campaign.leoMassSpentKg, campaign.leoMassPerLandedKg * campaign.landedMassKg, 1e-12);
    expect(campaign.leoMassSpentKg).toBeLessThan(dedicated.result.campaign.leoMassSpentKg);
    expect(campaign.paybackDays!).toBeLessThan(dedicated.result.campaign.paybackDays!);
  });

  test("a dedicated lander for a pilot plant does not pay back; a shared one does", () => {
    const dedicated = run({ site: "polar", targetKgPerDay: 10 }).result.campaign;
    const shared = run({ site: "polar", targetKgPerDay: 10, deploymentManifest: "shared" }).result.campaign;
    expect(dedicated.paysBackInCampaign).toBe(false);
    expect(dedicated.returnRatio).toBeLessThan(1);
    expect(shared.paysBackInCampaign).toBe(true);
  });

  test("output that never outpaces spares has no payback", () => {
    const { result } = run({ site: "polar", targetKgPerDay: 10, gearRatio: 2, plantAvailability: 0.5, sparesFracPerYear: 0.3, chiIce: 0.005 });
    const { campaign } = result;
    const resupplyLeoPerDay = (campaign.leoMassPerLandedKg * campaign.resupplyKgPerYear) / 365;
    expect(2 * campaign.deliveredKgPerDay).toBeLessThanOrEqual(resupplyLeoPerDay);
    expect(campaign.paybackDays).toBeNull();
    expect(campaign.paysBackInCampaign).toBe(false);
  });

  test("the Sabatier loop delivers its products and lands its CO2 feed", () => {
    const { params, result } = run({ site: "polar", enableSabatier: true });
    const { production, campaign, logistics } = result;
    expectRel(
      campaign.deliveredKgPerDay,
      (production.o2KgPerDay + production.ch4KgPerDay + production.h2KgPerDay) * params.plantAvailability,
      1e-12
    );
    expectRel(campaign.feedKgPerYear, production.co2ImportedKgPerDay * params.plantAvailability * 365, 1e-12);
    expectRel(
      campaign.landedMassKg,
      logistics.totalInfraMassKg + (campaign.resupplyKgPerYear + campaign.feedKgPerYear) * params.missionYears,
      1e-12
    );
    // Earth-supplied CO2 costs more LEO mass per day than the products save.
    expect(params.gearRatio * campaign.deliveredKgPerDay).toBeLessThan((campaign.leoMassPerLandedKg * campaign.feedKgPerYear) / 365);
    expect(campaign.paybackDays).toBeNull();
    // Water-only and equatorial plants import nothing.
    expect(run({ site: "polar" }).result.campaign.feedKgPerYear).toBe(0);
    expect(run({}).result.campaign.feedKgPerYear).toBe(0);
  });

  test("a lander with no payload deploys nothing and says so", () => {
    const { params, result } = run({ M0leo: 500_000, dvTotal: 6500, IspLander: 310, MdryLander: 200_000 });
    expect(result.logistics.payloadPerMissionKg).toBeLessThan(0);
    expect(result.warnings.some((warning) => warning.id === "lander-no-payload")).toBe(true);
    const { campaign } = result;
    expect(campaign.leoMassSpentKg).toBe(0);
    expect(campaign.leoMassSavedKg).toBe(0);
    expect(campaign.paybackDays).toBeNull();
    expect(campaign.returnRatio).toBe(0);
    expect(campaignTimeline(params, result).every((point) => point.leoMassSpentKg === 0 && point.productKg === 0)).toBe(true);
  });
});
