import { describe, expect, it } from "vitest";
import {
  CUSTOM_SITE_DESKTOP_DETAIL_BUDGET,
  createCustomSiteStressFixture,
  customSiteComplexity
} from "../src/site-design/performance";

describe("custom site performance guardrails", () => {
  it("keeps small documents detailed and simplifies beyond the desktop budget", () => {
    const small = createCustomSiteStressFixture("equatorial", 12);
    const large = createCustomSiteStressFixture("equatorial", 160);

    expect(customSiteComplexity(small, false)).toMatchObject({
      detailedAssetCount: 12,
      simplifiedAssetCount: 0,
      level: "normal"
    });
    expect(customSiteComplexity(large, false)).toMatchObject({
      detailedAssetCount: CUSTOM_SITE_DESKTOP_DETAIL_BUDGET,
      simplifiedAssetCount: 160 - CUSTOM_SITE_DESKTOP_DETAIL_BUDGET,
      level: "caution"
    });
  });

  it("builds deterministic bounded stress documents", () => {
    const first = createCustomSiteStressFixture("polar", 160);
    const second = createCustomSiteStressFixture("polar", 160);

    expect(first).toEqual(second);
    expect(first.assets).toHaveLength(160);
    expect(first.connections).toHaveLength(159);
    expect(new Set(first.assets.map((asset) => asset.id)).size).toBe(160);
    expect(createCustomSiteStressFixture("polar", 900).assets).toHaveLength(500);
  });
});
