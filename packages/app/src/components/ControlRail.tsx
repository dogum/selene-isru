import { useMemo, useRef, useState } from "react";
import type { Warning } from "@selene-isru/engine";
import {
  groupsForSite,
  paramsForGroup,
  WARNING_PARAM,
  type GroupDef
} from "../controls/manifest";
import { GROUP_CAMERA } from "../viewer/bindings";
import { formatQtyText } from "../lib/format";
import { canonicalProfileJson, parseSiteProfileText, SAMPLE_POLAR_PROFILE } from "../lib/siteProfile";
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
      <ParameterNameToggle />
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

function ParameterNameToggle(): React.JSX.Element {
  const mode = useStore((s) => s.ui.parameterNames);
  const setUi = useStore((s) => s.setUi);

  return (
    <div className="parameter-name-toggle" role="group" aria-label="Input name style">
      <span>INPUT NAMES</span>
      <button
        type="button"
        className={mode === "plain" ? "active" : ""}
        aria-pressed={mode === "plain"}
        onClick={() => setUi({ parameterNames: "plain" })}
      >
        PLAIN
      </button>
      <button
        type="button"
        className={mode === "code" ? "active" : ""}
        aria-pressed={mode === "code"}
        onClick={() => setUi({ parameterNames: "code" })}
      >
        CODE
      </button>
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
  const storageStream = useStore((s) => s.params.storageStream);
  const cryoControlMode = useStore((s) => s.params.cryoControlMode);
  const polarProfileMode = useStore((s) => s.params.polarProfileMode);
  const setParam = useStore((s) => s.setParam);
  const flyTo = useStore((s) => s.flyTo);

  const defs = useMemo(() => {
    const all = paramsForGroup(group.engineGroup);
    if (group.id === "power" && site === "polar" && polarProfileMode === "profile") {
      return all.filter((def) => def.key !== "polarIlluminationFraction" && def.key !== "polarLongestShadowHours");
    }
    if (group.id !== "cryo") {
      return all;
    }
    const customOnly = new Set(["rhoCryo", "customLatentHeatJPerKg", "Ttank", "secLiquefaction"]);
    return all.filter((def) => {
      if (customOnly.has(String(def.key)) && storageStream !== "custom") {
        return false;
      }
      return def.key !== "coolerCapacityW" || cryoControlMode === "capacity-limited";
    });
  }, [group.engineGroup, group.id, storageStream, cryoControlMode, site, polarProfileMode]);
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
          {group.id === "cryo" && <StorageModeControls />}
          {group.id === "power" && site === "polar" && <PolarSiteProfileControls />}
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

function StorageModeControls(): React.JSX.Element {
  const stream = useStore((s) => s.params.storageStream);
  const mode = useStore((s) => s.params.cryoControlMode);
  const setParam = useStore((s) => s.setParam);

  return (
    <div className="rail-mode-grid">
      <label>
        <span>STORED STREAM</span>
        <select value={stream} onChange={(event) => setParam("storageStream", event.target.value as typeof stream)}>
          <option value="auto">AUTO BY SITE</option>
          <option value="lox">LIQUID OXYGEN</option>
          <option value="water-ice">WATER ICE</option>
          <option value="liquid-water">LIQUID WATER</option>
          <option value="lh2">LIQUID HYDROGEN</option>
          <option value="lch4">LIQUID METHANE</option>
          <option value="co2-feed">CARBON DIOXIDE FEED</option>
          <option value="custom">CUSTOM CRYOGEN</option>
        </select>
      </label>
      <label>
        <span>HEAT CONTROL</span>
        <select value={mode} onChange={(event) => setParam("cryoControlMode", event.target.value as typeof mode)}>
          <option value="zero-boiloff">ZERO BOIL-OFF</option>
          <option value="passive">PASSIVE LOSS</option>
          <option value="capacity-limited">CAPACITY LIMITED</option>
        </select>
      </label>
    </div>
  );
}

function PolarSiteProfileControls(): React.JSX.Element {
  const mode = useStore((state) => state.params.polarProfileMode);
  const profile = useStore((state) => state.result.power.siteProfile);
  const setParam = useStore((state) => state.setParam);
  const input = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");

  const applyProfile = (payload: string, message: string): void => {
    setParam("polarProfileData", payload);
    setParam("polarProfileMode", "profile");
    setStatus(message);
  };

  const importFile = async (file: File): Promise<void> => {
    try {
      const parsed = parseSiteProfileText(await file.text(), file.name);
      applyProfile(canonicalProfileJson(parsed), `Loaded ${parsed.points.length} profile points`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile import failed");
    }
  };

  const downloadTemplate = (): void => {
    const blob = new Blob([JSON.stringify(SAMPLE_POLAR_PROFILE, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "selene-polar-site-profile.json";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="site-profile-control">
      <div className="site-profile-head"><span>POLAR SITE PROFILE</span><strong>{mode === "profile" ? "TIME-RESOLVED" : "SCALAR"}</strong></div>
      <div className="site-profile-actions">
        <button type="button" className={mode === "scalar" ? "active" : ""} onClick={() => setParam("polarProfileMode", "scalar")}>SCALAR</button>
        <button type="button" onClick={() => input.current?.click()}>IMPORT JSON / CSV</button>
        <button type="button" onClick={() => applyProfile(canonicalProfileJson(SAMPLE_POLAR_PROFILE), "Illustrative sample profile loaded")}>USE SAMPLE</button>
        <button type="button" onClick={downloadTemplate}>TEMPLATE</button>
      </div>
      <input ref={input} hidden type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file !== undefined) void importFile(file);
        event.currentTarget.value = "";
      }} />
      <dl>
        <div><dt>Name</dt><dd>{profile.name}</dd></div>
        <div><dt>Cycle / delivered</dt><dd>{formatQtyText(profile.cycleHours, "h")} · {(profile.averageDeliveredFraction * 100).toFixed(1)}%</dd></div>
        <div><dt>Longest receiver outage</dt><dd>{formatQtyText(profile.longestReceiverOutageHours, "h")}</dd></div>
        <div><dt>Surface range</dt><dd>{profile.minimumSurfaceTemperatureK.toFixed(0)}–{profile.maximumSurfaceTemperatureK.toFixed(0)} K</dd></div>
      </dl>
      {status.length > 0 && <small>{status}</small>}
    </div>
  );
}

export function ControlRail(): React.JSX.Element {
  return (
    <nav className="app-rail" aria-label="Parameter controls">
      <ControlGroups />
    </nav>
  );
}
