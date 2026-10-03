import type { CampaignResult } from "@selene-isru/engine";

export interface CampaignStatus {
  /** short line for headers, e.g. "PAYS BACK ON DAY 242" */
  headline: string;
  /** card value */
  payback: string;
  /** card subtitle */
  paybackDetail: string;
}

function years(days: number): string {
  return `${(days / 365).toFixed(days < 365 ? 2 : 1)} yr`;
}

/** Words for the engine's payback result; no arithmetic beyond unit display. */
export function campaignStatus(campaign: CampaignResult): CampaignStatus {
  const { paybackDays } = campaign;
  if (campaign.paysBackInCampaign && paybackDays !== null) {
    const day = Math.round(paybackDays);
    return {
      headline: `PAYS BACK ON DAY ${day}`,
      payback: `DAY ${day}`,
      paybackDetail: `${years(paybackDays)} after the first landing`
    };
  }
  if (campaign.leoMassSpentKg === 0) {
    return { headline: "NOTHING CAN BE LANDED", payback: "—", paybackDetail: "The lander delivers no payload at these inputs" };
  }
  if (paybackDays !== null) {
    return {
      headline: "NO PAYBACK WITHIN THE CAMPAIGN",
      payback: "NOT IN CAMPAIGN",
      paybackDetail: `Would need day ${Math.round(paybackDays).toLocaleString("en-US")} (${years(paybackDays)})`
    };
  }
  return {
    headline: "NEVER PAYS BACK",
    payback: "NEVER",
    paybackDetail:
      campaign.feedKgPerYear > 0
        ? "Spares and imported feed cost more LEO mass than the product saves"
        : "Spares cost more LEO mass than the product saves"
  };
}
