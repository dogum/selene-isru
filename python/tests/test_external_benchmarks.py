from __future__ import annotations

import json
from pathlib import Path

import pytest

from selene_isru import simulate
from selene_isru.constants import DEFAULTS
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
