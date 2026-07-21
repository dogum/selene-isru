import { DEFAULTS, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { parseParams, serializeParams } from "../src/lib/url";

describe("URL round-trip (§8.4)", () => {
  it("serializes only non-default params, compactly", () => {
    const params: SimParams = { ...DEFAULTS, site: "polar", chiIce: 0.03 };
    expect(serializeParams(params)).toBe("site=polar&chiIce=0.03");
    expect(serializeParams({ ...DEFAULTS })).toBe("");
  });

  it("round-trips to an identical SimResult", () => {
    const patch: Partial<SimParams> = {
      site: "polar",
      chiIce: 0.03,
      targetKgPerDay: 5000,
      enableSabatier: true,
      missionYears: 12,
      Vcell: 4.7,
      storageStream: "lch4",
      cryoControlMode: "capacity-limited",
      coolerCapacityW: 75,
      polarProfileMode: "profile",
      polarProfileData: JSON.stringify({ name: "URL profile", points: [{ hour: 0, illumination: 1 }, { hour: 24, illumination: 0 }] })
    };
    const params: SimParams = { ...DEFAULTS, ...patch };
    const query = serializeParams(params);
    const parsed = parseParams(query);
    expect(simulate(parsed)).toEqual(simulate(patch));
  });

  it("ignores garbage and unknown keys (engine clamps the rest)", () => {
    const parsed = parseParams("?site=mars&chiIce=banana&nope=1&Vcell=4.6");
    expect(parsed).toEqual({ Vcell: 4.6 });
    // out-of-bounds values pass through; engine clamping makes them safe
    const wild = parseParams("targetKgPerDay=999999999");
    expect(simulate(wild).production.targetKgPerDay).toBeLessThanOrEqual(20000);
  });
});
