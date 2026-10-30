from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from selene_isru import fission_efficiency, radiator_m2_per_kw, simulate
from selene_isru.constants import DEFAULTS, PARAM_META, c
from selene_isru.modules.electrolysis import sec_elec_j_per_kg
from selene_isru.modules.thermal import sec_sub_j_per_kg

ROOT = Path(__file__).resolve().parents[2]
SUITE = json.loads((ROOT / "packages" / "engine" / "test" / "fixtures" / "external-benchmarks.json").read_text(encoding="utf-8"))
J_PER_KWH = 3_600_000


def item(benchmark_id: str) -> dict:
    return next(row for row in SUITE["benchmarks"] if row["id"] == benchmark_id)


def assert_benchmark(actual: float, benchmark_id: str) -> None:
    row = item(benchmark_id)
    assert actual == pytest.approx(row["expected"], rel=row["relativeTolerance"])


def test_faraday_anchor() -> None:
    row = item("faraday-o2-default")
    assert_benchmark(sec_elec_j_per_kg(row["inputs"]["cellVoltageV"], row["inputs"]["currentEfficiency"]) / J_PER_KWH, row["id"])


@pytest.mark.parametrize("benchmark_id", ["polar-sublimation-5wt", "polar-sublimation-0p5wt"])
def test_sublimation_anchors(benchmark_id: str) -> None:
    row = item(benchmark_id)
    values = row["inputs"]
    assert_benchmark(sec_sub_j_per_kg(values["iceMassFraction"], values["regolithHeatCapacity"], values["startTemperatureK"], values["sublimationTemperatureK"]) / J_PER_KWH, benchmark_id)


def test_site_profile_anchor_and_open_mli_status() -> None:
    expected = item("shackleton-rim-profile")["expected"]
    assert DEFAULTS["polarIlluminationFraction"] == expected["illuminationFraction"]
    assert DEFAULTS["polarLongestShadowHours"] == expected["longestShadowHours"]
    assert item("mli-layer-density-units")["kind"] == "open"


def test_polar_defaults_inside_best_site_darkness_range() -> None:
    expected = item("connecting-ridge-best-site")["expected"]
    assert DEFAULTS["polarLongestShadowHours"] <= expected["longestDarknessDaysMax"] * 24
    assert DEFAULTS["polarIlluminationFraction"] < expected["illuminationFraction2m"]


def test_polar_extraction_calibration_reproduces_nasa_baseline() -> None:
    row = item("kleinhenz-paz-2020-polar-water")
    result = simulate({"site": "polar", **row["inputs"]})
    thermal = result["thermal"]
    heater_power_kw = (thermal["secSub_JPerKg"] + thermal["heaterLoss_JPerKg"]) * row["inputs"]["targetKgPerDay"] / 86_400 / 1000
    assert thermal["extractorMassKg"] == pytest.approx(row["expected"]["extractorMassKg"], rel=row["relativeTolerance"])
    assert heater_power_kw == pytest.approx(row["expected"]["heaterPowerKW"], rel=row["relativeTolerance"])


def test_polar_propellant_calibration_reproduces_nasa_baseline() -> None:
    row = item("kleinhenz-paz-2020-polar-propellant")
    result = simulate({"site": "polar", "polarProduct": "propellant", **row["inputs"]})
    streams = {inventory["stream"]: inventory for inventory in result["cryo"]["inventories"]}
    plant = next(entry["massKg"] for entry in result["logistics"]["manifest"] if entry["subsystem"] == "reactor/plant")
    electrolysis = next(entry for entry in result["energy"]["balances"] if entry["id"] == "water-electrolysis-energy")
    actual = {
        "electrolysisPowerKW": electrolysis["electricalInputW"] / 1000,
        "h2LiquefactionPowerKW": streams["lh2"]["conditioningPowerW"] / 1000,
        "o2LiquefactionPowerKW": streams["lox"]["conditioningPowerW"] / 1000,
        "electrolyzerMassKg": plant - result["thermal"]["extractorMassKg"],
        "h2LiquefierMassKg": streams["lh2"]["liquefierMassKg"],
        "o2LiquefierMassKg": streams["lox"]["liquefierMassKg"],
    }
    for key, value in row["expected"].items():
        assert actual[key] == pytest.approx(value, rel=row["relativeTolerance"]), key


def test_fission_radiator_mass_per_area_from_nasa_fsp() -> None:
    row = item("mason-2008-fsp-radiator")
    assert row["kind"] == "calibration"
    i = row["inputs"]
    fsp_area_m2 = i["radiatingAreaWithMarginM2"] / (1 + i["areaMargin"])
    areal = i["heatRejectionMassKg"] / fsp_area_m2
    assert areal == pytest.approx(row["expected"], rel=0.001)
    assert DEFAULTS["kRadiatorKgPerM2"] == pytest.approx(areal, rel=0.002)
    fsp = {
        "Tsource": i["stirlingHotK"],
        "Tsink": i["radiatorEffectiveK"],
        "Tenv": i["sinkK"],
        "etaMech": i["grossPowerKwe"] / i["reactorThermalKw"] / (1 - i["radiatorEffectiveK"] / i["stirlingHotK"]),
    }
    area_m2 = radiator_m2_per_kw({**DEFAULTS, **fsp}) * i["userPowerKwe"]
    assert area_m2 == pytest.approx(fsp_area_m2, rel=0.05)
    assert area_m2 * DEFAULTS["kRadiatorKgPerM2"] == pytest.approx(i["heatRejectionMassKg"], rel=0.05)
    fsp_reactor_share = i["reactorMassKg"] / (i["reactorMassKg"] + i["conversionMassKg"] + i["powerManagementMassKg"])
    reactor_per_kwe = DEFAULTS["kReactorKgPerKwt"] / fission_efficiency(DEFAULTS)
    assert reactor_per_kwe / (reactor_per_kwe + DEFAULTS["kConversionKgPerKwe"]) == pytest.approx(fsp_reactor_share, rel=0.005)
    power = simulate(fsp)["power"]
    assert power["radiatorMassKg"] == pytest.approx(power["radiatorM2"] * DEFAULTS["kRadiatorKgPerM2"], rel=1e-12)


def test_electrolysis_bop_against_doe_pem_targets() -> None:
    row = item("doe-pem-electrolysis-bop")
    assert row["kind"] == "documentation-only"
    i = row["inputs"]
    bop = [
        i["system2022KWhPerKg"] / i["stack2022KWhPerKg"] - 1,
        i["system2026KWhPerKg"] / i["stack2026KWhPerKg"] - 1,
        i["systemUltimateKWhPerKg"] / i["stackUltimateKWhPerKg"] - 1,
    ]
    assert bop[0] == pytest.approx(row["expected"], rel=0.01)
    assert all(0.05 < value < DEFAULTS["fElectrolysisBop"] for value in bop)
    assert DEFAULTS["fElectrolysisBop"] / bop[0] < 2
    stack_only = simulate({"site": "polar", "polarProduct": "propellant", "targetKgPerDay": 67.26, "fElectrolysisBop": 0})
    stack = next(entry for entry in stack_only["energy"]["balances"] if entry["id"] == "water-electrolysis-energy")
    assert stack["electricalInputW"] / 1000 * (1 + DEFAULTS["fElectrolysisBop"]) == pytest.approx(17.5, rel=0.005)
    with_bop = simulate({"site": "polar", "polarProduct": "propellant", "targetKgPerDay": 67.26})
    full = next(entry for entry in with_bop["energy"]["balances"] if entry["id"] == "water-electrolysis-energy")
    assert full["usefulOutputW"] == pytest.approx(stack["usefulOutputW"], rel=1e-12)
    assert full["rejectedHeatW"] - stack["rejectedHeatW"] == pytest.approx(
        full["electricalInputW"] - stack["electricalInputW"], rel=1e-9
    )
    assert full["residualW"] == 0


def test_polar_excavation_compares_with_nasa_mine() -> None:
    row = item("kleinhenz-paz-2020-polar-excavation")
    assert row["kind"] == "documentation-only"
    expected = row["expected"]
    excavation = simulate({"site": "polar", **row["inputs"]})["excavation"]
    assert excavation["soilMovedKgPerDay"] == pytest.approx(67.26 / (0.05 * 0.75) * 1.667, rel=1e-12)
    # The model lands the study's two whole RASSORs (v0.12); its 20% growth margin closes the gap.
    assert excavation["excavatorCount"] == 2
    assert excavation["fleetMassKg"] == 132
    assert excavation["fleetMassKg"] * 1.2 == pytest.approx(expected["excavatorMassKg"], rel=0.05)
    mining_power_w = DEFAULTS["eMining"] * excavation["soilMovedKgPerDay"] / 86_400
    assert 0.5 < mining_power_w / expected["excavatorPowerW"] < 2


def test_sabatier_block_from_nasa_mars_plant() -> None:
    block = item("kleinhenz-paz-2017-sabatier-block")
    assert block["kind"] == "calibration"
    i = block["inputs"]
    methane = i["methaneKg"] / i["productionDays"]
    derived = (i["atmosphereProcessingKg"] + i["methaneDryerKg"]) / methane
    assert derived == pytest.approx(block["expected"], rel=block["relativeTolerance"])
    assert DEFAULTS["kLiquefierCh4"] == pytest.approx(i["methaneLiquefactionKg"] / methane, rel=0.05)
    assert DEFAULTS["kSabatierMass"] == pytest.approx(block["expected"], rel=block["relativeTolerance"])
    reactor = item("pnnl-2005-sabatier-reactor")
    r = reactor["inputs"]
    reactor_methane = r["propellantKg"] / (1 + r["oxygenToMethane"]) / r["productionDays"]
    assert r["reactorKg"] / reactor_methane == pytest.approx(reactor["expected"], rel=0.05)
    assert PARAM_META["kSabatierMass"]["min"] < reactor["expected"]
    result = simulate({"site": "polar", "enableSabatier": True})
    plant = next(row["massKg"] for row in result["logistics"]["manifest"] if row["subsystem"] == "reactor/plant")
    expected = (
        result["thermal"]["extractorMassKg"]
        + DEFAULTS["kElectrolyzerMass"] * DEFAULTS["targetKgPerDay"]
        + DEFAULTS["kSabatierMass"] * result["production"]["ch4KgPerDay"]
    )
    assert plant == pytest.approx(expected, rel=1e-12)
    store = next(item for item in result["cryo"]["inventories"] if item["stream"] == "lch4")
    assert store["liquefierMassKg"] == pytest.approx(DEFAULTS["kLiquefierCh4"] * result["production"]["ch4KgPerDay"], rel=1e-12)


def test_one_rassor_moves_guerrero_zabel_rate() -> None:
    row = item("guerrero-zabel-2023-rassor-rate")
    assert row["kind"] == "calibration"
    for key, value in row["inputs"].items():
        assert DEFAULTS[key] == value, key
    excavation = simulate(row["inputs"])["excavation"]
    assert excavation["excavatorTripsPerDay"] == 34
    assert excavation["excavatorKgPerDay"] == pytest.approx(row["expected"], rel=row["relativeTolerance"])


def test_ilmenite_bed_mass_reproduces_eagle_no_separation_trade() -> None:
    row = item("eagle-1988-no-separation-trade")
    inputs = row["inputs"]

    def reactor(grade: float) -> float:
        result = simulate(
            {
                "equatorialProcess": "ilmenite",
                "targetKgPerDay": inputs["targetKgPerDay"],
                "fIlmenite": inputs["soilGrade"],
                "ilmConcentrateGrade": grade,
            }
        )
        return result["ilmenite"]["reactorMassKg"]

    assert_benchmark(reactor(inputs["soilGrade"]) - reactor(inputs["concentrateGrade"]), row["id"])


def test_ilmenite_activation_energy_default_and_range() -> None:
    expected = item("ilmenite-reduction-activation-energy")["expected"]
    assert DEFAULTS["EaIlmReduction"] / 1000 == pytest.approx(expected["zhaoShadmanKJPerMol"], abs=0.05)
    from_times = c("R") * math.log(2 / 0.25) / (1 / 873 - 1 / 1073) / 1000
    assert from_times == pytest.approx(expected["eagleCitedTimesKJPerMol"], rel=0.005)
    from_equilibrium = c("R") * math.log(10.5 / 7) / (1 / 1173 - 1 / 1273) / 1000
    assert from_equilibrium == pytest.approx(expected["gasLimitedBedKJPerMol"], rel=0.01)
    bounds = PARAM_META["EaIlmReduction"]
    for value in (from_equilibrium, from_times, expected["zhaoShadmanKJPerMol"], expected["briggsSaccoKJPerMol"]):
        assert bounds["min"] <= value * 1000 <= bounds["max"]


def test_basalt_chain_reproduces_eagle_basalt_plants() -> None:
    row = item("eagle-1988-basalt-feed")
    o2 = row["inputs"]["runningO2KgPerDay"]
    ilmenite = simulate({"equatorialProcess": "ilmenite", "ilmFeed": "basalt", "targetKgPerDay": o2})["ilmenite"]
    actual = {
        "basaltFedPerKgO2": ilmenite["basaltFedKgPerDay"] / o2,
        "minedPerKgO2": ilmenite["soilPerKgO2"],
        "beneficiationKW": ilmenite["secBeneficiation_JPerKg"] * o2 / 86_400 / 1000,
        "beneficiationMassKg": ilmenite["beneficiationMassKg"],
    }
    for key, value in row["expected"].items():
        assert actual[key] == pytest.approx(value, rel=row["relativeTolerance"]), key


def test_basalt_against_soil_power_ratio() -> None:
    expected = item("eagle-1988-basalt-vs-soil")["expected"]

    def run(feed: str) -> dict:
        return simulate({"equatorialProcess": "ilmenite", "ilmFeed": feed, "targetKgPerDay": 3044.1})

    soil, basalt = run("soil"), run("basalt")
    assert basalt["energy"]["gridPowerW"] / soil["energy"]["gridPowerW"] == pytest.approx(expected["powerRatio"], rel=0.05)
    ratio = basalt["logistics"]["totalInfraMassKg"] / soil["logistics"]["totalInfraMassKg"]
    assert expected["landedMassRatio"] < ratio < 1
