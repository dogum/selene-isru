import {
  siteAssetDefinition,
  siteAssetsForEnvironment
} from "@selene-isru/engine";
import type {
  PlannerDocumentState,
  SiteAssetDefinition,
  SiteDesignFindingSeverity
} from "@selene-isru/engine";
import { useEffect, useMemo } from "react";
import { isKindAvailable } from "../../site-design/editor";
import { useStore } from "../../state/store";

const CATEGORY_ORDER = [
  "Excavation",
  "Processing",
  "Power",
  "Storage",
  "Construction",
  "Logistics",
  "Outpost"
] as const;

function groupedCatalog(
  definitions: SiteAssetDefinition[]
): Array<[string, SiteAssetDefinition[]]> {
  const groups = new Map<string, SiteAssetDefinition[]>();
  for (const definition of definitions) {
    const group = groups.get(definition.category) ?? [];
    group.push(definition);
    groups.set(definition.category, group);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ai = CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]);
    const bi = CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]);
    return (ai < 0 ? CATEGORY_ORDER.length : ai) -
      (bi < 0 ? CATEGORY_ORDER.length : bi);
  });
}

function severityCount(
  findings: Array<{ severity: SiteDesignFindingSeverity }>,
  severity: SiteDesignFindingSeverity
): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

export function CustomSiteWorkspace(): React.JSX.Element {
  const customSite = useStore((state) => state.customSite);
  const setCustomEnvironment = useStore((state) => state.setCustomEnvironment);
  const setCustomDesignName = useStore((state) => state.setCustomDesignName);
  const resetCustomDesign = useStore((state) => state.resetCustomDesign);
  const beginCustomPlacement = useStore((state) => state.beginCustomPlacement);
  const cancelCustomPlacement = useStore((state) => state.cancelCustomPlacement);
  const selectCustomAsset = useStore((state) => state.selectCustomAsset);
  const updateCustomAsset = useStore((state) => state.updateCustomAsset);
  const rotateCustomAsset = useStore((state) => state.rotateCustomAsset);
  const duplicateCustomAsset = useStore((state) => state.duplicateCustomAsset);
  const deleteCustomAsset = useStore((state) => state.deleteCustomAsset);
  const setCustomPlannerSnaps = useStore((state) => state.setCustomPlannerSnaps);
  const undoCustomEdit = useStore((state) => state.undoCustomEdit);
  const redoCustomEdit = useStore((state) => state.redoCustomEdit);
  const flyTo = useStore((state) => state.flyTo);
  const { design, findings, editor, history } = customSite;
  const groups = useMemo(
    () => groupedCatalog(siteAssetsForEnvironment(design.environment)),
    [design.environment]
  );
  const selectedAsset = editor.selectedAssetId === null
    ? null
    : design.assets.find((asset) => asset.id === editor.selectedAssetId) ?? null;
  const selectedDefinition = selectedAsset === null
    ? null
    : siteAssetDefinition(selectedAsset.kind);
  const selectedFindings = selectedAsset === null
    ? []
    : findings.filter((finding) => finding.entityIds.includes(selectedAsset.id));
  const errorCount = severityCount(findings, "error");
  const cautionCount = severityCount(findings, "caution");
  const infoCount = severityCount(findings, "info");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (editor.tool === "place") {
          cancelCustomPlacement();
        } else {
          selectCustomAsset(null);
        }
        return;
      }
      if (isTextInput(event.target)) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoCustomEdit();
        } else {
          undoCustomEdit();
        }
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        editor.selectedAssetId !== null
      ) {
        event.preventDefault();
        deleteCustomAsset(editor.selectedAssetId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cancelCustomPlacement,
    deleteCustomAsset,
    editor.selectedAssetId,
    editor.tool,
    redoCustomEdit,
    selectCustomAsset,
    undoCustomEdit
  ]);

  const commitNumber = (
    assetId: string,
    key: "xM" | "zM" | "headingDeg",
    value: string
  ): void => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      updateCustomAsset(assetId, { [key]: parsed });
    }
  };

  return (
    <div className="custom-site-workspace">
      <aside className="custom-catalog" aria-label="Site equipment catalog">
        <div className="custom-panel-header">
          <p className="custom-eyebrow">EQUIPMENT CATALOG</p>
          <strong>{design.environment.toUpperCase()} SYSTEMS</strong>
          <span>{groups.reduce((sum, [, items]) => sum + items.length, 0)} available types</span>
        </div>

        <div className="custom-catalog-scroll">
          {groups.map(([category, definitions]) => (
            <section className="custom-catalog-group" key={category}>
              <h2>{category}</h2>
              {definitions.map((definition) => {
                const available = isKindAvailable(design, definition.kind);
                const active = editor.placementKind === definition.kind;
                return (
                  <article
                    className={`custom-catalog-card${active ? " active" : ""}`}
                    key={definition.kind}
                  >
                    <div>
                      <strong>{definition.label}</strong>
                      <span>{definition.footprint.widthM} × {definition.footprint.depthM} m</span>
                    </div>
                    <p>{definition.purpose}</p>
                    <footer>
                      <span>{definition.modelMaturity}</span>
                      <span>{definition.ports.length} PORT{definition.ports.length === 1 ? "" : "S"}</span>
                    </footer>
                    <button
                      className="custom-place-button"
                      disabled={!available}
                      aria-pressed={active}
                      onClick={() => active
                        ? cancelCustomPlacement()
                        : beginCustomPlacement(definition.kind)}
                    >
                      {!available ? "PLACED · SINGLE" : active ? "CANCEL PLACEMENT" : "PLACE"}
                    </button>
                  </article>
                );
              })}
            </section>
          ))}
        </div>

        <div className="custom-panel-note">
          CLICK PLACE, THEN CHOOSE A VALID FOOTPRINT · ESC CANCELS
        </div>
      </aside>

      {design.assets.length === 0 ? (
        <section className="custom-empty-state" aria-label="Blank site planning surface">
          <span className="custom-crosshair" aria-hidden="true" />
          <p className="custom-eyebrow">BLANK {design.environment.toUpperCase()} TERRAIN</p>
          <h1>Build the site from first principles.</h1>
          <p>
            Choose equipment from the catalog, preview its grounded footprint,
            then click a valid location to start composing the site.
          </p>
          <div className="custom-empty-stats" aria-label="Current site counts">
            <span><strong>0</strong> ASSETS</span>
            <span><strong>{design.connections.length}</strong> CONNECTIONS</span>
            <span><strong>{errorCount}</strong> OPEN PROCESS STEPS</span>
          </div>
        </section>
      ) : (
        <section className="custom-planner-toolbar" aria-label="Site planner tools">
          <div>
            <button disabled={history.past.length === 0} onClick={undoCustomEdit}>UNDO</button>
            <button disabled={history.future.length === 0} onClick={redoCustomEdit}>REDO</button>
          </div>
          <span>
            {editor.tool === "place"
              ? "PLACEMENT ACTIVE · CLICK TERRAIN · ESC CANCEL"
              : "CLICK TO SELECT · DRAG TO MOVE"}
          </span>
          <strong>{design.assets.length} ASSET{design.assets.length === 1 ? "" : "S"}</strong>
        </section>
      )}

      <aside className="custom-inspector" aria-label="Custom site inspector">
        <div className="custom-panel-header">
          <p className="custom-eyebrow">{selectedAsset === null ? "SITE INSPECTOR" : "ASSET INSPECTOR"}</p>
          <strong>{selectedAsset?.name ?? "WORKING DESIGN"}</strong>
          <span>Saved locally as you edit</span>
        </div>

        <div className="custom-inspector-scroll">
          {selectedAsset !== null && selectedDefinition !== null ? (
            <>
              <button className="custom-back-button" onClick={() => selectCustomAsset(null)}>
                ← SITE SETTINGS
              </button>
              <label className="custom-field">
                <span>ASSET NAME</span>
                <input
                  key={`${selectedAsset.id}-name-${selectedAsset.name}`}
                  defaultValue={selectedAsset.name}
                  maxLength={120}
                  onBlur={(event) =>
                    updateCustomAsset(selectedAsset.id, { name: event.target.value })}
                />
              </label>
              <div className="custom-asset-summary">
                <strong>{selectedDefinition.label}</strong>
                <span>{selectedDefinition.category} · {selectedDefinition.modelMaturity}</span>
                <p>{selectedDefinition.purpose}</p>
              </div>
              <div className="custom-transform-grid">
                {(["xM", "zM", "headingDeg"] as const).map((key) => (
                  <label className="custom-field" key={key}>
                    <span>{key === "xM" ? "X (M)" : key === "zM" ? "Z (M)" : "HEADING (°)"}</span>
                    <input
                      key={`${selectedAsset.id}-${key}-${selectedAsset.transform[key]}`}
                      type="number"
                      defaultValue={selectedAsset.transform[key]}
                      onBlur={(event) =>
                        commitNumber(selectedAsset.id, key, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="custom-rotation-actions">
                <button onClick={() =>
                  rotateCustomAsset(selectedAsset.id, -design.planner.rotationSnapDeg)}>
                  ↺ {design.planner.rotationSnapDeg}°
                </button>
                <button onClick={() =>
                  rotateCustomAsset(selectedAsset.id, design.planner.rotationSnapDeg)}>
                  ↻ {design.planner.rotationSnapDeg}°
                </button>
              </div>
              <dl className="custom-document-meta">
                <div>
                  <dt>Footprint</dt>
                  <dd>{selectedDefinition.footprint.widthM} × {selectedDefinition.footprint.depthM} m</dd>
                </div>
                <div>
                  <dt>Clearance</dt>
                  <dd>{selectedDefinition.footprint.clearanceM ?? 0} m</dd>
                </div>
                <div><dt>Ports</dt><dd>{selectedDefinition.ports.length}</dd></div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedAsset.enabled ? "ENABLED" : "DISABLED"}</dd>
                </div>
              </dl>
              <div className="custom-asset-actions">
                <button onClick={() => flyTo(selectedAsset.id)}>FOCUS</button>
                <button
                  disabled={selectedDefinition.multiplicity === "single"}
                  onClick={() => duplicateCustomAsset(selectedAsset.id)}
                >
                  DUPLICATE
                </button>
                <button onClick={() =>
                  updateCustomAsset(selectedAsset.id, { enabled: !selectedAsset.enabled })}>
                  {selectedAsset.enabled ? "DISABLE" : "ENABLE"}
                </button>
                <button className="danger" onClick={() => deleteCustomAsset(selectedAsset.id)}>
                  DELETE
                </button>
              </div>
              {selectedFindings.length > 0 && (
                <ol className="custom-findings custom-selected-findings">
                  {selectedFindings.map((finding) => (
                    <li className={`finding-${finding.severity}`} key={finding.id}>
                      <span>{finding.severity.toUpperCase()}</span>
                      <p>{finding.message}</p>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
              <label className="custom-field">
                <span>DESIGN NAME</span>
                <input
                  value={design.name}
                  maxLength={120}
                  onChange={(event) => setCustomDesignName(event.target.value)}
                />
              </label>

              <fieldset className="custom-fieldset">
                <legend>ENVIRONMENT</legend>
                <div className="custom-segmented">
                  <button
                    className={design.environment === "equatorial" ? "active" : ""}
                    aria-pressed={design.environment === "equatorial"}
                    disabled={design.assets.length > 0}
                    onClick={() => setCustomEnvironment("equatorial")}
                  >
                    EQUATORIAL
                  </button>
                  <button
                    className={design.environment === "polar" ? "active polar" : ""}
                    aria-pressed={design.environment === "polar"}
                    disabled={design.assets.length > 0}
                    onClick={() => setCustomEnvironment("polar")}
                  >
                    POLAR
                  </button>
                </div>
                {design.assets.length > 0 && (
                  <p className="custom-field-hint">Reset the design to change environments.</p>
                )}
              </fieldset>

              <fieldset className="custom-fieldset">
                <legend>SNAPPING</legend>
                <div className="custom-snap-grid">
                  <label className="custom-field">
                    <span>GRID</span>
                    <select
                      value={design.planner.gridSnapM}
                      onChange={(event) => setCustomPlannerSnaps({
                        gridSnapM: Number(event.target.value) as PlannerDocumentState["gridSnapM"]
                      })}
                    >
                      {[0, 1, 5, 10].map((value) => (
                        <option value={value} key={value}>{value === 0 ? "OFF" : `${value} m`}</option>
                      ))}
                    </select>
                  </label>
                  <label className="custom-field">
                    <span>ROTATION</span>
                    <select
                      value={design.planner.rotationSnapDeg}
                      onChange={(event) => setCustomPlannerSnaps({
                        rotationSnapDeg: Number(event.target.value) as PlannerDocumentState["rotationSnapDeg"]
                      })}
                    >
                      {[0, 5, 15, 45, 90].map((value) => (
                        <option value={value} key={value}>{value === 0 ? "OFF" : `${value}°`}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>

              <dl className="custom-document-meta">
                <div><dt>Document</dt><dd>{design.schema}</dd></div>
                <div><dt>Version</dt><dd>v{design.version}</dd></div>
                <div><dt>Assets</dt><dd>{design.assets.length}</dd></div>
                <div><dt>Connections</dt><dd>{design.connections.length}</dd></div>
              </dl>

              <section className="custom-validation">
                <div className="custom-validation-heading">
                  <div>
                    <p className="custom-eyebrow">DESIGN CHECK</p>
                    <h2>{errorCount === 0 ? "Ready to evaluate" : `${errorCount} open steps`}</h2>
                  </div>
                  <span className={errorCount === 0 ? "ok" : "error"}>
                    {errorCount === 0 ? "VALID" : "INCOMPLETE"}
                  </span>
                </div>
                <div className="custom-finding-counts">
                  <span>{errorCount} errors</span>
                  <span>{cautionCount} cautions</span>
                  <span>{infoCount} notes</span>
                </div>
                <ol className="custom-findings">
                  {findings.slice(0, 5).map((finding) => (
                    <li className={`finding-${finding.severity}`} key={finding.id}>
                      <span>{finding.severity.toUpperCase()}</span>
                      <p>{finding.message}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>

        {selectedAsset === null && (
          <button
            className="custom-reset"
            onClick={() => {
              if (design.assets.length === 0 || window.confirm("Reset this custom site to a blank design?")) {
                resetCustomDesign();
              }
            }}
          >
            RESET BLANK DESIGN
          </button>
        )}
      </aside>

      <div className="custom-statusbar" role="status">
        <span><i className="custom-status-dot" /> PLANNER EDITING ACTIVE</span>
        <span>CONNECTIONS AND CUSTOM OUTPUT EVALUATION ARRIVE IN THE NEXT MILESTONES</span>
      </div>
    </div>
  );
}
