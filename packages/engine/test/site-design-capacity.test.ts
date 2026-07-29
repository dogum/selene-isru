import { describe, expect, test } from "vitest";
import {
  SEEDED_SITE_DESIGN_FIXTURES,
  evaluateSiteDesign,
  simulateSiteDesignTimeseries
} from "../src/index";
import type {
  SiteAssetInstance,
  SiteConnection,
  SiteDesignDocument
} from "../src/index";

function clone(document: SiteDesignDocument): SiteDesignDocument {
  return structuredClone(document);
}

function doubledEquatorialTrain(): SiteDesignDocument {
  const design = clone(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
  const requiredKinds = new Set([
    "equatorial.excavator",
    "equatorial.hauler",
    "equatorial.mre-reactor",
    "equatorial.cryo-farm",
    "equatorial.power-hub"
  ]);
  design.assets = design.assets.filter((asset) =>
    requiredKinds.has(asset.kind)
  );
  design.connections = design.connections.filter((connection) =>
    [
      "eq-regolith-pickup",
      "eq-reactor-feed",
      "eq-reactor-power",
      "eq-oxygen-storage"
    ].includes(connection.id)
  );
  design.params.targetKgPerDay = 1_800;

  const duplicate = (
    kind: string,
    id: string,
    name: string
  ): SiteAssetInstance => {
    const source = design.assets.find((asset) => asset.kind === kind)!;
    return {
      ...structuredClone(source),
      id,
      name,
      transform: {
        ...source.transform,
        xM: source.transform.xM + 60
      }
    };
  };
  const excavator = duplicate(
    "equatorial.excavator",
    "eq-excavator-2",
    "Excavation rover EX-02"
  );
  const hauler = duplicate(
    "equatorial.hauler",
    "eq-hauler-2",
    "Regolith hauler HV-02"
  );
  const reactor = duplicate(
    "equatorial.mre-reactor",
    "eq-reactor-2",
    "MRE reactor MRE-02"
  );
  const storage = duplicate(
    "equatorial.cryo-farm",
    "eq-storage-2",
    "Cryogenic farm CR-02"
  );
  const power = design.assets.find((asset) =>
    asset.kind === "equatorial.power-hub"
  )!;
  power.configuration.unitCount = 2;
  design.assets.push(excavator, hauler, reactor, storage);

  const connection = (
    id: string,
    kind: SiteConnection["kind"],
    from: SiteAssetInstance,
    fromPortId: string,
    to: SiteAssetInstance,
    toPortId: string
  ): SiteConnection => ({
    id,
    kind,
    from: { assetId: from.id, portId: fromPortId },
    to: { assetId: to.id, portId: toPortId },
    route: [],
    configuration: {}
  });
  design.connections.push(
    connection(
      "eq-regolith-pickup-2",
      "material",
      excavator,
      "regolith-out",
      hauler,
      "regolith-in"
    ),
    connection(
      "eq-reactor-feed-2",
      "material",
      hauler,
      "regolith-out",
      reactor,
      "regolith-in"
    ),
    connection(
      "eq-reactor-power-2",
      "power",
      power,
      "grid-out",
      reactor,
      "power-in"
    ),
    connection(
      "eq-oxygen-storage-2",
      "material",
      reactor,
      "oxygen-out",
      storage,
      "product-in"
    )
  );
  return design;
}

describe("custom site installed capacity and spatial evaluation", () => {
  test("scales a fully connected process train and exposes a removed-stage bottleneck", () => {
    const design = doubledEquatorialTrain();
    const doubled = evaluateSiteDesign(design);

    expect(doubled.findings.filter((finding) =>
      finding.severity === "error"
    )).toEqual([]);
    expect(doubled.topologyValid).toBe(true);
    expect(doubled.achievableOutputKgPerDay).toBe(1_800);
    expect(doubled.capacityGroups.filter((group) =>
      group.metric === "product-throughput"
    ).every((group) => group.installed === 2_000)).toBe(true);
    expect(doubled.installedPowerW).toBe(2_500_000);

    design.assets = design.assets.filter((asset) =>
      asset.id !== "eq-storage-2"
    );
    design.connections = design.connections.filter((connection) =>
      connection.from.assetId !== "eq-storage-2" &&
      connection.to.assetId !== "eq-storage-2"
    );
    const limited = evaluateSiteDesign(design);

    expect(limited.topologyValid).toBe(true);
    expect(limited.achievableOutputKgPerDay).toBe(1_000);
    expect(limited.bottleneck).toMatchObject({
      kind: "capacity",
      unit: "kg/day",
      installed: 1_000
    });
    expect(limited.findings).toContainEqual(expect.objectContaining({
      id: "capacity.shortfall.equatorial-storage",
      severity: "caution"
    }));
  });

  test("uses configured power-bank quantity without changing the persisted schema", () => {
    const design = doubledEquatorialTrain();
    const power = design.assets.find((asset) =>
      asset.kind === "equatorial.power-hub"
    )!;
    power.configuration.unitCount = 1;
    const oneUnit = evaluateSiteDesign(design);
    power.configuration.unitCount = 2;
    const twoUnits = evaluateSiteDesign(design);

    expect(oneUnit.installedPowerW).toBe(1_250_000);
    expect(oneUnit.achievableOutputKgPerDay).toBeLessThan(1_800);
    expect(twoUnits.installedPowerW).toBe(2_500_000);
    expect(twoUnits.achievableOutputKgPerDay).toBe(1_800);
  });

  test("drives the operating timeseries from achieved rather than requested output", () => {
    const design = clone(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
    design.params.targetKgPerDay = 1_800;
    const evaluation = evaluateSiteDesign(design);
    const timeseries = simulateSiteDesignTimeseries(design, {
      cycles: 1,
      samplesPerCycle: 24
    });

    expect(evaluation.achievableOutputKgPerDay).toBe(1_000);
    expect(evaluation.achievedResult.production.targetKgPerDay).toBe(1_000);
    expect(evaluation.achievedResult.energy.maxAbsResidualW).toBeLessThan(1e-6);
    expect(timeseries.points.some((point) =>
      point.netProductionKgPerDay > 0
    )).toBe(true);
    expect(Math.max(...timeseries.points.map((point) =>
      point.netProductionKgPerDay
    ))).toBeLessThanOrEqual(evaluation.achievableOutputKgPerDay);
  });

  test("applies persisted power-route length to cable mass, loss, and logistics", () => {
    const near = clone(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
    const far = clone(near);
    const farPower = far.assets.find((asset) =>
      asset.kind === "equatorial.power-hub"
    )!;
    farPower.transform.xM = 40;
    farPower.transform.zM = -50;

    const nearEvaluation = evaluateSiteDesign(near);
    const farEvaluation = evaluateSiteDesign(far);
    expect(farEvaluation.findings.filter((finding) =>
      finding.severity === "error"
    )).toEqual([]);
    const cableManifest = farEvaluation.achievedResult.logistics.manifest.find(
      (row) => row.subsystem === "site power cabling"
    );

    expect(farEvaluation.spatial.cableMassKg).toBeGreaterThan(
      nearEvaluation.spatial.cableMassKg
    );
    expect(farEvaluation.spatial.cableLossW).toBeGreaterThan(
      nearEvaluation.spatial.cableLossW
    );
    expect(cableManifest?.massKg).toBeCloseTo(
      farEvaluation.spatial.cableMassKg,
      8
    );
    expect(farEvaluation.achievedResult.energy.gridPowerW).toBeGreaterThan(
      farEvaluation.baseResult.energy.gridPowerW
    );
  });

  test("applies granular haul distance while leaving product routes measured-only", () => {
    const design = clone(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
    design.assets.find((asset) =>
      asset.kind === "equatorial.hauler"
    )!.transform.xM = -75;
    const evaluation = evaluateSiteDesign(design);
    const haul = evaluation.connectionEvaluations.find((connection) =>
      connection.connectionId === "eq-reactor-feed"
    );
    const product = evaluation.connectionEvaluations.find((connection) =>
      connection.connectionId === "eq-oxygen-storage"
    );

    expect(haul).toMatchObject({
      modelStatus: "granular-haul",
      cableMassKg: 0,
      powerLossW: 0
    });
    expect(haul!.transportPowerW).toBeGreaterThan(0);
    expect(product).toMatchObject({
      modelStatus: "measured-only",
      transportPowerW: 0,
      equation: null
    });
    expect(evaluation.spatial.transportPowerW).toBeGreaterThan(0);

    const measuredOnlyMove = clone(SEEDED_SITE_DESIGN_FIXTURES.equatorial);
    const baseline = evaluateSiteDesign(measuredOnlyMove);
    const storage = measuredOnlyMove.assets.find((asset) =>
      asset.kind === "equatorial.cryo-farm"
    )!;
    storage.transform.xM = 50;
    storage.transform.zM = 40;
    const moved = evaluateSiteDesign(measuredOnlyMove);
    expect(moved.topologyValid).toBe(true);
    expect(moved.spatial).toEqual(baseline.spatial);
  });
});
