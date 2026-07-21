from __future__ import annotations

import pytest

from selene_isru import simulate


@pytest.mark.parametrize("params", [{"site": "equatorial"}, {"site": "polar"}, {"site": "polar", "enableSabatier": True}])
def test_material_nodes_conserve_reported_mass(params: dict) -> None:
    result = simulate(params)
    assert result["materials"]["balances"]
    assert result["materials"]["maxAbsResidualKgPerDay"] <= 1e-6


def test_complete_sabatier_ledger() -> None:
    production = simulate({"site": "polar", "enableSabatier": True})["production"]
    assert production["grossH2KgPerDay"] == pytest.approx(111.111111, rel=1e-6)
    assert production["o2KgPerDay"] == pytest.approx(888.888889, rel=1e-6)
    assert production["co2ImportedKgPerDay"] == pytest.approx(580.555556, rel=1e-6)
    assert production["ch4KgPerDay"] == pytest.approx(211.111111, rel=1e-6)
    assert production["waterRecycleKgPerDay"] == pytest.approx(475, rel=1e-6)
    assert production["h2KgPerDay"] == pytest.approx(5.555556, rel=1e-6)


def test_storage_operating_modes_are_exclusive() -> None:
    zero = simulate({"cryoControlMode": "zero-boiloff"})["cryo"]
    assert zero["qRemovedW"] == pytest.approx(zero["qLeakW"])
    assert zero["qResidualW"] == 0
    assert zero["boiloffKgPerDay"] == 0

    passive = simulate({"cryoControlMode": "passive"})["cryo"]
    assert passive["qRemovedW"] == 0
    assert passive["cryocoolerPowerW"] == 0
    assert passive["boiloffKgPerDay"] == pytest.approx(passive["unmitigatedBoiloffKgPerDay"])
