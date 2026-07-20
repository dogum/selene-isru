import { describe, expect, it } from "vitest";
import { formatQty, formatQtyText } from "../src/lib/format";

describe("formatQty", () => {
  it("auto-prefixes power", () => {
    expect(formatQty(950, "W")).toEqual({ value: "950", unit: "W" });
    expect(formatQty(1_030_000, "W")).toEqual({ value: "1.03", unit: "MW" });
    expect(formatQty(24_000, "W").unit).toBe("KW");
    expect(formatQty(3.2e9, "W").unit).toBe("GW");
  });

  it("auto-converts mass to tonnes at 10 t", () => {
    expect(formatQty(9_000, "kg")).toEqual({ value: "9,000", unit: "KG" });
    expect(formatQty(105_000, "kg")).toEqual({ value: "105", unit: "T" });
    expect(formatQty(20_000, "kg/day").unit).toBe("T/DAY");
  });

  it("keeps engineering units uppercase and tabular-safe", () => {
    expect(formatQty(24.68, "kWh/kg", 4)).toEqual({ value: "24.68", unit: "KWH/KG" });
  });

  it("handles zero, negatives and non-finite values", () => {
    expect(formatQty(0, "W").value).toBe("0");
    expect(formatQty(-1500, "W")).toEqual({ value: "-1.5", unit: "KW" });
    expect(formatQty(Number.NaN, "kg").value).toBe("—");
  });

  it("falls back to exponent form at extremes", () => {
    expect(formatQty(5e-10, "m^2/s").value).toContain("e");
  });

  it("joins value and unit with a thin space", () => {
    expect(formatQtyText(1030, "W")).toBe("1.03 KW");
  });
});
