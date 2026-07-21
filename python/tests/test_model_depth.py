from __future__ import annotations

import json

import pytest

from selene_isru import simulate, simulate_timeseries

PROFILE = json.dumps({
    "version": 1,
    "name": "Test ridge cycle",
    "points": [
        {"hour": 0, "illumination": 1, "receiverVisibility": 1, "surfaceTemperatureK": 210},
        {"hour": 8, "illumination": 0, "receiverVisibility": 0, "surfaceTemperatureK": 60},
        {"hour": 16, "illumination": 0, "receiverVisibility": 0.5, "surfaceTemperatureK": 50},
        {"hour": 24, "illumination": 1, "receiverVisibility": 1, "surfaceTemperatureK": 210},
    ],
})


def test_multi_stream_sabatier_storage() -> None:
    result = simulate({"site": "polar", "enableSabatier": True})
    inventories = result["cryo"]["inventories"]
    assert [item["stream"] for item in inventories] == ["water-ice", "lox", "lh2", "lch4", "co2-feed"]
    assert result["cryo"]["totalStorageMassKg"] == pytest.approx(sum(item["storageMassKg"] for item in inventories))
    assert result["cryo"]["totalReserveVolumeM3"] == pytest.approx(sum(item["volumeM3"] for item in inventories))
    assert result["cryo"]["totalConditioningPowerW"] == pytest.approx(sum(item["conditioningPowerW"] for item in inventories))


@pytest.mark.parametrize("params", [
    {"site": "equatorial", "enableSabatier": False},
    {"site": "polar", "enableSabatier": False},
    {"site": "polar", "enableSabatier": True},
])
def test_energy_nodes_conserve(params: dict) -> None:
    result = simulate(params)
    assert result["energy"]["gridAllocationResidualW"] == 0
    assert result["energy"]["maxAbsResidualW"] == 0
    assert all(item["residualW"] == 0 for item in result["energy"]["balances"])


def test_mre_voltage_and_electrode_decomposition() -> None:
    e = simulate({})["electrolysis"]
    assert e["reversibleVoltageV"] + e["activationOverpotentialV"] + e["ohmicOverpotentialV"] + e["concentrationOverpotentialV"] + e["unallocatedVoltageV"] == pytest.approx(e["cellVoltageV"])
    assert e["electrodeAreaM2"] == pytest.approx(e["currentA"] / e["jOperating_APerM2"])
    assert e["electricalInputW"] == pytest.approx(e["chemicalPowerW"] + e["modeledLossPowerW"])


def test_imported_profile_drives_time_series() -> None:
    params = {"site": "polar", "polarProfileMode": "profile", "polarProfileData": PROFILE}
    result = simulate(params)
    assert result["power"]["siteProfile"]["mode"] == "profile"
    assert result["power"]["siteProfile"]["averageIllumination"] == pytest.approx(1 / 3)
    assert result["power"]["siteProfile"]["averageDeliveredFraction"] == pytest.approx(1 / 4)
    assert result["power"]["siteProfile"]["averageDeliveredFraction"] != pytest.approx(
        result["power"]["siteProfile"]["averageIllumination"] * result["power"]["siteProfile"]["averageReceiverVisibility"]
    )
    time = simulate_timeseries(params, {"cycles": 1, "samplesPerCycle": 12})
    assert any(point["illumination"] < 0.05 for point in time["points"])
    assert any(point["receiverVisibility"] < 1 for point in time["points"])


def test_invalid_profile_falls_back_with_alarm() -> None:
    result = simulate({"site": "polar", "polarProfileMode": "profile", "polarProfileData": "{bad"})
    assert result["power"]["siteProfile"]["mode"] == "scalar"
    assert any(warning["id"] == "polar-profile-invalid" for warning in result["warnings"])
