import { DEFAULTS, sampleUncertainty, simulate, simulateTimeseries } from "@selene-isru/engine";
import { describe, expect, it } from "vitest";
import { GOALS, optimize } from "../src/analysis/brief";
import { toCsv } from "../src/analysis/csv";
import {
  bandsCsv,
  briefCandidatesCsv,
  flowsCsv,
  frontierCsv,
  manifestCsv,
  sensitivityCsv,
  timeseriesCsv
} from "../src/analysis/panelExports";
import { oneAtATimeSensitivity } from "../src/analysis/sensitivity";

const lines = (csv: string): string[][] => csv.split("\n").map((line) => line.split(","));

describe("CSV builder", () => {
  it("quotes only where needed and keeps full precision", () => {
    const csv = toCsv(
      [
        { header: "a", value: (row: { a: unknown }) => row.a as string },
        { header: "n", value: () => 0.1 + 0.2 }
      ],
      [{ a: 'x, "y"' }, { a: " lead" }, { a: null }]
    );
    expect(csv).toBe('a,n\n"x, ""y""",0.30000000000000004\n" lead",0.30000000000000004\n,0.30000000000000004');
  });
});

describe("panel exports carry the data behind each chart", () => {
  const result = simulate(DEFAULTS);

  it("energy flows sum to the SEC", () => {
    const [header, ...rows] = lines(flowsCsv(result));
    expect(header).toEqual(["from", "to", "energy [kWh/kg product]", "share of SEC [fraction]"]);
    expect(rows).toHaveLength(result.energy.flows.length);
    expect(rows.reduce((total, row) => total + Number(row[2]), 0)).toBeCloseTo(result.energy.secTotal_kWhPerKg, 9);
    expect(rows.reduce((total, row) => total + Number(row[3]), 0)).toBeCloseTo(1, 9);
  });

  it("manifest rows sum to the landed mass", () => {
    const [, ...rows] = lines(manifestCsv(result));
    expect(rows.reduce((total, row) => total + Number(row[1]), 0)).toBeCloseTo(result.logistics.totalInfraMassKg, 6);
  });

  it("timeseries keeps every point and the engine's unit-bearing field names", () => {
    const series = simulateTimeseries(DEFAULTS, { cycles: 1, samplesPerCycle: 96 });
    const [header, ...rows] = lines(timeseriesCsv(series));
    expect(header).toContain("tHours");
    expect(header).toContain("loadW");
    expect(rows).toHaveLength(series.points.length);
  });

  it("frontier points name the sweep inputs with units and the objectives by result path", () => {
    const csv = frontierCsv(
      [{ x: 1, y: 2, patch: { targetKgPerDay: 500, Vcell: 4 }, frontier: true, feasible: true, warningCount: 0 }],
      ["targetKgPerDay", "Vcell"],
      { x: "logistics.totalInfraMassKg", y: "energy.secTotal_kWhPerKg" }
    );
    expect(lines(csv)).toEqual([
      ["param.targetKgPerDay [kg/day]", "param.Vcell [V]", "logistics.totalInfraMassKg", "energy.secTotal_kWhPerKg", "withinActiveConstraints", "pareto", "warnings.count"],
      ["500", "4", "1", "2", "true", "true", "0"]
    ]);
  });

  it("sensitivity rows record the capped bounds actually simulated", () => {
    const rows = oneAtATimeSensitivity(DEFAULTS, [{ key: "etaCurrent", rel: 0.12 }], (r) => r.energy.secTotal_kWhPerKg);
    const [, row] = lines(sensitivityCsv(rows, "sec"));
    expect(row!.slice(0, 6)).toEqual(["etaCurrent", "1", "0.12", String(rows[0]!.lowInput), "0.99", "true"]);
  });

  it("labels sensitivity responses as percent change from base, which is what they are", () => {
    const rows = oneAtATimeSensitivity(DEFAULTS, [{ key: "targetKgPerDay", rel: 0.1 }], (r) => r.logistics.totalInfraMassKg);
    const [header, row] = lines(sensitivityCsv(rows, "mass"));
    expect(header!.slice(6, 8)).toEqual(["mass at low input [% change from base]", "mass at high input [% change from base]"]);
    // Less output needs less plant: a negative change, not a share of the base.
    expect(Number(row![6])).toBeLessThan(0);
    expect(Number(row![7])).toBeGreaterThan(0);
  });

  it("bands record their sample count, seed, and input spreads", () => {
    const spec = [{ key: "targetKgPerDay" as const, rel: 0.1 }];
    const bands = sampleUncertainty(DEFAULTS, spec, { n: 64, seed: 7 });
    const [header, ...rows] = lines(bandsCsv(bands, spec, 64, 7));
    expect(header!.slice(0, 5)).toEqual(["metric", "p10", "p50", "p90", "mean"]);
    expect(rows).toHaveLength(4);
    expect(rows[0]!.slice(-3)).toEqual(["64", "7", "targetKgPerDay±0.1"]);
  });

  it("brief exports every evaluated candidate in ranked order", () => {
    const optimization = optimize(DEFAULTS, GOALS[0]!.constraints);
    const [header, ...rows] = lines(briefCandidatesCsv(optimization.all));
    expect(rows).toHaveLength(optimization.evaluated);
    expect(rows.map((row) => Number(row[0]))).toEqual(rows.map((_, index) => index + 1));
    expect(header).toContain("param.reserveDays [day]");
    expect(header).toContain("logistics.totalInfraMassKg");
  });
});
