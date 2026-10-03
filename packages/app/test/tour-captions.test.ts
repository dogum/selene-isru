import { DEFAULTS, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { TOURS, captionText } from "../src/tours";

describe("tour captions follow the engine", () => {
  const polarTour = TOURS.find((tour) => tour.id === "polar-water")!;
  const caption = (index: number, params: SimParams): string =>
    captionText(polarTour.beats[index]!.caption, simulate(params), params);

  it("narrate fission when the engine selects it at the polar site", () => {
    const params = { ...DEFAULTS, site: "polar" as const };
    expect(simulate(params).power.architecture).toBe("nuclear");
    expect(caption(0, params)).toMatch(/fission plant is lighter/);
    expect(caption(1, params)).toMatch(/solar alternative\. Beaming delivers only 24%/);
  });

  it("narrate rim solar when the engine selects it", () => {
    // Free night storage and a cheap array make the solar option the lighter one.
    const params = { ...DEFAULTS, site: "polar" as const, polarLongestShadowHours: 1, polarIlluminationFraction: 0.95, Rarray: 5, SEstorage: 1500, alphaSpecific: 90 };
    expect(simulate(params).power.architecture).toBe("solar");
    expect(caption(0, params)).toMatch(/rim solar power feeds/);
    expect(caption(1, params)).toMatch(/beamed to the floor at 24% delivery/);
  });
});
