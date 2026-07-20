export interface FormattedQty {
  /** numeric portion, tabular-ready, e.g. "24.7" or "1 030" */
  value: string;
  /** display unit, uppercase mono, e.g. "KWH/KG" */
  unit: string;
}

const THIN_SPACE = " ";

function formatNumber(value: number, sig: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value === 0) {
    return "0";
  }
  const abs = Math.abs(value);
  if (abs >= 1e7 || abs < 1e-4) {
    return value.toExponential(Math.max(0, sig - 1)).replace("e+", "e");
  }
  const digits = Math.max(sig, Math.floor(Math.log10(abs)) + 1);
  const rounded = Number(value.toPrecision(digits));
  return rounded.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    useGrouping: true
  });
}

/**
 * Single formatting authority for every numeric display (§8.7).
 * SI auto-prefixes power (W→kW→MW→GW) and mass (kg→t); all other units pass
 * through uppercased. `sig` is significant digits (default 3).
 */
export function formatQty(value: number, unit: string, sig = 3): FormattedQty {
  let v = value;
  let u = unit;

  if (unit === "W" && Number.isFinite(value)) {
    const abs = Math.abs(value);
    if (abs >= 1e9) {
      v = value / 1e9;
      u = "GW";
    } else if (abs >= 1e6) {
      v = value / 1e6;
      u = "MW";
    } else if (abs >= 1e3) {
      v = value / 1e3;
      u = "kW";
    }
  } else if ((unit === "kg" || unit === "kg/day" || unit === "kg/yr") && Number.isFinite(value)) {
    if (Math.abs(value) >= 1e4) {
      v = value / 1e3;
      u = unit.replace("kg", "t");
    }
  }

  return { value: formatNumber(v, sig), unit: u.toUpperCase() };
}

/** Inline single-string form: `24.7␣KWH/KG` with a thin space. */
export function formatQtyText(value: number, unit: string, sig = 3): string {
  const q = formatQty(value, unit, sig);
  return q.unit.length > 0 ? `${q.value}${THIN_SPACE}${q.unit}` : q.value;
}

/** Compact value for editable inputs — full precision, no grouping. */
export function formatInputValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-4)) {
    return value.toExponential(4).replace(/\.?0+e/, "e").replace("e+", "e");
  }
  return String(Number(value.toPrecision(8)));
}
