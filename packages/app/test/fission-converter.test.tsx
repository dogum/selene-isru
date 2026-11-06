// @vitest-environment jsdom
import { DEFAULTS, PARAM_META, simulate } from "@selene-isru/engine";
import type { SimParams } from "@selene-isru/engine";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { inputActivity } from "../src/analysis/activity";
import { GOALS, optimize } from "../src/analysis/brief";
import { appliesToCase, FRONTIER_PARAMS } from "../src/analysis/sweep";
import { ControlGroups } from "../src/components/ControlRail";
import { GROUPS, railModeParamsForGroup, railParamsForGroup } from "../src/controls/manifest";
import { evidenceForParam } from "../src/controls/evidence";
import { parseParams, serializeParams } from "../src/lib/url";
import { useStore } from "../src/state/store";

const power = GROUPS.find((item) => item.id === "power")!;
const brayton: SimParams = { ...DEFAULTS };
const stirling: SimParams = { ...DEFAULTS, fissionConverter: "stirling" };
const shown = (params: SimParams) => railParamsForGroup(power, params).map((def) => String(def.key));
const BRAYTON_KEYS = ["etaCompressor", "etaTurbine", "epsRecuperator", "fPressureLoss", "dTGasCoolerK", "etaAlternator", "kConversionKgPerKwe"];
const STIRLING_KEYS = ["fCarnotStirling", "kConversionStirlingKgPerKwe", "bStirlingScale"];

afterEach(() => {
  cleanup();
  act(() => useStore.getState().applyPatch({ ...DEFAULTS }));
});

describe("fission converter (v0.23)", () => {
  it("offers the converter at both sites, beside the polar illumination profile", () => {
    expect(railModeParamsForGroup(power, brayton)).toEqual(["fissionConverter", "fissionSiting"]);
    expect(railModeParamsForGroup(power, { ...brayton, site: "polar" })).toEqual(["polarProfileMode", "fissionConverter", "fissionSiting"]);
  });

  it("shows only the chosen converter's inputs, and the hidden ones are inert", () => {
    expect(shown(brayton)).toEqual(expect.arrayContaining(BRAYTON_KEYS));
    expect(shown(brayton)).not.toEqual(expect.arrayContaining(STIRLING_KEYS.slice(0, 1)));
    expect(shown(stirling)).toEqual(expect.arrayContaining(STIRLING_KEYS));
    for (const key of BRAYTON_KEYS) expect(shown(stirling)).not.toContain(key);
    // The shared reactor, shield, radiator, and temperatures stay with both.
    for (const key of ["Tsource", "Tsink", "kReactorKgPerKwt", "bFissionScale", "MshieldKg", "dSeparationKm", "kRadiatorKgPerM2"]) {
      expect(shown(stirling)).toContain(key);
      expect(shown(brayton)).toContain(key);
    }
    for (const key of STIRLING_KEYS) expect(inputActivity(brayton, key as keyof SimParams).activity).toBe("no-effect");
    for (const key of BRAYTON_KEYS) expect(inputActivity(stirling, key as keyof SimParams).activity).toBe("no-effect");
  });

  it("switches from the rail, with its evidence, and round-trips through a link", () => {
    render(<ControlGroups />);
    fireEvent.click(screen.getByRole("button", { name: /^\W*Power$/ }));
    const select = screen.getByRole("combobox", { name: /FISSION CONVERTER/ });
    fireEvent.change(select, { target: { value: "stirling" } });
    expect(useStore.getState().params.fissionConverter).toBe("stirling");
    expect(useStore.getState().result.power.nuclearMassKg).toBe(simulate(stirling).power.nuclearMassKg);
    expect(screen.getByText(/fixed fraction of Carnot with modular convertors/)).toBeTruthy();
    const meta = PARAM_META.fCarnotStirling;
    const evidence = evidenceForParam({ key: "fCarnotStirling", group: meta.group, source: meta.source, min: meta.min, max: meta.max, unit: meta.unit });
    expect(evidence.validity).toMatch(/Mason 2006's two Stirling converters/);
    expect(evidence.sourceUrl).toBe("https://ntrs.nasa.gov/citations/20060011236");
    expect(serializeParams(stirling)).toContain("fissionConverter=stirling");
    expect(parseParams("fissionConverter=stirling")).toEqual({ fissionConverter: "stirling" });
    expect(parseParams("fissionConverter=rankine")).toEqual({});
  });

  it("switches the reactor's siting, showing only the chosen siting's shield (v0.26)", () => {
    const buried: SimParams = { ...DEFAULTS, fissionSiting: "buried" };
    expect(shown(brayton)).toEqual(expect.arrayContaining(["MshieldKg", "nShieldDistance", "dSeparationKm"]));
    expect(shown(brayton)).not.toContain("MshieldBuriedKg");
    expect(shown(buried)).toEqual(expect.arrayContaining(["MshieldBuriedKg", "dSeparationKm", "nShield"]));
    for (const key of ["MshieldKg", "nShieldDistance"]) expect(shown(buried)).not.toContain(key);
    expect(inputActivity(brayton, "MshieldBuriedKg").activity).toBe("no-effect");
    for (const key of ["MshieldKg", "nShieldDistance"] as const) expect(inputActivity(buried, key).activity).toBe("no-effect");
    render(<ControlGroups />);
    fireEvent.click(screen.getByRole("button", { name: /^\W*Power$/ }));
    fireEvent.change(screen.getByRole("combobox", { name: /REACTOR SITING/ }), { target: { value: "buried" } });
    expect(useStore.getState().params.fissionSiting).toBe("buried");
    expect(useStore.getState().result.power.shieldMassKg).toBe(simulate(buried).power.shieldMassKg);
    expect(screen.getByText(/Regolith shields the outpost/)).toBeTruthy();
    expect(serializeParams(buried)).toContain("fissionSiting=buried");
    expect(parseParams("fissionSiting=buried")).toEqual({ fissionSiting: "buried" });
    expect(parseParams("fissionSiting=underground")).toEqual({});
  });

  it("points the analysis tools' conversion-mass lever at the chosen converter", () => {
    // The frontier (and the uncertainty panel, through the same filter) offers
    // only the conversion mass the case's converter reads.
    const axes = (params: SimParams) => FRONTIER_PARAMS.filter((param) => appliesToCase(param, params)).map((param) => param.key);
    expect(axes(brayton)).toContain("kConversionKgPerKwe");
    expect(axes(brayton)).not.toContain("kConversionStirlingKgPerKwe");
    expect(axes(stirling)).toContain("kConversionStirlingKgPerKwe");
    expect(axes(stirling)).not.toContain("kConversionKgPerKwe");
    // The Brief varies the Stirling coefficient on a Stirling case.
    const { all: candidates } = optimize(stirling, GOALS[0]!.constraints);
    const levels = new Set(candidates.map((candidate) => candidate.params.kConversionStirlingKgPerKwe));
    expect(levels.size).toBeGreaterThan(1);
    expect(new Set(candidates.map((candidate) => candidate.params.kConversionKgPerKwe))).toEqual(new Set([DEFAULTS.kConversionKgPerKwe]));
  });
});
