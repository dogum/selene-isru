import { useMemo, useState } from "react";
import type { Warning } from "@selene-isru/engine";
import {
  groupsForSite,
  paramsForGroup,
  WARNING_PARAM,
  type GroupDef
} from "../controls/manifest";
import { GROUP_CAMERA } from "../viewer/bindings";
import { formatQtyText } from "../lib/format";
import { useStore } from "../state/store";
import { ParamRow } from "./ParamRow";

interface WarnInfo {
  severity: "caution" | "alarm";
  limit: number;
}

function warnedParams(warnings: Warning[]): Map<string, WarnInfo> {
  const map = new Map<string, WarnInfo>();
  for (const w of warnings) {
    const key = WARNING_PARAM[w.id];
    if (key === undefined || w.severity === "info") {
      continue;
    }
    const existing = map.get(key);
    if (existing === undefined || (existing.severity === "caution" && w.severity === "alarm")) {
      map.set(key, { severity: w.severity, limit: w.limit });
    }
  }
  return map;
}

interface ControlGroupsProps {
  /** mobile: one group open at a time */
  exclusive?: boolean;
}

export function ControlGroups({ exclusive = false }: ControlGroupsProps): React.JSX.Element {
  const site = useStore((s) => s.params.site);
  const result = useStore((s) => s.result);
  const [open, setOpen] = useState<Set<string>>(() => new Set(["mission"]));

  const groups = groupsForSite(site);
  const warned = useMemo(() => warnedParams(result.warnings), [result.warnings]);

  const toggle = (id: string): void => {
    setOpen((prev) => {
      const next = new Set(exclusive ? [] : prev);
      if (prev.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="rail-groups">
      {groups.map((g) => (
        <RailGroup
          key={g.id}
          group={g}
          open={open.has(g.id)}
          onToggle={() => toggle(g.id)}
          warned={warned}
        />
      ))}
    </div>
  );
}

interface RailGroupProps {
  group: GroupDef;
  open: boolean;
  onToggle: () => void;
  warned: Map<string, WarnInfo>;
}

function RailGroup({ group, open, onToggle, warned }: RailGroupProps): React.JSX.Element {
  const site = useStore((s) => s.params.site);
  const result = useStore((s) => s.result);
  const enableSabatier = useStore((s) => s.params.enableSabatier);
  const setParam = useStore((s) => s.setParam);
  const flyTo = useStore((s) => s.flyTo);

  const defs = useMemo(() => paramsForGroup(group.engineGroup), [group.engineGroup]);
  const readout = group.readout(result);
  const gatedOff = group.gatedBy !== undefined && !enableSabatier;
  const cameraKey = GROUP_CAMERA[site][group.id];

  return (
    <section className={`rail-group ${open ? "open" : ""}`}>
      <div className="rail-group-header">
        <button className="rail-group-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="rail-group-caret">{open ? "▾" : "▸"}</span>
          <span className="rail-group-label">{group.label}</span>
        </button>
        <span className="rail-group-readout num">
          {formatQtyText(readout.value, readout.unit)}
        </span>
        {group.gatedBy !== undefined && (
          <button
            className={`rail-gate ${enableSabatier ? "on" : ""}`}
            role="switch"
            aria-checked={enableSabatier}
            aria-label="Enable Sabatier loop"
            onClick={() => setParam("enableSabatier", !enableSabatier)}
          >
            <span className="rail-gate-knob" />
          </button>
        )}
        {cameraKey !== undefined && (
          <button
            className="rail-fly"
            title={`Fly camera to ${group.label}`}
            aria-label={`Fly camera to ${group.label}`}
            onClick={() => flyTo(cameraKey)}
          >
            ⌖
          </button>
        )}
      </div>
      {open && !gatedOff && (
        <div className="rail-group-body">
          {defs.map((def) => {
            const w = warned.get(def.key);
            return (
              <ParamRow key={def.key} def={def} warnSeverity={w?.severity} warnLimit={w?.limit} />
            );
          })}
        </div>
      )}
      {open && gatedOff && (
        <div className="rail-group-body rail-group-gated mono">
          SABATIER LOOP OFFLINE — toggle to enable CH₄ production
        </div>
      )}
    </section>
  );
}

export function ControlRail(): React.JSX.Element {
  return (
    <nav className="app-rail" aria-label="Parameter controls">
      <ControlGroups />
    </nav>
  );
}
