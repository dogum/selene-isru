import { useState } from "react";
import type { Warning } from "@selene-isru/engine";
import { WARNING_ASSET } from "../controls/manifest";
import { formatQtyText } from "../lib/format";
import { useStore } from "../state/store";

const MAX_VISIBLE = 4;

/**
 * §6 — warnings dock. Severity bar, message, module tag, value vs limit.
 * Known ids fly the camera + pulse the asset; unknown ids (and pad-shear /
 * beta-le-alpha today) render generically with no camera action.
 */
export function WarningsDock({ asSheetSection = false }: { asSheetSection?: boolean }): React.JSX.Element | null {
  const warnings = useStore((s) => s.result.warnings);
  const dockOpen = useStore((s) => s.ui.dockOpen);
  const [expanded, setExpanded] = useState(false);

  if (!dockOpen && !asSheetSection) {
    return null;
  }

  const real = warnings.filter((w) => w.id !== "param-clamped");
  const clamped = warnings.length - real.length;
  const ordered = [...real].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  );
  const visible = expanded ? ordered : ordered.slice(0, MAX_VISIBLE);
  const hidden = ordered.length - visible.length;

  if (ordered.length === 0 && clamped === 0) {
    return (
      <div className={asSheetSection ? "dock dock-sheet" : "dock"}>
        <div className="dock-empty mono">ALL CONSTRAINTS NOMINAL</div>
      </div>
    );
  }

  return (
    <div className={asSheetSection ? "dock dock-sheet" : "dock"} role="log" aria-label="Engineering warnings">
      {visible.map((w, i) => (
        <DockItem key={`${w.id}-${i}`} warning={w} />
      ))}
      {hidden > 0 && (
        <button className="dock-more mono" onClick={() => setExpanded(true)}>
          +{hidden} MORE
        </button>
      )}
      {clamped > 0 && (
        <div className="dock-item info">
          <div className="dock-msg">
            {clamped} input{clamped > 1 ? "s" : ""} clamped to engine bounds
          </div>
          <span className="dock-module mono">PARAMS</span>
        </div>
      )}
    </div>
  );
}

function severityRank(s: Warning["severity"]): number {
  return s === "alarm" ? 2 : s === "caution" ? 1 : 0;
}

function DockItem({ warning }: { warning: Warning }): React.JSX.Element {
  const pulseAsset = useStore((s) => s.pulseAsset);
  const asset = WARNING_ASSET[warning.id];
  const interactive = asset !== undefined;

  const body = (
    <>
      <div className="dock-msg">{warning.message}</div>
      <div className="dock-meta">
        <span className="dock-module mono">{warning.module.toUpperCase()}</span>
        <span className="dock-vals mono num">
          {formatQtyText(warning.value, "")} vs {formatQtyText(warning.limit, "")}
        </span>
      </div>
    </>
  );

  if (!interactive) {
    return <div className={`dock-item ${warning.severity}`}>{body}</div>;
  }
  return (
    <button
      className={`dock-item interactive ${warning.severity}`}
      onClick={() => pulseAsset(asset, warning.severity)}
      title="Fly camera to the implicated asset"
    >
      {body}
    </button>
  );
}
