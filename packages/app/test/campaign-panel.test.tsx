// @vitest-environment jsdom
import { campaignTimeline, DEFAULTS, refuelTimeline, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { inputActivity } from "../src/analysis/activity";
import { campaignStatus } from "../src/analysis/campaign";
import { COMPARE_METRICS } from "../src/analysis/compare";
import { campaignCsv, refuelCsv } from "../src/analysis/panelExports";
import { caseSummary } from "../src/analysis/summary";
import { CampaignPanel } from "../src/components/panels/CampaignPanel";
import { parseParams, serializeParams } from "../src/lib/url";
import { useStore } from "../src/state/store";

const run = (patch: Partial<SimParams>) => {
  const params = { ...DEFAULTS, ...patch };
  return { params, result: simulate(params) };
};

describe("campaign status wording", () => {
  it("states the payback day when the plant pays back within the campaign", () => {
    const status = campaignStatus(run({}).result.campaign);
    expect(status).toMatchObject({ headline: "PAYS BACK ON DAY 242", payback: "DAY 242" });
    expect(status.paybackDetail).toBe("0.66 yr after the first landing");
  });

  it("separates a late payback, no payback, and nothing landed", () => {
    expect(campaignStatus(run({ site: "polar", targetKgPerDay: 10 }).result.campaign)).toMatchObject({
      payback: "NOT IN CAMPAIGN",
      paybackDetail: expect.stringMatching(/^Would need day 22,501 \(61\.6 yr\)$/)
    });
    const outpaced = run({ site: "polar", targetKgPerDay: 10, gearRatio: 2, plantAvailability: 0.5, sparesFracPerYear: 0.3, chiIce: 0.005 });
    expect(campaignStatus(outpaced.result.campaign)).toMatchObject({
      payback: "NEVER",
      paybackDetail: "Spares cost more LEO mass than the product saves"
    });
    const sabatier = run({ site: "polar", enableSabatier: true });
    expect(campaignStatus(sabatier.result.campaign).paybackDetail).toBe("Spares and imported feed cost more LEO mass than the product saves");
    const grounded = run({ M0leo: 500_000, dvTotal: 6500, IspLander: 310, MdryLander: 200_000 });
    expect(campaignStatus(grounded.result.campaign).headline).toBe("NOTHING CAN BE LANDED");
  });
});

describe("campaign compare row", () => {
  it("shows payback only when it falls within the campaign", () => {
    const payback = COMPARE_METRICS.find((metric) => metric.label === "PAYBACK")!;
    expect(Math.round(payback.value(run({}).result))).toBe(242);
    const pilot = run({ site: "polar", targetKgPerDay: 10 }).result;
    expect(pilot.campaign.paybackDays).toBeGreaterThan(pilot.campaign.campaignEndDay);
    expect(payback.value(pilot)).toBeNaN();
  });
});

describe("campaign CSV", () => {
  it("writes every timeline point with units and events", () => {
    const { params, result } = run({ targetKgPerDay: 10_000, landingsPerYear: 2 });
    const timeline = campaignTimeline(params, result, 30);
    const lines = campaignCsv(timeline).split("\n");
    expect(lines[0]).toBe(
      "tDays [day from first landing],event,landers,landedMassKg [kg],productKg [kg],usedKg [kg],leoMassSpentKg [kg in LEO],leoMassSavedKg [kg in LEO]"
    );
    expect(lines).toHaveLength(timeline.length + 1);
    expect(lines.some((line) => line.includes(",before landing 2,1,"))).toBe(true);
    expect(lines.some((line) => line.includes(",payback,"))).toBe(true);
    const end = lines.at(-1)!.split(",");
    expect(end[1]).toBe("campaign end");
    expect(Number(end[6])).toBe(result.campaign.leoMassSpentKg);
    expect(Number(end[7])).toBe(result.campaign.leoMassSavedKg);
  });

  it("writes the refuelling drawdown with units and sortie events", () => {
    const { params, result } = run({ site: "polar", polarProduct: "propellant", refuelDemand: "lander", sortiesPerYear: 8 });
    const timeline = refuelTimeline(params, result);
    const lines = refuelCsv(timeline).split("\n");
    expect(lines[0]).toBe("tDays [day from first landing],event,o2Kg [kg in store],h2Kg [kg in store]");
    expect(lines).toHaveLength(timeline.length + 1);
    expect(lines[1]).toBe(`${result.campaign.firstProductDay},production start,0,0`);
    expect(lines.some((line) => line.includes(",sortie 1,"))).toBe(true);
  });
});

describe("campaign panel", () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  });

  afterEach(() => {
    cleanup();
    act(() => useStore.getState().applyPatch({ deploymentManifest: "dedicated" }));
  });

  it("shows the engine's payback and switches how landers are charged", () => {
    act(() => useStore.getState().applyPatch({ ...DEFAULTS }));
    render(<CampaignPanel />);
    expect(screen.getByText("PAYS BACK ON DAY 242")).toBeTruthy();
    expect(screen.getByText(/Charged 1 whole lander at/)).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "SHARED MANIFEST" }));
    });
    expect(useStore.getState().params.deploymentManifest).toBe("shared");
    const shared = useStore.getState().result.campaign.paybackDays!;
    expect(shared).toBeLessThan(242);
    expect(screen.getByText(`PAYS BACK ON DAY ${Math.round(shared)}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "SHARED MANIFEST" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the refuelling demand only when one is set, and credits only what the lander burns", () => {
    act(() => useStore.getState().applyPatch({ ...DEFAULTS }));
    render(<CampaignPanel />);
    expect(screen.queryByText(/REFUELLING DEMAND/)).toBeNull();
    expect(screen.getByText("SAVED · PRODUCT × GEAR RATIO")).toBeTruthy();
    cleanup();

    act(() => useStore.getState().applyPatch({ refuelDemand: "lander" }));
    render(<CampaignPanel />);
    const refuel = useStore.getState().result.refuel!;
    expect(screen.getByText(/REFUELLING DEMAND · REUSABLE LANDER/)).toBeTruthy();
    expect(screen.getByText(`PLANT SUPPLIES ${Math.round(refuel.isruShare * 100)}% OF ITS PROPELLANT`)).toBeTruthy();
    expect(screen.getByText("all hydrogen comes from Earth")).toBeTruthy();
    expect(screen.getByText("SAVED · PROPELLANT BURNED × GEAR RATIO")).toBeTruthy();
    // One crewed sortie a year uses a ninth of the plant, so it never pays back.
    expect(screen.getByText("NO PAYBACK WITHIN THE CAMPAIGN")).toBeTruthy();
    expect(screen.getByRole("button", { name: "DRAWDOWN CSV" })).toBeTruthy();
  });
});

describe("refuelling demand wording", () => {
  it("states what the lander burns and that only it repays the launch mass", () => {
    const { params, result } = run({ refuelDemand: "lander" });
    expect(caseSummary(params, result)).toMatch(
      /A reusable lander flying 1 sortie a year burns 100\u2009kg\/day of it, 86% of the propellant it needs\. The propellant burned does not repay the launch mass within the campaign\.$/
    );
    const matched = run({ refuelDemand: "lander", sortiesPerYear: 9 });
    expect(caseSummary(matched.params, matched.result)).toMatch(/flying 9 sorties a year burns 900\u2009kg\/day .* The propellant burned repays the launch mass by day 242\.$/);
  });
});

describe("campaign inputs", () => {
  it("round-trip through the share URL", () => {
    const params = { ...DEFAULTS, deploymentManifest: "shared" as const, commissioningDays: 90, sparesFracPerYear: 0.05 };
    const query = serializeParams(params);
    expect(query).toBe("commissioningDays=90&sparesFracPerYear=0.05&deploymentManifest=shared");
    expect(simulate(parseParams(query))).toEqual(simulate(params));
    expect(parseParams("deploymentManifest=chartered")).toEqual({});
    const refuelled = { ...DEFAULTS, refuelDemand: "lander" as const, sortiesPerYear: 6, dvDescent: 2700 };
    const refuelQuery = serializeParams(refuelled);
    expect(simulate(parseParams(refuelQuery))).toEqual(simulate(refuelled));
    expect(parseParams("refuelDemand=tanker")).toEqual({});
  });

  it("explain why landing cadence does nothing for a one-lander plant, and drive payback otherwise", () => {
    const oneLander = inputActivity({ ...DEFAULTS }, "landingsPerYear");
    expect(oneLander.activity).toBe("no-effect");
    expect(oneLander.reason).toMatch(/fits on one lander/);
    const big = inputActivity({ ...DEFAULTS, targetKgPerDay: 10_000 }, "landingsPerYear");
    expect(big.activity).toBe("drives-results");
    expect(big.reason).toMatch(/deployment time/);
    expect(big.changed).toContain("campaign.paybackDays");
    for (const key of ["commissioningDays", "plantAvailability", "sparesFracPerYear"] as const) {
      expect(inputActivity({ ...DEFAULTS }, key).activity, key).toBe("drives-results");
    }
  });
});
