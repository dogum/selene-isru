import {
  siteAssetDefinition,
  siteAssetsForEnvironment,
  siteConnectionLengthM,
  siteConnectionRoutePoints,
  serializeSiteDesign
} from "@selene-isru/engine";
import type {
  PlannerDocumentState,
  SiteAssetDefinition,
  SiteDesignFinding,
  SiteDesignFindingSeverity
} from "@selene-isru/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadText } from "../../analysis/studyExport";
import { formatQtyText } from "../../lib/format";
import { useIsMobile } from "../../lib/hooks";
import {
  previewCustomSiteImport,
  type CustomSiteImportPreview
} from "../../site-design/draft";
import {
  isKindAvailable,
  siteAlignmentGuides,
  siteLayoutSummary
} from "../../site-design/editor";
import { customSiteComplexity } from "../../site-design/performance";
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
  const isMobile = useIsMobile();
  const customSite = useStore((state) => state.customSite);
  const setCustomEnvironment = useStore((state) => state.setCustomEnvironment);
  const setCustomDesignName = useStore((state) => state.setCustomDesignName);
  const resetCustomDesign = useStore((state) => state.resetCustomDesign);
  const seedCustomDesign = useStore((state) => state.seedCustomDesign);
  const beginCustomPlacement = useStore((state) => state.beginCustomPlacement);
  const cancelCustomPlacement = useStore((state) => state.cancelCustomPlacement);
  const beginCustomConnection = useStore((state) => state.beginCustomConnection);
  const cancelCustomConnection = useStore((state) => state.cancelCustomConnection);
  const selectCustomAsset = useStore((state) => state.selectCustomAsset);
  const selectCustomConnection = useStore((state) => state.selectCustomConnection);
  const updateCustomAsset = useStore((state) => state.updateCustomAsset);
  const moveCustomAssetGroup = useStore((state) =>
    state.moveCustomAssetGroup);
  const rotateCustomAssetGroup = useStore((state) =>
    state.rotateCustomAssetGroup);
  const distributeCustomAssets = useStore((state) =>
    state.distributeCustomAssets);
  const deleteCustomAssetGroup = useStore((state) =>
    state.deleteCustomAssetGroup);
  const rotateCustomAsset = useStore((state) => state.rotateCustomAsset);
  const duplicateCustomAsset = useStore((state) => state.duplicateCustomAsset);
  const deleteCustomAsset = useStore((state) => state.deleteCustomAsset);
  const rerouteCustomConnection = useStore((state) => state.rerouteCustomConnection);
  const updateCustomConnectionRoute = useStore((state) =>
    state.updateCustomConnectionRoute);
  const deleteCustomConnection = useStore((state) => state.deleteCustomConnection);
  const setCustomPlannerSnaps = useStore((state) => state.setCustomPlannerSnaps);
  const undoCustomEdit = useStore((state) => state.undoCustomEdit);
  const redoCustomEdit = useStore((state) => state.redoCustomEdit);
  const importCustomDesign = useStore((state) => state.importCustomDesign);
  const saveCurrentScenario = useStore((state) => state.saveCurrentScenario);
  const flyTo = useStore((state) => state.flyTo);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] =
    useState<CustomSiteImportPreview | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { design, evaluation, findings, editor, history } = customSite;
  const groups = useMemo(
    () => groupedCatalog(siteAssetsForEnvironment(design.environment)),
    [design.environment]
  );
  const selectedAssets = design.assets.filter((asset) =>
    editor.selectedAssetIds.includes(asset.id)
  );
  const selectedAsset = selectedAssets.length === 1 &&
    editor.selectedAssetId !== null
    ? design.assets.find((asset) =>
        asset.id === editor.selectedAssetId
      ) ?? null
    : null;
  const selectedDefinition = selectedAsset === null
    ? null
    : siteAssetDefinition(selectedAsset.kind);
  const selectedConnection = editor.selectedConnectionId === null
    ? null
    : design.connections.find(
        (connection) => connection.id === editor.selectedConnectionId
      ) ?? null;
  const connectionFromAsset = selectedConnection === null
    ? null
    : design.assets.find((asset) => asset.id === selectedConnection.from.assetId) ?? null;
  const connectionToAsset = selectedConnection === null
    ? null
    : design.assets.find((asset) => asset.id === selectedConnection.to.assetId) ?? null;
  const connectionFromPort = connectionFromAsset === null || selectedConnection === null
    ? null
    : siteAssetDefinition(connectionFromAsset.kind)?.ports.find(
        (port) => port.id === selectedConnection.from.portId
      ) ?? null;
  const connectionToPort = connectionToAsset === null || selectedConnection === null
    ? null
    : siteAssetDefinition(connectionToAsset.kind)?.ports.find(
        (port) => port.id === selectedConnection.to.portId
      ) ?? null;
  const connectionStreams = connectionFromPort === null || connectionToPort === null
    ? []
    : connectionFromPort.streams.filter((stream) =>
        connectionToPort.streams.includes(stream)
      );
  const selectedAssetEvaluation = selectedAsset === null
    ? null
    : evaluation.assetEvaluations.find((item) =>
        item.assetId === selectedAsset.id
      ) ?? null;
  const selectedConnectionEvaluation = selectedConnection === null
    ? null
    : evaluation.connectionEvaluations.find((item) =>
        item.connectionId === selectedConnection.id
      ) ?? null;
  const powerStrategyLabel = evaluation.powerStrategy === "auto"
    ? `AUTO → ${evaluation.baseResult.power.architecture.toUpperCase()}`
    : evaluation.powerStrategy.toUpperCase();
  const selectedEntityId = selectedAsset?.id ?? selectedConnection?.id ?? null;
  const selectedFindings = selectedEntityId === null
    ? []
    : findings.filter((finding) => finding.entityIds.includes(selectedEntityId));
  const errorCount = severityCount(findings, "error");
  const cautionCount = severityCount(findings, "caution");
  const infoCount = severityCount(findings, "info");
  const layout = useMemo(() => siteLayoutSummary(design), [design]);
  const complexity = useMemo(
    () => customSiteComplexity(design, isMobile),
    [design, isMobile]
  );
  const alignmentGuides = useMemo(
    () => siteAlignmentGuides(design, editor.selectedAssetIds),
    [design, editor.selectedAssetIds]
  );
  const selectedLayout = useMemo(
    () => siteLayoutSummary({
      ...design,
      assets: selectedAssets,
      connections: []
    }),
    [design, selectedAssets]
  );
  const editableRoutePoints = selectedConnection === null
    ? []
    : siteConnectionRoutePoints(design, selectedConnection).slice(1, -1);

  const selectAllAssets = (): void => {
    selectCustomAsset(null);
    for (const asset of design.assets) {
      useStore.getState().selectCustomAsset(asset.id, true);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (editor.tool === "place") {
          cancelCustomPlacement();
        } else if (editor.tool === "connect") {
          cancelCustomConnection();
        } else {
          selectCustomAsset(null);
          selectCustomConnection(null);
        }
        return;
      }
      if (isTextInput(event.target)) {
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShowShortcuts((visible) => !visible);
        return;
      }
      if (isMobile) {
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
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        selectCustomAsset(null);
        for (const asset of design.assets) {
          useStore.getState().selectCustomAsset(asset.id, true);
        }
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (
          editor.selectedAssetIds.length > 0 ||
          editor.selectedConnectionId !== null
        )
      ) {
        event.preventDefault();
        if (editor.selectedConnectionId !== null) {
          deleteCustomConnection(editor.selectedConnectionId);
        } else if (editor.selectedAssetIds.length > 1) {
          deleteCustomAssetGroup();
        } else if (editor.selectedAssetId !== null) {
          deleteCustomAsset(editor.selectedAssetId);
        }
      } else if (
        editor.selectedAssetIds.length > 0 &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const step = (design.planner.gridSnapM || 1) *
          (event.shiftKey ? 5 : 1);
        moveCustomAssetGroup(
          event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight" ? step : 0,
          event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown" ? step : 0
        );
      } else if (
        editor.selectedAssetIds.length > 1 &&
        event.key.toLowerCase() === "r"
      ) {
        event.preventDefault();
        rotateCustomAssetGroup(
          (design.planner.rotationSnapDeg || 15) *
          (event.shiftKey ? -1 : 1)
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cancelCustomPlacement,
    cancelCustomConnection,
    deleteCustomAsset,
    deleteCustomAssetGroup,
    deleteCustomConnection,
    design.assets,
    design.planner.gridSnapM,
    design.planner.rotationSnapDeg,
    editor.selectedAssetId,
    editor.selectedAssetIds,
    editor.selectedConnectionId,
    editor.tool,
    isMobile,
    moveCustomAssetGroup,
    redoCustomEdit,
    rotateCustomAssetGroup,
    selectCustomAsset,
    selectCustomConnection,
    undoCustomEdit
  ]);

  const focusFinding = (finding: SiteDesignFinding): void => {
    const connectionId = finding.entityIds.find((id) =>
      design.connections.some((connection) => connection.id === id)
    );
    if (connectionId !== undefined) {
      selectCustomConnection(connectionId);
      flyTo(connectionId);
      return;
    }
    const assetId = finding.entityIds.find((id) =>
      design.assets.some((asset) => asset.id === id)
    );
    if (assetId !== undefined) {
      selectCustomAsset(assetId);
      flyTo(assetId);
    }
  };

  const hasFindingTarget = (finding: SiteDesignFinding): boolean =>
    finding.entityIds.some((id) =>
      design.assets.some((asset) => asset.id === id) ||
      design.connections.some((connection) => connection.id === id)
    );

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
    <div className={`custom-site-workspace${isMobile ? " mobile-review" : ""}`}>
      {isMobile && (
        <div className="custom-mobile-review-note" role="note">
          MOBILE REVIEW · SELECT AND INSPECT ONLY · USE DESKTOP FOR PLACEMENT,
          ROUTING, AND TRANSFORMS
        </div>
      )}
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
                const capacity = definition.capacityModel;
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
                    <p className="custom-catalog-rating">
                      {capacity === undefined
                        ? "CAPACITY · NOT MODELED"
                        : `RATING · ${formatQtyText(
                            capacity.rating,
                            capacity.unit,
                            4
                          )} / ${capacity.quantityMode === "bank" ? "UNIT" : "INSTANCE"}`}
                    </p>
                    <footer>
                      <span>{definition.modelMaturity}</span>
                      <span>{definition.ports.length} PORT{definition.ports.length === 1 ? "" : "S"}</span>
                    </footer>
                    <button
                      className="custom-place-button"
                      disabled={!available || isMobile}
                      aria-pressed={active}
                      onClick={() => active
                        ? cancelCustomPlacement()
                        : beginCustomPlacement(definition.kind)}
                    >
                      {isMobile
                        ? "DESKTOP ONLY"
                        : !available
                          ? "PLACED · SINGLE"
                          : active ? "CANCEL PLACEMENT" : "PLACE"}
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
          {!isMobile && (
            <div className="custom-seed-actions">
              <button onClick={() => seedCustomDesign("equatorial")}>
                START FROM EQUATORIAL REFERENCE
              </button>
              <button onClick={() => seedCustomDesign("polar")}>
                START FROM POLAR REFERENCE
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="custom-planner-toolbar" aria-label="Site planner tools">
          <div>
            <button
              disabled={isMobile || history.past.length === 0}
              onClick={undoCustomEdit}
            >
              UNDO
            </button>
            <button
              disabled={isMobile || history.future.length === 0}
              onClick={redoCustomEdit}
            >
              REDO
            </button>
            <button disabled={isMobile} onClick={selectAllAssets}>
              SELECT ALL
            </button>
            <button onClick={() => setShowShortcuts((visible) => !visible)}>
              ? KEYS
            </button>
          </div>
          <span>
            {isMobile
              ? "REVIEW MODE · TAP AN ASSET OR ROUTE TO INSPECT"
              : editor.tool === "place"
              ? "PLACEMENT ACTIVE · CLICK TERRAIN · ESC CANCEL"
              : editor.tool === "connect"
                ? "CONNECTION ACTIVE · CHOOSE A GREEN PORT · ESC CANCEL"
                : "CLICK TO SELECT · SHIFT/CTRL-CLICK MULTI · DRAG TO MOVE"}
          </span>
          <strong>
            {layout.widthM.toFixed(0)} × {layout.depthM.toFixed(0)} M EXTENT ·{" "}
            {editor.selectedAssetIds.length} SELECTED
          </strong>
          {showShortcuts && (
            <div className="custom-shortcut-card" role="note">
              <strong>PLANNER KEYS</strong>
              <span>CTRL/⌘+A · select all</span>
              <span>SHIFT/CTRL+click · multi-select</span>
              <span>ARROWS · nudge · SHIFT ×5</span>
              <span>R / SHIFT+R · rotate group</span>
              <span>DELETE · remove selection</span>
              <span>CTRL/⌘+Z · undo · +SHIFT redo</span>
              <span>ESC · cancel / clear · ? help</span>
            </div>
          )}
        </section>
      )}

      <aside className="custom-inspector" aria-label="Custom site inspector">
        <div className="custom-panel-header">
          <p className="custom-eyebrow">
            {selectedAssets.length > 1
              ? "GROUP INSPECTOR"
              : selectedAsset !== null
              ? "ASSET INSPECTOR"
              : selectedConnection !== null ? "CONNECTION INSPECTOR" : "SITE INSPECTOR"}
          </p>
          <strong>
            {selectedAssets.length > 1
              ? `${selectedAssets.length} ASSETS SELECTED`
              : selectedAsset?.name ??
              (selectedConnection === null
                ? "WORKING DESIGN"
                : `${selectedConnection.kind.toUpperCase()} ROUTE`)}
          </strong>
          <span>Saved locally as you edit</span>
        </div>

        <div className="custom-inspector-scroll">
          {selectedAssets.length > 1 ? (
            <>
              <button
                className="custom-back-button"
                onClick={() => selectCustomAsset(null)}
              >
                ← SITE SETTINGS
              </button>
              <div className="custom-group-summary">
                <p className="custom-eyebrow">GROUP FOOTPRINT</p>
                <strong>
                  {selectedLayout.widthM.toFixed(1)} ×{" "}
                  {selectedLayout.depthM.toFixed(1)} m
                </strong>
                <span>
                  {selectedLayout.occupiedAreaM2.toFixed(0)} m² equipment ·{" "}
                  {alignmentGuides.length} active alignment guide
                  {alignmentGuides.length === 1 ? "" : "s"}
                </span>
              </div>
              <ol className="custom-group-members">
                {selectedAssets.map((asset) => (
                  <li key={asset.id}>
                    <button
                      onClick={() => selectCustomAsset(asset.id, true)}
                      title="Remove from group selection"
                    >
                      <strong>{asset.name}</strong>
                      <span>
                        X {asset.transform.xM.toFixed(1)} · Z{" "}
                        {asset.transform.zM.toFixed(1)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {alignmentGuides.length > 0 && (
                <div className="custom-alignment-list">
                  {alignmentGuides.map((guide) => (
                    <span key={`${guide.axis}-${guide.valueM}-${guide.assetIds.join("-")}`}>
                      {guide.axis.toUpperCase()} = {guide.valueM.toFixed(1)} m ·{" "}
                      {guide.assetIds.length} centers aligned
                    </span>
                  ))}
                </div>
              )}
              <fieldset
                className="custom-fieldset custom-group-tools"
                disabled={isMobile}
              >
                <legend>GROUP TRANSFORM</legend>
                <div className="custom-nudge-grid">
                  <button onClick={() => moveCustomAssetGroup(0, -(
                    design.planner.gridSnapM || 1
                  ))}>
                    ↑ Z−
                  </button>
                  <button onClick={() => moveCustomAssetGroup(-(
                    design.planner.gridSnapM || 1
                  ), 0)}>
                    ← X−
                  </button>
                  <button onClick={() => moveCustomAssetGroup(
                    design.planner.gridSnapM || 1,
                    0
                  )}>
                    X+ →
                  </button>
                  <button onClick={() => moveCustomAssetGroup(
                    0,
                    design.planner.gridSnapM || 1
                  )}>
                    Z+ ↓
                  </button>
                </div>
                <div className="custom-rotation-actions">
                  <button onClick={() => rotateCustomAssetGroup(-(
                    design.planner.rotationSnapDeg || 15
                  ))}>
                    ↺ GROUP
                  </button>
                  <button onClick={() => rotateCustomAssetGroup(
                    design.planner.rotationSnapDeg || 15
                  )}>
                    GROUP ↻
                  </button>
                </div>
                <div className="custom-rotation-actions">
                  <button
                    disabled={selectedAssets.length < 3}
                    onClick={() => distributeCustomAssets("x")}
                  >
                    DISTRIBUTE X
                  </button>
                  <button
                    disabled={selectedAssets.length < 3}
                    onClick={() => distributeCustomAssets("z")}
                  >
                    DISTRIBUTE Z
                  </button>
                </div>
              </fieldset>
              <div className="custom-asset-actions">
                <button onClick={() => flyTo("__selection__")}>
                  FOCUS GROUP
                </button>
                <button
                  className="danger"
                  disabled={isMobile}
                  onClick={deleteCustomAssetGroup}
                >
                  DELETE GROUP
                </button>
              </div>
            </>
          ) : selectedAsset !== null && selectedDefinition !== null ? (
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
                  readOnly={isMobile}
                  onBlur={(event) => {
                    if (!isMobile) {
                      updateCustomAsset(selectedAsset.id, {
                        name: event.target.value
                      });
                    }
                  }}
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
                      readOnly={isMobile}
                      onBlur={(event) => {
                        if (!isMobile) {
                          commitNumber(
                            selectedAsset.id,
                            key,
                            event.target.value
                          );
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
              {selectedDefinition.capacityModel?.quantityMode === "bank" && (
                <label className="custom-field">
                  <span>INSTALLED UNITS</span>
                  <input
                    key={`${selectedAsset.id}-quantity-${selectedAssetEvaluation?.quantity ?? 1}`}
                    type="number"
                    min={1}
                    max={selectedDefinition.capacityModel.maxQuantity ?? 8}
                    step={1}
                    defaultValue={selectedAssetEvaluation?.quantity ?? 1}
                    readOnly={isMobile}
                    onBlur={(event) => {
                      if (isMobile) {
                        return;
                      }
                      const parsed = Number(event.target.value);
                      if (!Number.isFinite(parsed)) {
                        return;
                      }
                      const quantity = Math.max(
                        1,
                        Math.min(
                          selectedDefinition.capacityModel?.maxQuantity ?? 8,
                          Math.trunc(parsed)
                        )
                      );
                      updateCustomAsset(selectedAsset.id, {
                        configuration: {
                          [selectedDefinition.capacityModel?.quantityKey ??
                            "unitCount"]: quantity
                        }
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </label>
              )}
              <div className="custom-rotation-actions">
                <button disabled={isMobile} onClick={() =>
                  rotateCustomAsset(selectedAsset.id, -design.planner.rotationSnapDeg)}>
                  ↺ {design.planner.rotationSnapDeg}°
                </button>
                <button disabled={isMobile} onClick={() =>
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
                <div>
                  <dt>Graph role</dt>
                  <dd>
                    {selectedAssetEvaluation?.operational
                      ? "OPERATIONAL"
                      : selectedAssetEvaluation?.connected ? "STANDBY" : "UNCONNECTED"}
                  </dd>
                </div>
                <div>
                  <dt>Capacity</dt>
                  <dd>
                    {selectedAssetEvaluation?.capacityStatus === "modeled"
                      ? formatQtyText(
                          selectedAssetEvaluation.installedCapacity ?? 0,
                          selectedAssetEvaluation.unit ?? "",
                          4
                        )
                      : "NOT MODELED"}
                  </dd>
                </div>
                <div>
                  <dt>Group duty</dt>
                  <dd>
                    {selectedAssetEvaluation?.requiredDuty === null ||
                    selectedAssetEvaluation?.requiredDuty === undefined
                      ? "UNAVAILABLE"
                      : formatQtyText(
                          selectedAssetEvaluation.requiredDuty,
                          selectedAssetEvaluation.unit ?? "",
                          4
                        )}
                  </dd>
                </div>
                <div>
                  <dt>Group margin</dt>
                  <dd>
                    {selectedAssetEvaluation?.margin === null ||
                    selectedAssetEvaluation?.margin === undefined
                      ? "UNAVAILABLE"
                      : formatQtyText(
                          selectedAssetEvaluation.margin,
                          selectedAssetEvaluation.unit ?? "",
                          4
                        )}
                  </dd>
                </div>
                <div>
                  <dt>Utilization</dt>
                  <dd>
                    {selectedAssetEvaluation?.utilization === null ||
                    selectedAssetEvaluation?.utilization === undefined ||
                    !Number.isFinite(selectedAssetEvaluation.utilization)
                      ? "UNAVAILABLE"
                      : `${(selectedAssetEvaluation.utilization * 100).toFixed(1)}%`}
                  </dd>
                </div>
              </dl>
              {selectedAssetEvaluation?.capacityStatus === "modeled" && (
                <section className="custom-model-disclosure">
                  <p className="custom-eyebrow">CAPACITY MODEL</p>
                  <strong>{selectedAssetEvaluation.modelMaturity}</strong>
                  <p>{selectedAssetEvaluation.basis}</p>
                  <small>{selectedAssetEvaluation.evidence}</small>
                </section>
              )}
              <section className="custom-port-section">
                <div className="custom-port-heading">
                  <div>
                    <p className="custom-eyebrow">TYPED INTERFACES</p>
                    <h2>{selectedDefinition.ports.length} connection ports</h2>
                  </div>
                  {editor.connectionSource?.assetId === selectedAsset.id && (
                    <button onClick={cancelCustomConnection}>CANCEL</button>
                  )}
                </div>
                <div className="custom-port-list">
                  {selectedDefinition.ports.map((port) => {
                    const usage = design.connections.filter((connection) =>
                      (
                        connection.from.assetId === selectedAsset.id &&
                        connection.from.portId === port.id
                      ) || (
                        connection.to.assetId === selectedAsset.id &&
                        connection.to.portId === port.id
                      )
                    ).length;
                    const canStart =
                      port.direction === "output" ||
                      port.direction === "bidirectional";
                    const isSource =
                      editor.connectionSource?.assetId === selectedAsset.id &&
                      editor.connectionSource.portId === port.id;
                    const full =
                      port.maxConnections !== undefined &&
                      usage >= port.maxConnections;
                    return (
                      <article
                        className={`custom-port custom-port-${port.kind}${isSource ? " active" : ""}`}
                        key={port.id}
                      >
                        <div>
                          <strong>{port.label}</strong>
                          <span>{port.kind.toUpperCase()}</span>
                        </div>
                        <p>
                          {port.direction.toUpperCase()} · {port.streams.join(" / ")}
                        </p>
                        <footer>
                          <span>
                            {usage}/{port.maxConnections ?? "∞"} LINKS
                          </span>
                          {canStart && (
                            <button
                              disabled={
                                isMobile ||
                                !selectedAsset.enabled ||
                                (full && !isSource)
                              }
                              aria-pressed={isSource}
                              onClick={() => isSource
                                ? cancelCustomConnection()
                                : beginCustomConnection({
                                    assetId: selectedAsset.id,
                                    portId: port.id
                                  })}
                            >
                              {isSource ? "CONNECTING…" : full ? "PORT FULL" : "CONNECT"}
                            </button>
                          )}
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
              <div className="custom-asset-actions">
                <button onClick={() => flyTo(selectedAsset.id)}>FOCUS</button>
                <button
                  disabled={
                    isMobile ||
                    selectedDefinition.multiplicity === "single"
                  }
                  onClick={() => duplicateCustomAsset(selectedAsset.id)}
                >
                  DUPLICATE
                </button>
                <button disabled={isMobile} onClick={() =>
                  updateCustomAsset(selectedAsset.id, { enabled: !selectedAsset.enabled })}>
                  {selectedAsset.enabled ? "DISABLE" : "ENABLE"}
                </button>
                <button
                  className="danger"
                  disabled={isMobile}
                  onClick={() => deleteCustomAsset(selectedAsset.id)}
                >
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
          ) : selectedConnection !== null ? (
            <>
              <button
                className="custom-back-button"
                onClick={() => selectCustomConnection(null)}
              >
                ← SITE SETTINGS
              </button>
              <div className={`custom-connection-summary connection-${selectedConnection.kind}`}>
                <p className="custom-eyebrow">{selectedConnection.kind.toUpperCase()} ROUTE</p>
                <strong>
                  {siteConnectionLengthM(design, selectedConnection).toFixed(1)} m measured length
                </strong>
                <span>
                  {connectionStreams.length > 0
                    ? connectionStreams.join(" / ")
                    : "NO COMPATIBLE STREAM"} ·{" "}
                  {selectedConnectionEvaluation?.operational
                    ? "FLOW ACTIVE"
                    : "FLOW STANDBY"}
                </span>
              </div>
              <section className="custom-endpoint-list" aria-label="Connection endpoints">
                <div>
                  <span>FROM · {connectionFromPort?.direction.toUpperCase() ?? "MISSING"}</span>
                  <strong>{connectionFromAsset?.name ?? selectedConnection.from.assetId}</strong>
                  <p>{connectionFromPort?.label ?? selectedConnection.from.portId}</p>
                </div>
                <i aria-hidden="true">→</i>
                <div>
                  <span>TO · {connectionToPort?.direction.toUpperCase() ?? "MISSING"}</span>
                  <strong>{connectionToAsset?.name ?? selectedConnection.to.assetId}</strong>
                  <p>{connectionToPort?.label ?? selectedConnection.to.portId}</p>
                </div>
              </section>
              <dl className="custom-document-meta">
                <div><dt>Kind</dt><dd>{selectedConnection.kind.toUpperCase()}</dd></div>
                <div><dt>Route bends</dt><dd>{selectedConnection.route.length}</dd></div>
                <div>
                  <dt>Measured length</dt>
                  <dd>{siteConnectionLengthM(design, selectedConnection).toFixed(1)} m</dd>
                </div>
                <div>
                  <dt>Topology</dt>
                  <dd>
                    {selectedConnectionEvaluation?.operational
                      ? "OPERATIONAL"
                      : selectedConnectionEvaluation?.compatible ? "STANDBY" : "INVALID"}
                  </dd>
                </div>
                <div>
                  <dt>Route model</dt>
                  <dd>
                    {selectedConnectionEvaluation?.modelStatus
                      .replaceAll("-", " ")
                      .toUpperCase() ?? "MEASURED ONLY"}
                  </dd>
                </div>
                <div>
                  <dt>Cable mass</dt>
                  <dd>{formatQtyText(
                    selectedConnectionEvaluation?.cableMassKg ?? 0,
                    "kg"
                  )}</dd>
                </div>
                <div>
                  <dt>Power loss</dt>
                  <dd>{formatQtyText(
                    selectedConnectionEvaluation?.powerLossW ?? 0,
                    "W"
                  )}</dd>
                </div>
                <div>
                  <dt>Transport load</dt>
                  <dd>{formatQtyText(
                    selectedConnectionEvaluation?.transportPowerW ?? 0,
                    "W"
                  )}</dd>
                </div>
                <div>
                  <dt>Utilization</dt>
                  <dd>
                    {selectedConnectionEvaluation?.utilization === null ||
                    selectedConnectionEvaluation?.utilization === undefined
                      ? "NOT APPLICABLE"
                      : `${(selectedConnectionEvaluation.utilization * 100).toFixed(1)}%`}
                  </dd>
                </div>
              </dl>
              <section className="custom-model-disclosure">
                <p className="custom-eyebrow">ROUTE CONSEQUENCE</p>
                <strong>
                  {selectedConnectionEvaluation?.equation ??
                    "MEASURED X/Z LENGTH ONLY"}
                </strong>
                <p>{selectedConnectionEvaluation?.assumption}</p>
                <small>{selectedConnectionEvaluation?.evidence}</small>
              </section>
              <section className="custom-route-editor" aria-label="Route handles">
                <div className="custom-port-heading">
                  <div>
                    <p className="custom-eyebrow">ROUTE HANDLES</p>
                    <h2>{editableRoutePoints.length} editable bends</h2>
                  </div>
                  <button
                    disabled={isMobile}
                    onClick={() => {
                      const points = siteConnectionRoutePoints(
                        design,
                        selectedConnection
                      );
                      let segmentIndex = 0;
                      let longest = -1;
                      for (let index = 0; index < points.length - 1; index += 1) {
                        const a = points[index]!;
                        const b = points[index + 1]!;
                        const length = Math.hypot(
                          b.xM - a.xM,
                          b.zM - a.zM
                        );
                        if (length > longest) {
                          longest = length;
                          segmentIndex = index;
                        }
                      }
                      const a = points[segmentIndex]!;
                      const b = points[segmentIndex + 1]!;
                      const route = [...editableRoutePoints];
                      route.splice(segmentIndex, 0, {
                        xM: (a.xM + b.xM) / 2,
                        zM: (a.zM + b.zM) / 2
                      });
                      updateCustomConnectionRoute(
                        selectedConnection.id,
                        route
                      );
                    }}
                  >
                    ADD BEND
                  </button>
                </div>
                {editableRoutePoints.length === 0 ? (
                  <p className="custom-field-hint">
                    Direct endpoint route. Add a bend for explicit clearance
                    routing.
                  </p>
                ) : (
                  <ol>
                    {editableRoutePoints.map((point, index) => (
                      <li key={`${index}-${point.xM}-${point.zM}`}>
                        <span>B{index + 1}</span>
                        {(["xM", "zM"] as const).map((coordinate) => (
                          <label key={coordinate}>
                            {coordinate === "xM" ? "X" : "Z"}
                            <input
                              type="number"
                              aria-label={`Route bend ${index + 1} ${
                                coordinate === "xM" ? "X" : "Z"
                              } coordinate in meters`}
                              defaultValue={point[coordinate]}
                              readOnly={isMobile}
                              onBlur={(event) => {
                                if (isMobile) {
                                  return;
                                }
                                const value = Number(event.target.value);
                                if (!Number.isFinite(value)) {
                                  return;
                                }
                                const route = editableRoutePoints.map(
                                  (candidate, routeIndex) =>
                                    routeIndex === index
                                      ? {
                                          ...candidate,
                                          [coordinate]: value
                                        }
                                      : candidate
                                );
                                updateCustomConnectionRoute(
                                  selectedConnection.id,
                                  route
                                );
                              }}
                            />
                          </label>
                        ))}
                        <button
                          disabled={isMobile}
                          aria-label={`Remove bend ${index + 1}`}
                          onClick={() => updateCustomConnectionRoute(
                            selectedConnection.id,
                            editableRoutePoints.filter(
                              (_, routeIndex) => routeIndex !== index
                            )
                          )}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <div className="custom-asset-actions">
                <button onClick={() => flyTo(selectedConnection.id)}>FOCUS</button>
                <button
                  disabled={isMobile}
                  onClick={() => rerouteCustomConnection(selectedConnection.id)}
                >
                  REROUTE
                </button>
                <button
                  className="danger"
                  disabled={isMobile}
                  onClick={() => deleteCustomConnection(selectedConnection.id)}
                >
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
                  readOnly={isMobile}
                  onChange={(event) => {
                    if (!isMobile) {
                      setCustomDesignName(event.target.value);
                    }
                  }}
                />
              </label>

              <fieldset className="custom-fieldset">
                <legend>ENVIRONMENT</legend>
                <div className="custom-segmented">
                  <button
                    className={design.environment === "equatorial" ? "active" : ""}
                    aria-pressed={design.environment === "equatorial"}
                    disabled={isMobile || design.assets.length > 0}
                    onClick={() => setCustomEnvironment("equatorial")}
                  >
                    EQUATORIAL
                  </button>
                  <button
                    className={design.environment === "polar" ? "active polar" : ""}
                    aria-pressed={design.environment === "polar"}
                    disabled={isMobile || design.assets.length > 0}
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
                      disabled={isMobile}
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
                      disabled={isMobile}
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
                <div>
                  <dt>Scene detail</dt>
                  <dd>
                    {complexity.simplifiedAssetCount === 0
                      ? `${complexity.detailedAssetCount} detailed`
                      : `${complexity.detailedAssetCount} detailed · ${complexity.simplifiedAssetCount} placeholders`}
                  </dd>
                </div>
                <div>
                  <dt>Site extent</dt>
                  <dd>
                    {layout.widthM.toFixed(1)} × {layout.depthM.toFixed(1)} m
                  </dd>
                </div>
                <div>
                  <dt>Equipment area</dt>
                  <dd>{layout.occupiedAreaM2.toFixed(0)} m²</dd>
                </div>
                <div>
                  <dt>Area with clearance</dt>
                  <dd>{layout.clearanceAreaM2.toFixed(0)} m² summed</dd>
                </div>
                <div>
                  <dt>Persisted routes</dt>
                  <dd>{layout.totalRouteLengthM.toFixed(1)} m total</dd>
                </div>
                <div>
                  <dt>Power source</dt>
                  <dd>{powerStrategyLabel}</dd>
                </div>
                <div>
                  <dt>Topology gate</dt>
                  <dd>{evaluation.topologyValid ? "OPEN" : "CLOSED"}</dd>
                </div>
              </dl>

              {complexity.level !== "normal" && (
                <section
                  className={`custom-performance-note ${complexity.level}`}
                  role="status"
                  aria-live="polite"
                >
                  <p className="custom-eyebrow">
                    {complexity.level === "caution"
                      ? "LARGE DESIGN GUARDRAIL"
                      : "ADAPTIVE SCENE DETAIL"}
                  </p>
                  <strong>
                    {complexity.simplifiedAssetCount} assets use lightweight
                    selectable placeholders.
                  </strong>
                  <p>
                    Geometry is simplified after the {complexity.detailBudget}
                    -asset detail budget. Engineering state, saved transforms,
                    ports, and evaluation remain active.
                  </p>
                </section>
              )}

              {design.assets.length > 0 && (
                <section className="custom-asset-roster" aria-label="Site asset roster">
                  <div className="custom-port-heading">
                    <div>
                      <p className="custom-eyebrow">LAYOUT ROSTER</p>
                      <h2>Select equipment</h2>
                    </div>
                    {!isMobile && (
                      <button onClick={selectAllAssets}>SELECT ALL</button>
                    )}
                  </div>
                  <ol>
                    {design.assets.map((asset) => (
                      <li key={asset.id}>
                        <button
                          aria-pressed={editor.selectedAssetIds.includes(
                            asset.id
                          )}
                          aria-label={`Select ${asset.name}, X ${asset.transform.xM.toFixed(1)} meters, Z ${asset.transform.zM.toFixed(1)} meters, heading ${asset.transform.headingDeg.toFixed(0)} degrees, ${asset.enabled ? "enabled" : "disabled"}`}
                          onClick={(event) => selectCustomAsset(
                            asset.id,
                            !isMobile && (
                              event.shiftKey ||
                              event.ctrlKey ||
                              event.metaKey
                            )
                          )}
                        >
                          <strong>{asset.name}</strong>
                          <span>
                            X {asset.transform.xM.toFixed(1)} · Z{" "}
                            {asset.transform.zM.toFixed(1)} ·{" "}
                            {asset.transform.headingDeg.toFixed(0)}°
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <section className="custom-capacity-groups" aria-label="Installed capacity groups">
                <div className="custom-validation-heading">
                  <div>
                    <p className="custom-eyebrow">INSTALLED CAPACITY</p>
                    <h2>{evaluation.capacityGroups.length} rated stages</h2>
                  </div>
                </div>
                {evaluation.capacityGroups.map((group) => (
                  <div className={group.margin < 0 ? "limited" : ""} key={group.id}>
                    <span>{group.label}</span>
                    <strong>
                      {formatQtyText(group.available, group.unit, 4)}
                    </strong>
                    <small>
                      {formatQtyText(group.required, group.unit, 4)} required ·{" "}
                      {Number.isFinite(group.utilization)
                        ? `${(group.utilization * 100).toFixed(0)}%`
                        : "NO CAPACITY"}
                    </small>
                  </div>
                ))}
              </section>

              <section className="custom-validation">
                <div className="custom-validation-heading">
                  <div>
                    <p className="custom-eyebrow">DESIGN CHECK</p>
                    <h2>{evaluation.topologyValid
                      ? "Operating topology"
                      : `${errorCount} open steps`}</h2>
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
                {evaluation.bottleneck !== null && (
                  <p className="custom-bottleneck">
                    <span>PRIMARY BLOCKER</span>
                    {evaluation.bottleneck.label}
                  </p>
                )}
                <ol className="custom-findings">
                  {findings.slice(0, 8).map((finding) => (
                    <li className={`finding-${finding.severity}`} key={finding.id}>
                      <button
                        disabled={!hasFindingTarget(finding)}
                        onClick={() => focusFinding(finding)}
                        title={hasFindingTarget(finding)
                          ? "Focus the implicated site element"
                          : finding.suggestedAction}
                      >
                        <span>{finding.severity.toUpperCase()}</span>
                        <p>{finding.message}</p>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>

        {selectedAssets.length === 0 && selectedConnection === null && (
          <div className="custom-project-footer">
            {importPreview !== null && (
              <section
                className="custom-import-preview"
                aria-label="Custom design import preview"
              >
                <strong>
                  {importPreview.document === null
                    ? "IMPORT BLOCKED"
                    : `${importPreview.document.name} · REVIEW`}
                </strong>
                <span>
                  {importPreview.findings.filter((finding) =>
                    finding.severity === "error"
                  ).length} errors ·{" "}
                  {importPreview.findings.filter((finding) =>
                    finding.severity === "caution"
                  ).length} cautions ·{" "}
                  {importPreview.findings.filter((finding) =>
                    finding.severity === "info"
                  ).length} notes
                </span>
                <ol>
                  {importPreview.findings.slice(0, 6).map((finding, index) => (
                    <li className={finding.severity} key={`${finding.id}-${index}`}>
                      <span>{finding.severity.toUpperCase()}</span>
                      <p>{finding.message}</p>
                    </li>
                  ))}
                </ol>
                <div>
                  <button
                    disabled={importPreview.document === null}
                    onClick={() => {
                      if (importPreview.document !== null) {
                        importCustomDesign(importPreview.document);
                        setImportPreview(null);
                      }
                    }}
                  >
                    ACCEPT DESIGN
                  </button>
                  <button onClick={() => setImportPreview(null)}>CANCEL</button>
                </div>
              </section>
            )}
            <div className="custom-project-actions">
              <button onClick={() => saveCurrentScenario(design.name)}>
                SAVE TO STUDY
              </button>
              <button onClick={() => downloadText(
                `${design.name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase() || "selene-custom-site"}.json`,
                serializeSiteDesign(design),
                "application/json"
              )}>
                EXPORT DESIGN
              </button>
              {!isMobile && (
                <button onClick={() => importFileRef.current?.click()}>
                  IMPORT DESIGN
                </button>
              )}
              <input
                ref={importFileRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file === undefined) {
                    return;
                  }
                  void file.text().then((text) => {
                    setImportPreview(previewCustomSiteImport(text));
                    event.target.value = "";
                  });
                }}
              />
              {!isMobile && (
                <button onClick={() => {
                  if (
                    design.assets.length === 0 ||
                    window.confirm(
                      "Replace this project with the authored reference layout?"
                    )
                  ) {
                    seedCustomDesign(design.environment);
                  }
                }}>
                  SEED {design.environment.toUpperCase()} REFERENCE
                </button>
              )}
            </div>
            {!isMobile && (
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
          </div>
        )}
      </aside>

      <section
        className={`custom-evaluation-strip${evaluation.topologyValid ? "" : " stopped"}`}
        aria-label="Custom site evaluation"
      >
        <div>
          <span>PLANNED TARGET</span>
          <strong>{formatQtyText(
            evaluation.plannedTargetKgPerDay,
            "kg/day",
            4
          )}</strong>
        </div>
        <div className="achievable">
          <span>ACHIEVABLE OUTPUT</span>
          <strong>{formatQtyText(
            evaluation.achievableOutputKgPerDay,
            "kg/day",
            4
          )}</strong>
        </div>
        <div>
          <span>INSTALLED TRAIN</span>
          <strong>{formatQtyText(
            evaluation.installedThroughputKgPerDay,
            "kg/day",
            4
          )}</strong>
        </div>
        <div>
          <span>GRID REQUIRED</span>
          <strong>{formatQtyText(
            evaluation.requiredGridPowerW,
            "W"
          )}</strong>
        </div>
        <div>
          <span>POWER AVAILABLE</span>
          <strong title={`${powerStrategyLabel} · ${formatQtyText(
            evaluation.installedPowerW,
            "W"
          )} nameplate`}>
            {formatQtyText(evaluation.deliveredPowerW, "W")}
          </strong>
        </div>
        <div>
          <span>BOTTLENECK</span>
          <strong>
            {evaluation.bottleneck?.kind.toUpperCase() ?? "DESIGN MARGIN"}
          </strong>
        </div>
      </section>

      <div className="custom-statusbar" role="status">
        <span>
          <i className={`custom-status-dot${errorCount > 0 ? " incomplete" : ""}`} />
          {evaluation.topologyValid
            ? `TOPOLOGY GATE OPEN · ${evaluation.achievableOutputKgPerDay.toLocaleString()} KG/DAY ACHIEVABLE`
            : `TOPOLOGY GATE CLOSED · ${errorCount} ERROR${errorCount === 1 ? "" : "S"} · ZERO ACHIEVABLE OUTPUT`}
        </span>
        <span>
          {complexity.simplifiedAssetCount > 0 && (
            <>
              {complexity.simplifiedAssetCount} LIGHTWEIGHT PLACEHOLDER
              {complexity.simplifiedAssetCount === 1 ? "" : "S"} ·{" "}
            </>
          )}
          {formatQtyText(evaluation.spatial.cableMassKg, "kg")} CABLE ·{" "}
          {formatQtyText(evaluation.spatial.supplementalLoadW, "W")} ROUTE LOAD ·{" "}
          SCREENING ASSUMPTIONS VISIBLE IN INSPECTORS
        </span>
      </div>
    </div>
  );
}
