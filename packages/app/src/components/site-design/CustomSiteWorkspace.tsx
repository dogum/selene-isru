import {
  siteAssetDefinition,
  siteAssetsForEnvironment,
  siteConnectionLengthM
} from "@selene-isru/engine";
import type {
  PlannerDocumentState,
  SiteAssetDefinition,
  SiteDesignFinding,
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
  const beginCustomConnection = useStore((state) => state.beginCustomConnection);
  const cancelCustomConnection = useStore((state) => state.cancelCustomConnection);
  const selectCustomAsset = useStore((state) => state.selectCustomAsset);
  const selectCustomConnection = useStore((state) => state.selectCustomConnection);
  const updateCustomAsset = useStore((state) => state.updateCustomAsset);
  const rotateCustomAsset = useStore((state) => state.rotateCustomAsset);
  const duplicateCustomAsset = useStore((state) => state.duplicateCustomAsset);
  const deleteCustomAsset = useStore((state) => state.deleteCustomAsset);
  const rerouteCustomConnection = useStore((state) => state.rerouteCustomConnection);
  const deleteCustomConnection = useStore((state) => state.deleteCustomConnection);
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
  const selectedEntityId = selectedAsset?.id ?? selectedConnection?.id ?? null;
  const selectedFindings = selectedEntityId === null
    ? []
    : findings.filter((finding) => finding.entityIds.includes(selectedEntityId));
  const errorCount = severityCount(findings, "error");
  const cautionCount = severityCount(findings, "caution");
  const infoCount = severityCount(findings, "info");

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoCustomEdit();
        } else {
          undoCustomEdit();
        }
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (editor.selectedAssetId !== null || editor.selectedConnectionId !== null)
      ) {
        event.preventDefault();
        if (editor.selectedConnectionId !== null) {
          deleteCustomConnection(editor.selectedConnectionId);
        } else if (editor.selectedAssetId !== null) {
          deleteCustomAsset(editor.selectedAssetId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cancelCustomPlacement,
    cancelCustomConnection,
    deleteCustomAsset,
    deleteCustomConnection,
    editor.selectedAssetId,
    editor.selectedConnectionId,
    editor.tool,
    redoCustomEdit,
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
              : editor.tool === "connect"
                ? "CONNECTION ACTIVE · CHOOSE A GREEN PORT · ESC CANCEL"
                : "CLICK TO SELECT · DRAG TO MOVE · CLICK AN OUTPUT PORT TO CONNECT"}
          </span>
          <strong>
            {design.assets.length} ASSET{design.assets.length === 1 ? "" : "S"} ·{" "}
            {design.connections.length} ROUTE{design.connections.length === 1 ? "" : "S"}
          </strong>
        </section>
      )}

      <aside className="custom-inspector" aria-label="Custom site inspector">
        <div className="custom-panel-header">
          <p className="custom-eyebrow">
            {selectedAsset !== null
              ? "ASSET INSPECTOR"
              : selectedConnection !== null ? "CONNECTION INSPECTOR" : "SITE INSPECTOR"}
          </p>
          <strong>
            {selectedAsset?.name ??
              (selectedConnection === null
                ? "WORKING DESIGN"
                : `${selectedConnection.kind.toUpperCase()} ROUTE`)}
          </strong>
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
                              disabled={!selectedAsset.enabled || (full && !isSource)}
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
                    : "NO COMPATIBLE STREAM"}
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
                  <dd>{selectedFindings.some((finding) => finding.severity === "error")
                    ? "INVALID"
                    : "CONNECTED"}</dd>
                </div>
              </dl>
              <div className="custom-asset-actions">
                <button onClick={() => flyTo(selectedConnection.id)}>FOCUS</button>
                <button onClick={() => rerouteCustomConnection(selectedConnection.id)}>
                  REROUTE
                </button>
                <button
                  className="danger"
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
                    <h2>{errorCount === 0 ? "Topology complete" : `${errorCount} open steps`}</h2>
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

        {selectedAsset === null && selectedConnection === null && (
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
        <span>
          <i className={`custom-status-dot${errorCount > 0 ? " incomplete" : ""}`} />
          {errorCount === 0
            ? "TOPOLOGY VALID · PLANNER EDITING ACTIVE"
            : `TOPOLOGY INCOMPLETE · ${errorCount} ERROR${errorCount === 1 ? "" : "S"}`}
        </span>
        <span>CONNECTIONS ARE STRUCTURAL · CUSTOM OUTPUT EVALUATION ARRIVES IN MILESTONE 4</span>
      </div>
    </div>
  );
}
