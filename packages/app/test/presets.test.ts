import { DEFAULTS, simulate } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/presets";

describe("presets", () => {
  it("runs NASA's polar propellant baseline at its 15 t of water a year", () => {
    const preset = PRESETS.find((item) => item.id === "polar-propellant")!;
    const params = { ...DEFAULTS, ...preset.patch };
    // 15 t in a 225-day window less 48 h of commissioning, once a year.
    expect(params.targetKgPerDay * 365 * params.plantAvailability).toBeCloseTo(15_000, -1);
    expect(params.commissioningDays).toBe(2);
    const result = simulate(params);
    expect(result.campaign.deliveredKgPerDay * 365).toBeCloseTo(15_000 * (result.production.propellantKgPerDay / params.targetKgPerDay), -1);
  });
});
