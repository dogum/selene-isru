import type { SimParams } from "@selene-isru/engine";
import { useSize } from "../../lib/hooks";
import { formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";

const OXIDES: Array<{ key: keyof SimParams; oxide: string; color: string }> = [
  { key: "oxideSiO2", oxide: "SiO2", color: "var(--regolith)" },
  { key: "oxideTiO2", oxide: "TiO2", color: "var(--earthshine)" },
  { key: "oxideAl2O3", oxide: "Al2O3", color: "var(--fission)" },
  { key: "oxideFeO", oxide: "FeO", color: "var(--melt)" },
  { key: "oxideMgO", oxide: "MgO", color: "var(--ok)" },
  { key: "oxideCaO", oxide: "CaO", color: "var(--cryo)" }
];

export function AssayChart(): React.JSX.Element {
  const params = useStore((s) => s.params);
  const result = useStore((s) => s.result);
  const [ref, size] = useSize<HTMLDivElement>();
  const width = Math.max(280, size.width);
  const barH = 30;
  const fractions = OXIDES.map((oxide) => ({
    ...oxide,
    fraction: Number(params[oxide.key]) || 0,
    yield: result.electrolysis.oxideYield.find((y) => y.oxide === oxide.oxide)
  }));
  const total = Math.max(1e-9, fractions.reduce((sum, oxide) => sum + oxide.fraction, 0));
  let x = 0;

  return (
    <div className="panel-section assay-section" ref={ref}>
      <div className="panel-header">
        REGOLITH ASSAY
        <span className="num">X_O2 {formatQtyText(result.electrolysis.xO2Effective, "kg/kg", 4)}</span>
      </div>
      <div className="chart-well assay-well">
        <svg width={width} height={barH + 24} role="img" aria-label="Oxide mass fraction stacked bar">
          {fractions.map((oxide) => {
            const w = (oxide.fraction / total) * width;
            const rect = (
              <rect key={oxide.oxide} x={x} y={8} width={Math.max(1, w - 1)} height={barH} fill={oxide.color}>
                <title>{`${oxide.oxide}: ${(oxide.fraction * 100).toFixed(1)}%`}</title>
              </rect>
            );
            x += w;
            return rect;
          })}
        </svg>
        <div className="assay-grid mono">
          {fractions.map((oxide) => (
            <div className="assay-row" key={oxide.oxide}>
              <span>
                <i style={{ background: oxide.color }} />
                {oxide.oxide}
              </span>
              <span className="num">{(oxide.fraction * 100).toFixed(1)}%</span>
              <span className={oxide.yield?.decomposed ? "good" : "muted"}>
                {oxide.yield?.decomposed ? "YIELD" : "LOCKED"}
              </span>
              <span className="num">{formatQtyText(oxide.yield?.o2KgPerKg ?? 0, "kg/kg", 3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
