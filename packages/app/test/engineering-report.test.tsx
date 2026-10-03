// @vitest-environment jsdom
import { DEFAULTS } from "@selene-isru/engine";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { EngineeringReport } from "../src/components/panels/EngineeringReport";
import { formatQtyText } from "../src/lib/format";
import { useStore } from "../src/state/store";

describe("engineering report storage audit", () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  });

  afterEach(() => {
    cleanup();
    act(() => useStore.getState().applyPatch({ ...DEFAULTS }));
  });

  it("lists liquefier hardware so the rows add up to the landed cryo block", () => {
    act(() => useStore.getState().applyPatch({ site: "polar", polarProduct: "propellant" }));
    render(<EngineeringReport />);
    const { result } = useStore.getState();
    const cryoBlock = result.logistics.manifest.find((row) => row.subsystem === "cryo block")!.massKg;
    const rows = result.cryo.inventories.reduce((total, item) => total + item.storageMassKg + item.liquefierMassKg, 0);
    expect(rows).toBeCloseTo(cryoBlock, 6);
    expect(screen.getByText("Liquefier mass")).toBeTruthy();
    const lh2 = result.cryo.inventories.find((item) => item.stream === "lh2")!;
    expect(lh2.liquefierMassKg).toBeGreaterThan(20_000);
    const lh2Row = screen.getAllByText("lh2").map((cell) => cell.closest("tr")!).find((row) => row.closest("tbody"))!;
    expect(lh2Row.textContent).toContain(formatQtyText(lh2.liquefierMassKg, "kg"));
    expect(screen.getByText("Cryo block landed (storage + liquefiers)").closest("tr")!.textContent).toContain(formatQtyText(cryoBlock, "kg"));
  });
});
