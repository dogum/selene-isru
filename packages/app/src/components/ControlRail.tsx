import { useMemo, useRef, useState } from "react";
import type { SimParams, Warning } from "@selene-isru/engine";
import {
  groupsForSite,
  isChangedFromDefault,
  isModeChanged,
  matchesModeQuery,
  matchesParamQuery,
  railModeParamsForGroup,
  railParamsForGroup,
  WARNING_PARAM,
  type GroupDef,
  type NumericParamDef
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
  const params = useStore((s) => s.params);
  const result = useStore((s) => s.result);
  const [open, setOpen] = useState<Set<string>>(() => new Set(["mission"]));
  const [query, setQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);

  const { site, oxideModel, storageStream, cryoControlMode, polarProfileMode } = params;
  // Engine-reported streams, joined so the memo only reruns when the set changes.
  const streamKey = result.cryo.inventories.map((inventory) => inventory.stream).sort().join(",");
  const groups = useMemo(() => {
    const visibility = { site, oxideModel, storageStream, cryoControlMode, polarProfileMode };
    const activeStreams = new Set(streamKey.split(",").filter(Boolean));
    return groupsForSite(site).map((group) => ({ group, defs: railParamsForGroup(group, visibility, activeStreams) }));
  }, [site, oxideModel, storageStream, cryoControlMode, polarProfileMode, streamKey]);
  const warned = useMemo(() => warnedParams(result.warnings), [result.warnings]);

  // A gated-off group's sliders cannot be shown, so they do not count either.
  const gatedOff = (group: GroupDef): boolean => group.gatedBy !== undefined && !params[group.gatedBy];
  const changedCount = groups.reduce(
    (count, { group, defs }) =>
      count +
      (gatedOff(group) ? [] : defs).filter((def) => isChangedFromDefault(params[def.key] as number, def.defaultValue)).length +
      railModeParamsForGroup(group, site).filter((key) => isModeChanged(params, key)).length,
    0
  );
  const filtering = query.trim().length > 0 || changedOnly;
  const shown = groups.map(({ group, defs }) => ({
    group,
    // A gated-off group (the Sabatier loop switched off) cannot show or use its
    // inputs, so a filter does not count them; its switch can still match.
    defs: filtering
      ? (gatedOff(group) ? [] : defs).filter((def) =>
          matchesParamQuery(def, group.label, query) &&
          (!changedOnly || isChangedFromDefault(params[def.key] as number, def.defaultValue))
        )
      : defs,
    // Selects and switches stay reachable through search and CHANGED too.
    modes: filtering
      ? railModeParamsForGroup(group, site).filter((key) =>
          matchesModeQuery(key, group.label, query) && (!changedOnly || isModeChanged(params, key))
        )
      : []
  }));
  const matchCount = shown.reduce((count, { defs, modes }) => count + defs.length + modes.length, 0);

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
      <div className="rail-search" role="search">
        <input
          type="search"
          value={query}
          placeholder="Search inputs"
          aria-label="Search inputs by name, code name, or unit"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query.length > 0) {
              // Clearing the search is this key's whole job here.
              event.stopPropagation();
              setQuery("");
            }
          }}
        />
        <button
          type="button"
          className={changedOnly ? "active" : ""}
          aria-pressed={changedOnly}
          title="Show only inputs changed from their defaults"
          onClick={() => setChangedOnly((value) => !value)}
        >
          CHANGED · {changedCount}
        </button>
      </div>
      {filtering && (
        <p className="rail-filter-status mono" role="status">
          {matchCount === 0
            ? changedOnly && query.trim().length === 0
              ? "Every input is at its default."
              : "No inputs match."
            : `${matchCount} input${matchCount === 1 ? "" : "s"} shown`}
        </p>
      )}
      {shown.map(({ group, defs, modes }) =>
        filtering && defs.length === 0 && modes.length === 0 ? null : (
          <RailGroup
            key={group.id}
            group={group}
            defs={defs}
            modes={filtering ? modes : null}
            open={filtering || open.has(group.id)}
            onToggle={() => toggle(group.id)}
            warned={warned}
          />
        )
      )}
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
  /** inputs to show, already filtered for configuration and search */
  defs: NumericParamDef[];
  /** selects and switches to show while filtering; null shows every control */
  modes: ReadonlyArray<keyof SimParams> | null;
  open: boolean;
  onToggle: () => void;
  warned: Map<string, WarnInfo>;
}

function RailGroup({ group, defs, modes, open, onToggle, warned }: RailGroupProps): React.JSX.Element {
  // A filter shows only the controls it counted.
  const showMode = (key: keyof SimParams): boolean => modes === null || modes.includes(key);
  const site = useStore((s) => s.params.site);
  const result = useStore((s) => s.result);
  const enableSabatier = useStore((s) => s.params.enableSabatier);
  const setParam = useStore((s) => s.setParam);
  const flyTo = useStore((s) => s.flyTo);

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
        {group.gatedBy !== undefined && showMode(group.gatedBy) && (
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
          {group.id === "cryo" && (showMode("storageStream") || showMode("cryoControlMode")) && (
            <StorageModeControls stream={showMode("storageStream")} heat={showMode("cryoControlMode")} />
          )}
          {group.id === "campaign" && showMode("deploymentManifest") && <CampaignModeControls />}
          {group.id === "power" && site === "polar" && showMode("polarProfileMode") && <PolarSiteProfileControls />}
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

function StorageModeControls({ stream: showStream, heat: showHeat }: { stream: boolean; heat: boolean }): React.JSX.Element {
  const stream = useStore((s) => s.params.storageStream);
  const mode = useStore((s) => s.params.cryoControlMode);
  const setParam = useStore((s) => s.setParam);

  return (
    <div className="rail-mode-grid">
      {showStream && <label>
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
      </label>}
      {showHeat && <label>
        <span>HEAT CONTROL</span>
        <select value={mode} onChange={(event) => setParam("cryoControlMode", event.target.value as typeof mode)}>
          <option value="zero-boiloff">ZERO BOIL-OFF</option>
          <option value="passive">PASSIVE LOSS</option>
          <option value="capacity-limited">CAPACITY LIMITED</option>
        </select>
      </label>}
    </div>
  );
}

function CampaignModeControls(): React.JSX.Element {
  const manifest = useStore((s) => s.params.deploymentManifest);
  const setParam = useStore((s) => s.setParam);

  return (
    <div className="rail-mode-grid">
      <label>
        <span>DEPLOYMENT LANDERS</span>
        <select value={manifest} onChange={(event) => setParam("deploymentManifest", event.target.value as typeof manifest)}>
          <option value="dedicated">DEDICATED (WHOLE LANDERS)</option>
          <option value="shared">SHARED (MASS SHARE)</option>
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
