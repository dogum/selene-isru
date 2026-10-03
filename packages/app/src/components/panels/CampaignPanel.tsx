import { useMemo } from "react";
import { campaignTimeline } from "@selene-isru/engine";
import { scaleLinear } from "d3-scale";
import { line as d3line } from "d3-shape";
import { campaignCsv } from "../../analysis/panelExports";
import { campaignStatus } from "../../analysis/campaign";
import { useSize } from "../../lib/hooks";
import { formatQty, formatQtyProse, formatQtyText } from "../../lib/format";
import { useStore } from "../../state/store";
import { ExportButton } from "./ExportButton";
import { RefuelDemand } from "./RefuelDemand";

/** About 240 samples across the campaign; landings and events are added exactly. */
function chartStepDays(campaignEndDay: number): number {
  return Math.max(1, Math.ceil(campaignEndDay / 240));
}

/**
 * Campaign ledger: cumulative mass in LEO spent landing and sustaining the
 * plant against the LEO mass its product saves. Every number is an engine
 * output; the timeline comes from the engine's campaignTimeline().
 */
export function CampaignPanel(): React.JSX.Element {
  const params = useStore((s) => s.params);
  const result = useStore((s) => s.result);
  const setParam = useStore((s) => s.setParam);
  const [ref, size] = useSize<HTMLDivElement>();
  const { campaign, logistics } = result;
  const status = campaignStatus(campaign);

  const width = Math.max(280, size.width);
  const height = 300;
  const margin = { top: 22, right: 18, bottom: 38, left: 80 };

  const timeline = useMemo(
    () => campaignTimeline(params, result, chartStepDays(result.campaign.campaignEndDay)),
    [params, result]
  );

  const chart = useMemo(() => {
    const endYears = Math.max(campaign.campaignEndDay / 365, 0.1);
    const top = Math.max(1, ...timeline.map((point) => Math.max(point.leoMassSpentKg, point.leoMassSavedKg)));
    const x = scaleLinear().domain([0, endYears]).range([margin.left, width - margin.right]);
    const y = scaleLinear().domain([0, top]).nice(4).range([height - margin.bottom, margin.top]);
    const path = (value: (point: (typeof timeline)[number]) => number): string =>
      d3line<(typeof timeline)[number]>()
        .x((point) => x(point.tDays / 365))
        .y((point) => y(value(point)))(timeline) ?? "";
    return {
      x,
      y,
      spent: path((point) => point.leoMassSpentKg),
      saved: path((point) => point.leoMassSavedKg),
      xTicks: x.ticks(Math.min(6, Math.max(2, Math.floor(endYears)))),
      yTicks: y.ticks(4)
    };
  }, [timeline, campaign.campaignEndDay, width, margin.left, margin.right, margin.top, margin.bottom]);

  const phases = [
    { id: "deploy", label: "DEPLOY", from: 0, to: campaign.deploymentDays },
    { id: "commission", label: "COMMISSION", from: campaign.deploymentDays, to: campaign.firstProductDay },
    { id: "operate", label: "OPERATE", from: campaign.firstProductDay, to: campaign.campaignEndDay }
  ].filter((phase) => phase.to - phase.from > 0);

  const xDay = (days: number): number => chart.x(days / 365);
  const dedicated = params.deploymentManifest === "dedicated";
  const { refuel } = result;

  return (
    <>
      <div className="panel-section campaign-panel" ref={ref}>
        <div className="panel-header">
          CAMPAIGN LEDGER · MASS IN LEO
          <span className="num">{status.headline}</span>
        </div>

        <div className="campaign-cards">
          <div>
            <span>PAYBACK</span>
            <strong className="num">{status.payback}</strong>
            <small>{status.paybackDetail}</small>
          </div>
          <div>
            <span>RETURN OVER CAMPAIGN</span>
            <strong className="num">{campaign.returnRatio.toFixed(2)}×</strong>
            <small>LEO mass saved ÷ spent</small>
          </div>
          <div>
            <span>NET LEO MASS</span>
            <strong className={`num ${campaign.netLeoMassKg < 0 ? "campaign-negative" : ""}`}>
              {formatQtyText(campaign.netLeoMassKg, "kg")}
            </strong>
            <small>after {params.missionYears} yr of operation</small>
          </div>
        </div>

        <div className="campaign-manifest" role="group" aria-label="How deployment landers are charged">
          <button type="button" className={dedicated ? "active" : ""} aria-pressed={dedicated} onClick={() => setParam("deploymentManifest", "dedicated")}>
            DEDICATED LANDERS
          </button>
          <button type="button" className={dedicated ? "" : "active"} aria-pressed={!dedicated} onClick={() => setParam("deploymentManifest", "shared")}>
            SHARED MANIFEST
          </button>
          <small>
            {dedicated
              ? `Charged ${logistics.nMissions} whole lander${logistics.nMissions === 1 ? "" : "s"} at ${formatQtyProse(params.M0leo, "kg")} in LEO each.`
              : `Charged its mass share: ${formatQtyProse(campaign.leoMassPerLandedKg, "kg", 4)} of LEO mass per kg landed.`}
          </small>
        </div>

        <div className="chart-well">
          <svg width={width} height={height} role="img" aria-label={`Cumulative LEO mass spent and saved over the campaign. ${status.headline}.`}>
            {phases.map((phase) => (
              <g key={phase.id}>
                <rect
                  className={`campaign-phase campaign-phase-${phase.id}`}
                  x={xDay(phase.from)}
                  y={margin.top}
                  width={Math.max(0, xDay(phase.to) - xDay(phase.from))}
                  height={height - margin.top - margin.bottom}
                />
                {xDay(phase.to) - xDay(phase.from) > 64 && (
                  <text className="axis-label" x={xDay(phase.from) + 4} y={margin.top - 6}>
                    {phase.label}
                  </text>
                )}
              </g>
            ))}
            {chart.yTicks.map((t) => (
              <g key={`y${t}`}>
                <line x1={margin.left} x2={width - margin.right} y1={chart.y(t)} y2={chart.y(t)} stroke="var(--earthshine)" strokeOpacity="0.22" />
                <text className="axis-label" x={margin.left - 8} y={chart.y(t) + 3} textAnchor="end">
                  {t === 0 ? "0" : `${formatQty(t, "kg").value} ${formatQty(t, "kg").unit}`}
                </text>
              </g>
            ))}
            {chart.xTicks.map((t) => (
              <text key={`x${t}`} className="axis-label" x={chart.x(t)} y={height - margin.bottom + 16} textAnchor="middle">
                {t} YR
              </text>
            ))}
            <path d={chart.spent} fill="none" stroke="var(--melt)" strokeWidth="2" />
            <path d={chart.saved} fill="none" stroke="var(--ok)" strokeWidth="2" />
            {campaign.paysBackInCampaign && campaign.paybackDays !== null && (
              <g>
                <line
                  x1={xDay(campaign.paybackDays)}
                  x2={xDay(campaign.paybackDays)}
                  y1={margin.top}
                  y2={height - margin.bottom}
                  stroke="var(--text-mid)"
                  strokeDasharray="3 3"
                />
                <text className="axis-label" x={xDay(campaign.paybackDays) + 5} y={margin.top + 12}>
                  PAYBACK
                </text>
              </g>
            )}
          </svg>
          <div className="campaign-legend mono" aria-hidden="true">
            <span className="campaign-key-spent">SPENT · LANDERS + SPARES{campaign.feedKgPerYear > 0 ? " + FEED" : ""}</span>
            <span className="campaign-key-saved">SAVED · {refuel === null ? "PRODUCT" : "PROPELLANT BURNED"} × GEAR RATIO</span>
          </div>
        </div>

        <p className="panel-caption">
          Both sides are mass in low Earth orbit. Spent is {dedicated ? "one full stack per infrastructure lander" : "the plant's share of each lander"},
          plus spares at {formatQtyProse(campaign.leoMassPerLandedKg, "kg/kg", 4)} per kg landed. Saved is{" "}
          {refuel === null ? "product delivered" : "the product the refuelled lander burns"} × gear ratio {params.gearRatio}. Production
          starts on day {Math.round(campaign.firstProductDay)}, after the last landing and {params.commissioningDays} days of
          commissioning, and averages {formatQtyProse(campaign.deliveredKgPerDay, "kg/day")} at{" "}
          {Math.round(params.plantAvailability * 100)}% availability
          {refuel === null
            ? "."
            : `, of which the lander burns ${formatQtyProse(campaign.usedKgPerDay, "kg/day")}, credited as each sortie flies, every ${Math.round(campaign.sortieIntervalDays ?? 0)} days.`}
          {refuel === null &&
            result.production.propellantKgPerDay > 0 &&
            ` Only propellant usable at O/F ${params.mixtureRatio} counts as product; the ${formatQtyProse(result.production.excessO2KgPerDay, "kg/day")} of surplus oxygen is not credited.`}
          {campaign.feedKgPerYear > 0 &&
            ` The Sabatier loop's CO₂ has no lunar source in this model, so its ${formatQtyProse(campaign.feedKgPerYear, "kg/yr")} is landed and charged like spares.`}
        </p>

        <div className="power-stats mono">
          <div>LANDERS <b className="num">{logistics.nMissions}</b></div>
          <div>DEPLOYMENT <b className="num">{formatQtyText(campaign.deploymentDays, "days")}</b></div>
          <div>FIRST PRODUCT <b className="num">DAY {Math.round(campaign.firstProductDay)}</b></div>
          <div>CAMPAIGN END <b className="num">DAY {Math.round(campaign.campaignEndDay)}</b></div>
          <div>SPARES <b className="num">{formatQtyText(campaign.resupplyKgPerYear, "kg/yr")}</b></div>
          {campaign.feedKgPerYear > 0 && (
            <div>IMPORTED CO₂ FEED <b className="num">{formatQtyText(campaign.feedKgPerYear, "kg/yr")}</b></div>
          )}
          <div>LANDED IN TOTAL <b className="num">{formatQtyText(campaign.landedMassKg, "kg")}</b></div>
          <div>PRODUCT <b className="num">{formatQtyText(campaign.cumulativeProductKg, "kg")}</b></div>
          {refuel !== null && <div>BURNED BY THE LANDER <b className="num">{formatQtyText(campaign.cumulativeUsedKg, "kg")}</b></div>}
          <div>LEO SPENT / SAVED <b className="num">{formatQtyText(campaign.leoMassSpentKg, "kg")} / {formatQtyText(campaign.leoMassSavedKg, "kg")}</b></div>
        </div>

        <p className="panel-caption">
          Leverage L ({logistics.leverageL.toFixed(0)}×) divides launch mass saved by mass <em>landed</em> and assumes full output
          from day one with no spares; this ledger prices the landing itself. It is a mass measure only: no cost, schedule risk,
          or mission loss.
        </p>

        <div className="panel-exports">
          <ExportButton
            label="CAMPAIGN CSV"
            what="campaign"
            title="The cumulative ledger every 30 days plus each landing, production start, payback, and campaign end"
            build={() => campaignCsv(campaignTimeline(params, result, 30))}
          />
        </div>
      </div>
      {refuel !== null && <RefuelDemand refuel={refuel} />}
    </>
  );
}
