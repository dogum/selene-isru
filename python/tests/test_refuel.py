from __future__ import annotations

import math

import pytest

from selene_isru import campaign_at, campaign_timeline, refuel_timeline, simulate, sortie_propellant_kg
from selene_isru.constants import c
from selene_isru.normalize import normalize_params

EQUATORIAL = {"refuelDemand": "lander"}
PROPELLANT = {"site": "polar", "polarProduct": "propellant", "refuelDemand": "lander"}


def run(overrides: dict) -> tuple[dict, dict]:
    params, _ = normalize_params(overrides)
    return params, simulate(params)


def assert_rel(actual: float, expected: float, rel: float) -> None:
    assert abs(actual - expected) <= max(1e-9, abs(expected) * rel)


def test_each_leg_closes_the_rocket_equation() -> None:
    params, _ = run(EQUATORIAL)
    sortie = sortie_propellant_kg(params)

    def mass_ratio(dv: float) -> float:
        return math.exp(dv / (params["IspReusable"] * c("g0")))

    landed = params["MdryReusable"] + params["McargoDown"]
    assert_rel((landed + sortie["descentKg"]) / landed, mass_ratio(params["dvDescent"]), 1e-12)
    at_orbit = params["MdryReusable"] + params["McargoUp"] + sortie["descentKg"]
    assert_rel((at_orbit + sortie["ascentKg"]) / at_orbit, mass_ratio(params["dvAscent"]), 1e-12)
    assert_rel(sortie["oxidizerKg"] / sortie["fuelKg"], params["mixtureRatio"], 1e-12)


@pytest.mark.parametrize(
    "overrides",
    [EQUATORIAL, {**EQUATORIAL, "sortiesPerYear": 20}, PROPELLANT, {**PROPELLANT, "sortiesPerYear": 8}],
)
def test_plant_supplies_each_component_up_to_its_demand(overrides: dict) -> None:
    _, result = run(overrides)
    refuel = result["refuel"]
    assert refuel["isruO2KgPerDay"] == min(refuel["supplyO2KgPerDay"], refuel["demandO2KgPerDay"])
    assert refuel["isruFuelKgPerDay"] == min(refuel["supplyH2KgPerDay"], refuel["demandFuelKgPerDay"])
    demand = refuel["demandO2KgPerDay"] + refuel["demandFuelKgPerDay"]
    assert_rel(refuel["usedKgPerDay"] + refuel["earthPropellantKgPerYear"] / 365, demand, 1e-12)
    assert result["campaign"]["usedKgPerDay"] == refuel["usedKgPerDay"]


def test_stores_hold_one_sortie_load() -> None:
    _, result = run(PROPELLANT)
    stores = {i["stream"]: i for i in result["cryo"]["inventories"]}
    assert stores["lox"]["reserveInventoryKg"] >= result["refuel"]["oxidizerPerSortieKg"]
    assert stores["lh2"]["reserveInventoryKg"] == result["refuel"]["fuelPerSortieKg"]


@pytest.mark.parametrize("site", [{"site": "polar"}, {"site": "polar", "enableSabatier": True}])
def test_demand_is_inert_without_lander_propellant(site: dict) -> None:
    _, without = run(site)
    _, with_demand = run({**site, "refuelDemand": "lander", "sortiesPerYear": 12})
    assert with_demand["refuel"] is None
    assert with_demand == without


def test_drawdown_draws_the_demand_use() -> None:
    params, result = run({**PROPELLANT, "sortiesPerYear": 8, "McargoDown": 5000})
    refuel = result["refuel"]
    timeline = refuel_timeline(params, result)
    befores = [p for p in timeline if p["event"].startswith("before sortie")]
    afters = [p for p in timeline if p["event"].startswith("sortie ")]
    interval = 365 / params["sortiesPerYear"]
    assert len(befores) == len(afters) > 1
    for before, after in list(zip(befores, afters))[1:]:
        assert_rel(before["o2Kg"] - after["o2Kg"], refuel["isruO2KgPerDay"] * interval, 1e-9)
        assert_rel(before["h2Kg"] - after["h2Kg"], refuel["isruFuelKgPerDay"] * interval, 1e-9)


@pytest.mark.parametrize("stream", ["custom", "lh2", "lox"])
def test_what_if_store_holds_the_whole_product_load(stream: str) -> None:
    _, equatorial = run({**EQUATORIAL, "storageStream": stream})
    assert equatorial["cryo"]["inventories"][0]["reserveInventoryKg"] == equatorial["refuel"]["oxidizerPerSortieKg"]
    _, propellant = run({**PROPELLANT, "storageStream": stream})
    load = propellant["refuel"]["oxidizerPerSortieKg"] + propellant["refuel"]["fuelPerSortieKg"]
    assert_rel(propellant["cryo"]["inventories"][0]["reserveInventoryKg"], load, 1e-12)


@pytest.mark.parametrize("stream", ["custom", "lox", "lh2"])
def test_one_stream_store_shares_its_capacity_in_the_drawdown(stream: str) -> None:
    params, result = run({**PROPELLANT, "storageStream": stream, "reserveDays": 120})
    refuel = result["refuel"]
    capacity = result["cryo"]["inventories"][0]["reserveInventoryKg"]
    load = refuel["oxidizerPerSortieKg"] + refuel["fuelPerSortieKg"]
    assert capacity > 2 * load
    timeline = refuel_timeline(params, result)
    assert all(p["o2Kg"] + p["h2Kg"] <= capacity * (1 + 1e-12) for p in timeline)
    before = next(p for p in timeline if p["event"] == "before sortie 1")
    after = next(p for p in timeline if p["event"] == "sortie 1")
    assert_rel(before["o2Kg"], capacity * refuel["oxidizerPerSortieKg"] / load, 1e-12)
    assert_rel(before["h2Kg"], capacity * refuel["fuelPerSortieKg"] / load, 1e-12)
    assert_rel(after["o2Kg"], before["o2Kg"] - refuel["oxidizerPerSortieKg"], 1e-12)
    assert_rel(after["h2Kg"], before["h2Kg"] - refuel["fuelPerSortieKg"], 1e-12)


def test_campaign_shorter_than_a_sortie_interval_credits_nothing() -> None:
    _, result = run({**EQUATORIAL, "missionYears": 1, "sortiesPerYear": 0.5})
    assert result["campaign"]["cumulativeUsedKg"] == 0
    assert result["campaign"]["paysBackInCampaign"] is False


def test_only_whole_sorties_count() -> None:
    _, result = run({**EQUATORIAL, "sortiesPerYear": 0.5})
    campaign = result["campaign"]
    assert_rel(campaign["cumulativeUsedKg"], 2 * campaign["usedKgPerDay"] * campaign["sortieIntervalDays"], 1e-12)


@pytest.mark.parametrize("overrides", [{**EQUATORIAL, "sortiesPerYear": 9}, {**PROPELLANT, "sortiesPerYear": 8, "McargoDown": 5000}])
def test_payback_falls_on_the_first_sortie_that_clears_the_spend(overrides: dict) -> None:
    params, result = run(overrides)
    campaign = result["campaign"]
    k = (campaign["paybackDays"] - campaign["firstProductDay"]) / campaign["sortieIntervalDays"]
    assert abs(k - round(k)) < 1e-9
    at = campaign_at(params, result, campaign["paybackDays"])
    previous = campaign_at(params, result, campaign["paybackDays"] - campaign["sortieIntervalDays"])
    assert at["leoMassSavedKg"] >= at["leoMassSpentKg"] * (1 - 1e-12)
    assert previous["leoMassSavedKg"] < previous["leoMassSpentKg"]


def test_every_sortie_is_marked_at_the_highest_cadence() -> None:
    params, result = run({**EQUATORIAL, "sortiesPerYear": 52, "missionYears": 20})
    timeline = campaign_timeline(params, result)
    sorties = [p for p in timeline if p["event"].startswith("sortie ")]
    assert len(sorties) == 1040
    assert_rel(sorties[-1]["usedKg"], result["campaign"]["cumulativeUsedKg"], 1e-12)

