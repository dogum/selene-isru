from __future__ import annotations

import pytest

from selene_isru import campaign_at, campaign_timeline, simulate
from selene_isru.normalize import normalize_params

CASES = [
    {},
    {"site": "polar"},
    {"targetKgPerDay": 10000, "landingsPerYear": 2},
    {"site": "polar", "targetKgPerDay": 10, "deploymentManifest": "shared"},
]


def run(overrides: dict) -> tuple[dict, dict]:
    params, _ = normalize_params(overrides)
    return params, simulate(params)


def assert_rel(actual: float, expected: float, rel: float) -> None:
    assert abs(actual - expected) <= max(1e-9, abs(expected) * rel)


@pytest.mark.parametrize("overrides", CASES)
def test_ledger_at_campaign_end_reproduces_totals(overrides: dict) -> None:
    params, result = run(overrides)
    campaign = result["campaign"]
    end = campaign_at(params, result, campaign["campaignEndDay"])
    assert_rel(end["productKg"], campaign["cumulativeProductKg"], 1e-12)
    assert_rel(end["landedMassKg"], campaign["landedMassKg"], 1e-12)
    assert_rel(end["leoMassSpentKg"], campaign["leoMassSpentKg"], 1e-12)
    assert_rel(end["leoMassSavedKg"], campaign["leoMassSavedKg"], 1e-12)


@pytest.mark.parametrize("overrides", CASES)
def test_saved_equals_spent_at_payback(overrides: dict) -> None:
    params, result = run(overrides)
    payback = result["campaign"]["paybackDays"]
    assert payback is not None
    at = campaign_at(params, result, payback)
    assert_rel(at["leoMassSavedKg"], at["leoMassSpentKg"], 1e-9)


def test_timeline_is_cumulative_and_marks_events() -> None:
    params, result = run({"targetKgPerDay": 10000, "landingsPerYear": 2})
    timeline = campaign_timeline(params, result, 60)
    for a, b in zip(timeline, timeline[1:]):
        assert b["tDays"] >= a["tDays"]
        assert b["leoMassSpentKg"] >= a["leoMassSpentKg"]
        assert b["leoMassSavedKg"] >= a["leoMassSavedKg"]
    events = [point["event"] for point in timeline if point["event"]]
    assert "production start" in events and "payback" in events
    assert events[-1] == "campaign end"


def test_shared_manifest_charges_mass_share() -> None:
    _, shared = run({"deploymentManifest": "shared"})
    _, dedicated = run({})
    campaign = shared["campaign"]
    assert_rel(campaign["leoMassSpentKg"], campaign["leoMassPerLandedKg"] * campaign["landedMassKg"], 1e-12)
    assert campaign["paybackDays"] < dedicated["campaign"]["paybackDays"]


def test_no_payload_lander_leaves_ledger_empty() -> None:
    _, result = run({"M0leo": 500_000, "dvTotal": 6500, "IspLander": 310, "MdryLander": 200_000})
    campaign = result["campaign"]
    assert campaign["leoMassSpentKg"] == 0 and campaign["leoMassSavedKg"] == 0
    assert campaign["paybackDays"] is None


def test_sabatier_lands_its_co2_feed() -> None:
    params, result = run({"site": "polar", "enableSabatier": True})
    production, campaign = result["production"], result["campaign"]
    products = production["o2KgPerDay"] + production["ch4KgPerDay"] + production["h2KgPerDay"]
    assert_rel(campaign["deliveredKgPerDay"], products * params["plantAvailability"], 1e-12)
    assert_rel(campaign["feedKgPerYear"], production["co2ImportedKgPerDay"] * params["plantAvailability"] * 365, 1e-12)
    assert campaign["paybackDays"] is None
