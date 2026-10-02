import { DEFAULTS } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { describeResultPath, inputActivity } from "../src/analysis/activity";
import { SITE_ONLY_PARAMS } from "../src/controls/manifest";

const equatorial: SimParams = { ...DEFAULTS, site: "equatorial" };
const polar: SimParams = { ...DEFAULTS, site: "polar" };

describe("input activity", () => {
  it("flags inputs that change the headline answer", () => {
    for (const key of ["targetKgPerDay", "Vcell", "etaCurrent", "eMining"] as const) {
      expect(inputActivity(equatorial, key).activity, key).toBe("drives-results");
    }
    expect(inputActivity(polar, "chiIce").activity).toBe("drives-results");
  });

  it("separates subsystem checks from headline drivers", () => {
    const cohesion = inputActivity(equatorial, "c");
    expect(cohesion.activity).toBe("checks-only");
    expect(cohesion.reason).toMatch(/Headline results do not move/);
    expect(inputActivity(equatorial, "Amu").changed).toContain("electrolysis.meltViscosityPaS");
  });

  it("explains solar inputs while the lighter nuclear option is selected", () => {
    const pv = inputActivity(equatorial, "etaCell");
    expect(pv.activity).toBe("checks-only");
    expect(pv.reason).toMatch(/solar alternative only/);
  });

  it("does not call a crossover-only input solar-only", () => {
    // dNuclear only moves the aged crossover; it sizes neither option.
    const growth = inputActivity(equatorial, "dNuclear");
    expect(growth.activity).toBe("checks-only");
    expect(growth.reason).not.toMatch(/alternative only/);
    expect(growth.reason).toMatch(/aged solar\/nuclear crossover/);
  });

  it("reports inputs the current configuration ignores", () => {
    // The default oxide-composition model derives oxygen yield from the assay.
    expect(inputActivity({ ...equatorial, oxideModel: true }, "xO2").activity).toBe("no-effect");
    expect(inputActivity({ ...equatorial, oxideModel: false }, "xO2").activity).toBe("drives-results");
    // Sabatier inputs do nothing until the loop is enabled.
    expect(inputActivity({ ...polar, enableSabatier: false }, "fConversion").activity).toBe("no-effect");
    expect(inputActivity({ ...polar, enableSabatier: true }, "fConversion").activity).toBe("drives-results");
  });

  it("ignores result fields that only echo the input", () => {
    // shieldDesignM is echoed into construction.shieldDesignM; that alone is not an effect.
    const shield = inputActivity(equatorial, "shieldDesignM");
    expect(shield.changed).not.toContain("construction.shieldDesignM");
    expect(shield.changed).toContain("construction.daysToShieldHabitat");
  });

  it("labels result paths in plain words", () => {
    expect(describeResultPath("electrolysis.drainVelocityMPerS")).toBe("drain velocity");
    expect(describeResultPath("energy.secTotal_kWhPerKg")).toBe("energy per kg");
    expect(describeResultPath("power.solarArrayM2")).toBe("solar array area");
    expect(describeResultPath("excavation.cuttingForceN")).toBe("cutting force");
    expect(describeResultPath("cryo.boiloffKgPerDay")).toBe("boiloff");
    expect(describeResultPath("energy.balances[0].usefulOutputW")).toBe("balances · useful output");
    const named = new Map([["energy.balances[0].label", "Excavation"]]);
    expect(describeResultPath("energy.balances[0].usefulOutputW", named)).toBe("Excavation · useful output");
  });

  it("only hides site-specific inputs that cannot act at the other site", () => {
    for (const [key, site] of Object.entries(SITE_ONLY_PARAMS)) {
      const other = site === "polar" ? equatorial : polar;
      expect(inputActivity(other, key as keyof SimParams).activity, key).toBe("no-effect");
    }
  });
});
