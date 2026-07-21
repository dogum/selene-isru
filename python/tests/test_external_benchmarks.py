from __future__ import annotations

import json
from pathlib import Path

import pytest

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
