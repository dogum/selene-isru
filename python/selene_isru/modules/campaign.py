from __future__ import annotations

import math
from typing import Any

DAYS_PER_YEAR = 365
# Landings marked one by one; beyond this the grid samples show the staircase.
MAX_LANDING_EVENTS = 100
# Regular samples per timeline, whatever step was asked for.
MAX_SAMPLES = 2000


def _capacity_kg(params: dict[str, Any], basis: dict[str, Any]) -> float:
    return params["etaPack"] * basis["payloadPerMissionKg"]


def _landing_interval_days(params: dict[str, Any]) -> float:
    return DAYS_PER_YEAR / params["landingsPerYear"]


def simulate_campaign(params: dict[str, Any], basis: dict[str, Any], flows: dict[str, Any]) -> dict[str, Any]:
    capacity = _capacity_kg(params, basis)
    # A lander that lands nothing deploys no plant: the ledger stays empty.
    deployable = capacity > 0
    leo_mass_per_landed_kg = params["M0leo"] / capacity if deployable else 0
    deployment_days = max(0, basis["nMissions"] - 1) * _landing_interval_days(params)
    first_product_day = deployment_days + params["commissioningDays"]
    operating_days = params["missionYears"] * DAYS_PER_YEAR
    campaign_end_day = first_product_day + operating_days
    delivered_kg_per_day = flows["productKgPerDay"] * params["plantAvailability"] if deployable else 0
    # Only product something uses saves launch mass.
    if not deployable:
        used_kg_per_day = 0
    elif flows["usedKgPerDay"] is None:
        used_kg_per_day = delivered_kg_per_day
    else:
        used_kg_per_day = flows["usedKgPerDay"]
    resupply_kg_per_year = params["sparesFracPerYear"] * basis["totalInfraMassKg"] if deployable else 0
    # Feed is consumed with production, so downtime reduces it too.
    feed_kg_per_year = flows["importedFeedKgPerDay"] * params["plantAvailability"] * DAYS_PER_YEAR if deployable else 0

    if params["deploymentManifest"] == "shared":
        infra_leo_kg = leo_mass_per_landed_kg * basis["totalInfraMassKg"]
    else:
        infra_leo_kg = basis["nMissions"] * params["M0leo"]
    saved_per_day = params["gearRatio"] * used_kg_per_day
    resupply_leo_per_day = leo_mass_per_landed_kg * (resupply_kg_per_year + feed_kg_per_year) / DAYS_PER_YEAR

    cumulative_product_kg = delivered_kg_per_day * operating_days
    cumulative_used_kg = used_kg_per_day * operating_days
    landed_mass_kg = basis["totalInfraMassKg"] + (resupply_kg_per_year + feed_kg_per_year) * params["missionYears"] if deployable else 0
    leo_mass_spent_kg = infra_leo_kg + resupply_leo_per_day * operating_days
    leo_mass_saved_kg = saved_per_day * operating_days
    payback_days = (
        first_product_day + infra_leo_kg / (saved_per_day - resupply_leo_per_day) if saved_per_day > resupply_leo_per_day else None
    )

    warnings: list[dict[str, Any]] = []
    if not deployable:
        warnings.append(
            {
                "id": "lander-no-payload",
                "severity": "alarm",
                "module": "logistics",
                "message": "The lander delivers no payload at these inputs, so the plant cannot be landed and the campaign ledger is empty.",
                "value": basis["payloadPerMissionKg"],
                "limit": 0,
            }
        )

    return {
        "leoMassPerLandedKg": leo_mass_per_landed_kg,
        "deploymentDays": deployment_days,
        "firstProductDay": first_product_day,
        "campaignEndDay": campaign_end_day,
        "deliveredKgPerDay": delivered_kg_per_day,
        "usedKgPerDay": used_kg_per_day,
        "resupplyKgPerYear": resupply_kg_per_year,
        "feedKgPerYear": feed_kg_per_year,
        "cumulativeProductKg": cumulative_product_kg,
        "cumulativeUsedKg": cumulative_used_kg,
        "landedMassKg": landed_mass_kg,
        "leoMassSpentKg": leo_mass_spent_kg,
        "leoMassSavedKg": leo_mass_saved_kg,
        "netLeoMassKg": leo_mass_saved_kg - leo_mass_spent_kg,
        "returnRatio": leo_mass_saved_kg / leo_mass_spent_kg if leo_mass_spent_kg > 0 else 0,
        "paybackDays": payback_days,
        "paysBackInCampaign": payback_days is not None and payback_days <= campaign_end_day,
        "warnings": warnings,
    }


def _landers_by(params: dict[str, Any], basis: dict[str, Any], t_days: float) -> int:
    if t_days < 0 or basis["nMissions"] == 0:
        return 0
    return min(basis["nMissions"], math.floor(t_days / _landing_interval_days(params) + 1e-9) + 1)


def _ledger_at(params: dict[str, Any], result: dict[str, Any], t_days: float, landers: int) -> dict[str, Any]:
    basis = result["logistics"]
    campaign = result["campaign"]
    capacity = _capacity_kg(params, basis)
    plant_landed_kg = min(basis["totalInfraMassKg"], landers * capacity) if capacity > 0 else 0
    operating_days = min(
        max(0, t_days - campaign["firstProductDay"]),
        campaign["campaignEndDay"] - campaign["firstProductDay"],
    )
    supplies_kg = (campaign["resupplyKgPerYear"] + campaign["feedKgPerYear"]) * operating_days / DAYS_PER_YEAR
    product_kg = campaign["deliveredKgPerDay"] * operating_days
    used_kg = campaign["usedKgPerDay"] * operating_days
    if params["deploymentManifest"] == "shared":
        plant_leo_kg = campaign["leoMassPerLandedKg"] * plant_landed_kg
    else:
        plant_leo_kg = landers * params["M0leo"]
    return {
        "tDays": t_days,
        "landers": landers,
        "landedMassKg": plant_landed_kg + supplies_kg,
        "productKg": product_kg,
        "usedKg": used_kg,
        "leoMassSpentKg": plant_leo_kg + campaign["leoMassPerLandedKg"] * supplies_kg,
        "leoMassSavedKg": params["gearRatio"] * used_kg,
    }


def campaign_at(params: dict[str, Any], result: dict[str, Any], t_days: float) -> dict[str, Any]:
    return _ledger_at(params, result, t_days, _landers_by(params, result["logistics"], t_days))


def campaign_timeline(params: dict[str, Any], result: dict[str, Any], step_days: float = 30) -> list[dict[str, Any]]:
    basis = result["logistics"]
    campaign = result["campaign"]
    points: list[dict[str, Any]] = []

    def add(t_days: float, event: str, landers: int | None = None) -> None:
        count = _landers_by(params, basis, t_days) if landers is None else landers
        points.append({**_ledger_at(params, result, t_days, count), "event": event})

    interval = _landing_interval_days(params)
    # A near-empty lander can need millions of landings: mark each one only
    # when there are few enough to draw, otherwise the first and the last.
    marked = range(basis["nMissions"]) if basis["nMissions"] <= MAX_LANDING_EVENTS else [0, basis["nMissions"] - 1]
    for i in marked:
        if i > 0:
            add(i * interval, f"before landing {i + 1}", i)
        add(i * interval, f"landing {i + 1}", i + 1)
    add(campaign["firstProductDay"], "production start")
    if campaign["paysBackInCampaign"] and campaign["paybackDays"] is not None:
        add(campaign["paybackDays"], "payback")
    add(campaign["campaignEndDay"], "campaign end")

    event_days = [point["tDays"] for point in points]
    step = max(1, step_days, campaign["campaignEndDay"] / MAX_SAMPLES)
    k = 0
    while k * step < campaign["campaignEndDay"]:
        t = float(k * step)
        if not any(abs(day - t) < 1e-9 for day in event_days):
            add(t, "")
        k += 1
    return sorted(points, key=lambda point: point["tDays"])
