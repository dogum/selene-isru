from __future__ import annotations

import pytest

from selene_isru import DEFAULTS, ilmenite_oxygen_fraction, simulate
from selene_isru.modules.construction import simulate_construction
from selene_isru.normalize import normalize_params

ILMENITE = {"equatorialProcess": "ilmenite"}


def assert_rel(actual: float, expected: float, rel: float) -> None:
    assert abs(actual - expected) <= max(1e-9, abs(expected) * rel)


def test_soil_chain_reproduces_eagle_table_6_1() -> None:
    ilmenite = simulate(ILMENITE)["ilmenite"]
    assert_rel(1 / ilmenite_oxygen_fraction(), 9.484, 1e-3)
    assert_rel(ilmenite["sizedSoilKgPerDay"] / 1000, 143.38, 2e-3)
    assert_rel(ilmenite["soilPerKgO2"], 326.82, 2e-3)
    assert_rel(ilmenite["concentrateKgPerDay"] / 1000 * 0.9, 10.54, 1e-3)


@pytest.mark.parametrize(
    "overrides",
    [{}, {"fIlmenite": 0.005, "targetKgPerDay": 20000}, {"ilmConcentrateGrade": 0.1}],
)
def test_every_node_conserves_mass_and_energy(overrides: dict) -> None:
    result = simulate({**ILMENITE, **overrides})
    assert [b["id"] for b in result["materials"]["balances"]] == [
        "ilmenite-beneficiation",
        "ilmenite-reduction",
        "water-electrolysis",
    ]
    assert result["materials"]["maxAbsResidualKgPerDay"] == 0
    assert result["energy"]["maxAbsResidualW"] == 0


def test_calibration_check_against_eagle_production_plant() -> None:
    params, _ = normalize_params({**ILMENITE, "targetKgPerDay": 1e6 / (365 * 0.9), "Tambient": 273})
    ilmenite = simulate(params)["ilmenite"]
    reactor_kw = (
        (ilmenite["secSensible_JPerKg"] + ilmenite["secReaction_JPerKg"] + ilmenite["secReactorLoss_JPerKg"])
        * params["targetKgPerDay"]
        / 86_400
        / 1000
    )
    electrolysis_kw = 3.52 / 0.72 * ilmenite["waterKgPerDay"] / 24
    liquefier_kw = 0.461 * params["targetKgPerDay"] / 24
    assert_rel(reactor_kw + electrolysis_kw + liquefier_kw, 1160, 0.01)
    assert_rel(ilmenite["beneficiationMassKg"] / 1000, 93.6, 0.003)


def test_grade_scales_soil_not_reactor() -> None:
    base = simulate(ILMENITE)["ilmenite"]
    rich = simulate({**ILMENITE, "fIlmenite": 0.15})["ilmenite"]
    assert_rel(rich["soilKgPerDay"], base["soilKgPerDay"] / 2, 1e-12)
    assert rich["concentrateKgPerDay"] == base["concentrateKgPerDay"]
    assert rich["reactorMassKg"] == base["reactorMassKg"]


def test_concentrate_no_richer_than_soil_is_no_separation() -> None:
    params, _ = normalize_params({**ILMENITE, "fIlmenite": 0.25, "etaIlmRecovery": 0.5, "ilmConcentrateGrade": 0.1})
    bypass = simulate(params)["ilmenite"]
    assert bypass["concentrateKgPerDay"] == bypass["sizedSoilKgPerDay"]
    assert_rel(bypass["concentrateGrade"], params["fIlmenite"], 1e-12)
    expected = 1 / (params["fIlmenite"] * params["fIlmSized"] * params["fIlmConversion"] * ilmenite_oxygen_fraction())
    assert_rel(bypass["soilPerKgO2"], expected, 1e-12)
    separated = simulate({**params, "ilmConcentrateGrade": 0.26})["ilmenite"]
    assert_rel(separated["soilPerKgO2"], bypass["soilPerKgO2"] / params["etaIlmRecovery"], 1e-12)


def test_each_process_ignores_the_others_inputs() -> None:
    mre = simulate({})
    assert mre["ilmenite"] is None
    assert simulate({"fIlmenite": 0.2, "kIlmReactorMass": 40, "eIlmBeneficiation": 30_000}) == mre
    ilmenite = simulate(ILMENITE)
    changed = simulate({**ILMENITE, "Vcell": 3.6, "kReactorMass": 30, "eMining": 400_000, "kExcFleet": 25})
    assert changed["energy"] == ilmenite["energy"]
    assert changed["logistics"] == ilmenite["logistics"]
    assert simulate({"site": "polar", "equatorialProcess": "ilmenite"}) == simulate({"site": "polar"})


def test_no_castable_slag_and_a_beneficiation_row() -> None:
    result = simulate(ILMENITE)
    assert result["production"]["slagKgPerDay"] == 0
    assert result["construction"]["padsPerYear"] == 0
    rows = {row["subsystem"]: row["massKg"] for row in result["logistics"]["manifest"]}
    assert rows["beneficiation plant"] == result["ilmenite"]["beneficiationMassKg"]
    assert rows["excavation fleet"] == result["ilmenite"]["miningMassKg"]


def test_no_slag_raises_no_casting_or_pad_alarms() -> None:
    def construction_alarms(overrides: dict) -> list[str]:
        result = simulate({"castDeltaT": 200, **overrides})
        return [warning["id"] for warning in result["warnings"] if warning["module"] == "construction"]

    assert construction_alarms({}) == ["thermal-stress"]
    assert construction_alarms(ILMENITE) == []
    assert construction_alarms({"site": "polar"}) == []
    pad_params = {
        **DEFAULTS, "castDeltaT": 200, "rhoGasPlume": 0.1, "vGasPlume": 4000, "Cf": 0.02, "tauAllowable": 100, "FS": 4
    }
    cast = simulate_construction(pad_params, 1000)
    assert [warning["id"] for warning in cast["warnings"]] == ["thermal-stress", "pad-shear"]
    idle = simulate_construction(pad_params, 0)
    assert idle["warnings"] == []
    assert idle["padJointUtilization"] > 1
    assert idle["maxSafeCoolingDeltaK"] < 200
