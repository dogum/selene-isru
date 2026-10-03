from __future__ import annotations

import math

import pytest

from selene_isru import refuel_timeline, simulate, sortie_propellant_kg
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
