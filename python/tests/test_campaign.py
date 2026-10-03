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


def test_near_empty_lander_keeps_timeline_bounded() -> None:
    import math

    from selene_isru.constants import c

    dv_total = 380 * c("g0") * math.log(1_100_000 / (200_000 + 20_000 + 0.05))
    params, result = run({"M0leo": 1_100_000, "IspLander": 380, "MdryLander": 200_000, "MresidProp": 20_000, "dvTotal": dv_total})
    assert result["logistics"]["nMissions"] > 1_000_000
    timeline = campaign_timeline(params, result, 30)
    assert len(timeline) <= 2010
    assert len([point for point in timeline if point["event"].startswith("landing ")]) == 2


def test_storage_losses_are_not_delivered() -> None:
    params, result = run({"cryoControlMode": "passive"})
    lost = sum(inventory["actualLossKgPerDay"] for inventory in result["cryo"]["inventories"])
    assert lost > 10
    assert_rel(result["campaign"]["deliveredKgPerDay"], (result["production"]["o2KgPerDay"] - lost) * params["plantAvailability"], 1e-12)


def test_co2_storage_what_if_is_feed_only_with_sabatier() -> None:
    params, result = run({"site": "polar", "enableSabatier": True, "cryoControlMode": "passive", "storageStream": "co2-feed"})
    lost = result["cryo"]["inventories"][0]["actualLossKgPerDay"]
    expected_feed = (result["production"]["co2ImportedKgPerDay"] + lost) * params["plantAvailability"] * 365
    assert_rel(result["campaign"]["feedKgPerYear"], expected_feed, 1e-12)
    _, equatorial = run({"cryoControlMode": "passive", "storageStream": "co2-feed"})
    assert equatorial["campaign"]["feedKgPerYear"] == 0


def test_sabatier_buffer_loss_slows_the_loop() -> None:
    params, result = run({"site": "polar", "enableSabatier": True, "cryoControlMode": "passive"})
    production, inventories = result["production"], result["cryo"]["inventories"]
    buffer_lost = next(i["actualLossKgPerDay"] for i in inventories if i["role"] == "buffer")
    product_lost = sum(i["actualLossKgPerDay"] for i in inventories if i["role"] == "product")
    feed_lost = next(i["actualLossKgPerDay"] for i in inventories if i["role"] == "feed")
    assert buffer_lost > 1
    throughput = 1 - buffer_lost / production["waterKgPerDay"]
    gross = production["o2KgPerDay"] + production["ch4KgPerDay"] + production["h2KgPerDay"]
    assert_rel(result["campaign"]["deliveredKgPerDay"], (gross * throughput - product_lost) * params["plantAvailability"], 1e-12)
    expected_feed = (production["co2ImportedKgPerDay"] * throughput + feed_lost) * params["plantAvailability"] * 365
    assert_rel(result["campaign"]["feedKgPerYear"], expected_feed, 1e-12)


def test_propellant_losses_reduce_usable_propellant() -> None:
    params, result = run({"site": "polar", "polarProduct": "propellant", "cryoControlMode": "passive"})
    production = result["production"]

    def lost(stream: str) -> float:
        return next(i["actualLossKgPerDay"] for i in result["cryo"]["inventories"] if i["stream"] == stream)

    assert lost("water-ice") > 0
    throughput = 1 - lost("water-ice") / production["waterKgPerDay"]
    o2 = production["o2KgPerDay"] * throughput - lost("lox")
    h2 = production["h2KgPerDay"] * throughput - lost("lh2")
    ratio = params["mixtureRatio"]
    usable = min(o2, ratio * h2) + min(h2, o2 / ratio)
    assert_rel(result["campaign"]["deliveredKgPerDay"], usable * params["plantAvailability"], 1e-12)
