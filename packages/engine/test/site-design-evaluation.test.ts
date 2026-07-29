import { describe, expect, test } from "vitest";
import {
  SEEDED_SITE_DESIGN_FIXTURES,
  evaluateSiteDesign,
  simulate,
  simulateSiteDesignTimeseries
} from "../src/index";
import type { SiteDesignDocument } from "../src/index";

function clone(document: SiteDesignDocument): SiteDesignDocument {
  return structuredClone(document);
}

describe("custom site topology-backed evaluation", () => {
  test("opens the topology gate for both complete reference chains", () => {
    const equatorial = evaluateSiteDesign(
      SEEDED_SITE_DESIGN_FIXTURES.equatorial
    );
    const polar = evaluateSiteDesign(SEEDED_SITE_DESIGN_FIXTURES.polar);

    expect(equatorial).toMatchObject({
      topologyValid: true,
      powerStrategy: "auto",
      achievableOutputKgPerDay: equatorial.plannedTargetKgPerDay
    });
    expect(polar).toMatchObject({
      topologyValid: true,
      powerStrategy: "solar",
      achievableOutputKgPerDay: polar.plannedTargetKgPerDay
    });
    expect(polar.baseResult.power.architecture).toBe("solar");
    expect(equatorial.findings).toContainEqual(expect.objectContaining({
      id: "spatial.power-cable-model",
      severity: "info"
    }));
  });

  test("keeps the continuously sized requirement but gates achieved output", () => {
    const broken = clone(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
    broken.connections = broken.connections.filter((connection) =>
      connection.id !== "eq-reactor-feed"
    );

    const evaluation = evaluateSiteDesign(broken);
    expect(evaluation.topologyValid).toBe(false);
    expect(evaluation.achievableOutputKgPerDay).toBe(0);
    expect(evaluation.baseResult.production.targetKgPerDay).toBe(
      evaluation.plannedTargetKgPerDay
    );
    expect(evaluation.bottleneck?.label).toContain("Required process step");
    expect(evaluation.baseResult.warnings).toContainEqual(expect.objectContaining({
      id: "site-design:topology.required.equatorial-haul-process",
      severity: "alarm"
    }));

    const timeseries = simulateSiteDesignTimeseries(broken, {
      cycles: 1,
      samplesPerCycle: 12
    });
    expect(timeseries.points.every((point) =>
      point.loadW === 0 &&
      point.netProductionKgPerDay === 0 &&
      point.tankFillKg === 0
    )).toBe(true);
    expect(timeseries.summary).toMatchObject({
      dutyCycle: 0,
      tankPeakKg: 0,
      curtailedFraction: 1
    });
  });

  test("selects an explicitly connected polar nuclear source", () => {
    const design = clone(SEEDED_SITE_DESIGN_FIXTURES.polar);
    const power = design.connections.find((connection) =>
      connection.id === "polar-power-feed"
    )!;
    power.from.assetId = "polar-station-1";

    const evaluation = evaluateSiteDesign(design);
    expect(evaluation.topologyValid).toBe(true);
    expect(evaluation.powerStrategy).toBe("nuclear");
    expect(evaluation.baseResult.power.architecture).toBe("nuclear");
    expect(simulateSiteDesignTimeseries(design).points.every((point) =>
      point.solarOutputW === 0
    )).toBe(true);
  });

  test("leaves authored auto simulation behavior unchanged", () => {
    const params = SEEDED_SITE_DESIGN_FIXTURES.polar.params;
    expect(simulate(params)).toEqual(simulate(params, {
      powerStrategy: "auto"
    }));
  });
});
