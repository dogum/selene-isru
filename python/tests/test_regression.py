from __future__ import annotations

from selene_isru import sample_uncertainty, simulate, simulate_timeseries
from selene_isru.constants import DEFAULTS
from selene_isru.modules.construction import shield_full_balance_m, simulate_construction
from selene_isru.modules.electrolysis import melt_heat_j_per_kg, oxide_model_yield, sec_elec_j_per_kg
from selene_isru.modules.logistics import payload_per_mission_kg
from selene_isru.modules.power import p_crit_kw, simulate_power
from selene_isru.modules.sabatier import sabatier_kp
from selene_isru.modules.thermal import sec_sub_j_per_kg

J_PER_KWH = 3_600_000


def assert_rel(actual: float, expected: float, rel_tol: float) -> None:
    assert abs(actual - expected) <= abs(expected) * rel_tol


def warning_ids(result: dict) -> set[str]:
    return {warning["id"] for warning in result["warnings"]}


def test_regression_anchors() -> None:
    result = simulate({})

    assert_rel(sec_elec_j_per_kg(4.2, 0.9) / J_PER_KWH, 15.63, 0.005)
    assert_rel(result["electrolysis"]["xO2Effective"], 0.225, 1e-9)
    assert_rel(
        sum(row["o2KgPerKg"] for row in result["electrolysis"]["oxideYield"]),
        result["electrolysis"]["xO2Effective"],
        1e-12,
    )
    assert all(row["decomposed"] for row in result["electrolysis"]["oxideYield"])
    assert_rel(melt_heat_j_per_kg(DEFAULTS), 2_099_805, 1e-9)
    assert_rel(result["energy"]["secTotal_kWhPerKg"], 24.7, 0.03)
    assert_rel(result["energy"]["gridPowerW"] / 1000, 1030, 0.03)
    assert_rel(p_crit_kw(1500, 250, 30), 6.818, 0.001)
    assert_rel(sec_sub_j_per_kg(0.005, 800, 40, 263) / J_PER_KWH, 10.7, 0.01)
    assert_rel(sec_sub_j_per_kg(0.05, 800, 40, 263) / J_PER_KWH, 1.78, 0.01)
    assert result["logistics"]["nMissions"] == 1
    assert result["logistics"]["totalInfraMassKg"] / 1000 == result["logistics"]["plantMassThroughputDays"]
    assert 55 <= result["logistics"]["plantMassThroughputDays"] <= 62
    assert_rel(shield_full_balance_m(101325, 3000), 20.85, 0.005)
    assert 95_000 <= payload_per_mission_kg(DEFAULTS) <= 107_000
    assert 1.8 <= result["construction"]["padsPerYear"] <= 2.2
    assert sabatier_kp(523) > sabatier_kp(723) > 0


def test_v1_aggregate_electrolysis_path_stays_reachable() -> None:
    fallback = simulate({"oxideModel": False})
    direct = oxide_model_yield({**DEFAULTS, "oxideModel": False})
    assert_rel(fallback["electrolysis"]["xO2Effective"], DEFAULTS["xO2"] * DEFAULTS["fExtract"], 1e-12)
    assert fallback["electrolysis"]["xO2Effective"] == direct["xO2Effective"]
    assert_rel(fallback["energy"]["secTotal_kWhPerKg"], simulate({})["energy"]["secTotal_kWhPerKg"], 1e-9)


def test_timeseries_solar_selected_cycle_anchor() -> None:
    solar_params = {
        "targetKgPerDay": 10,
        "MshieldKg": 8000,
        "Rarray": 5,
        "SEstorage": 1500,
        "alphaSpecific": 90,
    }
    result = simulate_timeseries(solar_params, {"cycles": 1, "samplesPerCycle": 12})
    assert len(result["points"]) == 13
    assert_rel(result["summary"]["minSoC"], 1 - DEFAULTS["DoD"], 1e-12)
    assert_rel(result["summary"]["dutyCycle"], 1, 1e-12)
    assert_rel(result["summary"]["curtailedFraction"], 0, 1e-12)
    assert result["summary"]["tankPeakKg"] > 0


def test_fixed_seed_uncertainty_anchor() -> None:
    result = sample_uncertainty(
        {},
        [{"key": "targetKgPerDay", "rel": 0.08}, {"key": "eMining", "rel": 0.15}],
        {"n": 32, "seed": 42},
    )
    assert result["plantMassThroughputDays"]["p10"] <= result["plantMassThroughputDays"]["p50"] <= result["plantMassThroughputDays"]["p90"]
    assert result["secTotal"]["p10"] <= result["secTotal"]["p50"] <= result["secTotal"]["p90"]
    assert_rel(result["plantMassThroughputDays"]["p50"], 58.93253207974891, 1e-12)
    assert_rel(result["secTotal"]["p50"], 24.777402251765626, 1e-12)


def test_public_warning_paths() -> None:
    assert "anode-current" in warning_ids(simulate({"jOperating": 10000, "Dox": 1e-11}))
    assert "thermal-stress" in warning_ids(simulate({"castDeltaT": 200}))
    assert "param-clamped" in warning_ids(simulate({"targetKgPerDay": 1}))


def test_direct_warning_branches_unreachable_by_bounded_public_params() -> None:
    params = dict(DEFAULTS)
    params.update({"rhoGasPlume": 0.1, "vGasPlume": 4000, "Cf": 0.02, "tauAllowable": 100, "FS": 4})
    construction = simulate_construction(params, 1000)
    assert "pad-shear" in {warning["id"] for warning in construction["warnings"]}

    power_params = dict(DEFAULTS)
    power_params.update({"alphaSpecific": 1000})
    power = simulate_power(power_params, 1000)
    assert "beta-le-alpha" in {warning["id"] for warning in power["warnings"]}
