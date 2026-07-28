import { siteAssetsForEnvironment } from "@selene-isru/engine";
import type {
  SiteAssetDefinition,
  SiteDesignFindingSeverity
} from "@selene-isru/engine";
import { useMemo } from "react";
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

export function CustomSiteWorkspace(): React.JSX.Element {
  const customSite = useStore((state) => state.customSite);
  const setCustomEnvironment = useStore((state) => state.setCustomEnvironment);
  const setCustomDesignName = useStore((state) => state.setCustomDesignName);
  const resetCustomDesign = useStore((state) => state.resetCustomDesign);
  const { design, findings } = customSite;
  const groups = useMemo(
    () => groupedCatalog(siteAssetsForEnvironment(design.environment)),
    [design.environment]
  );
  const errorCount = severityCount(findings, "error");
  const cautionCount = severityCount(findings, "caution");
  const infoCount = severityCount(findings, "info");

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
              {definitions.map((definition) => (
                <article className="custom-catalog-card" key={definition.kind}>
                  <div>
                    <strong>{definition.label}</strong>
                    <span>{definition.footprint.widthM} × {definition.footprint.depthM} m</span>
                  </div>
                  <p>{definition.purpose}</p>
                  <footer>
                    <span>{definition.modelMaturity}</span>
                    <span>{definition.ports.length} PORT{definition.ports.length === 1 ? "" : "S"}</span>
                  </footer>
                </article>
              ))}
            </section>
          ))}
        </div>

        <div className="custom-panel-note">
          PLACEMENT TOOLS UNLOCK IN MILESTONE 2
        </div>
      </aside>

      <section className="custom-empty-state" aria-label="Blank site planning surface">
        <span className="custom-crosshair" aria-hidden="true" />
        <p className="custom-eyebrow">BLANK {design.environment.toUpperCase()} TERRAIN</p>
        <h1>Build the site from first principles.</h1>
        <p>
          The planning surface, equipment contracts, and validation graph are ready.
          Drag-to-place and connection tools arrive in the next milestone.
        </p>
        <div className="custom-empty-stats" aria-label="Current site counts">
          <span><strong>{design.assets.length}</strong> ASSETS</span>
          <span><strong>{design.connections.length}</strong> CONNECTIONS</span>
          <span><strong>{errorCount}</strong> OPEN PROCESS STEPS</span>
        </div>
      </section>

      <aside className="custom-inspector" aria-label="Custom site inspector">
        <div className="custom-panel-header">
          <p className="custom-eyebrow">SITE INSPECTOR</p>
          <strong>WORKING DESIGN</strong>
          <span>Saved locally as you edit</span>
        </div>

        <div className="custom-inspector-scroll">
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
                onClick={() => setCustomEnvironment("equatorial")}
              >
                EQUATORIAL
              </button>
              <button
                className={design.environment === "polar" ? "active polar" : ""}
                aria-pressed={design.environment === "polar"}
                onClick={() => setCustomEnvironment("polar")}
              >
                POLAR
              </button>
            </div>
          </fieldset>

          <dl className="custom-document-meta">
            <div><dt>Document</dt><dd>{design.schema}</dd></div>
            <div><dt>Version</dt><dd>v{design.version}</dd></div>
            <div><dt>Grid snap</dt><dd>{design.planner.gridSnapM} m</dd></div>
            <div><dt>Rotation snap</dt><dd>{design.planner.rotationSnapDeg}°</dd></div>
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
        </div>

        <button className="custom-reset" onClick={resetCustomDesign}>
          RESET BLANK DESIGN
        </button>
      </aside>

      <div className="custom-statusbar" role="status">
        <span><i className="custom-status-dot" /> PLANNING FOUNDATION ACTIVE</span>
        <span>OUTPUT METRICS DISABLED UNTIL A VALID CUSTOM PROCESS GRAPH EXISTS</span>
      </div>
    </div>
  );
}
