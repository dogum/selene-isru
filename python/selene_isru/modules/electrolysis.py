from __future__ import annotations

import math
from typing import Any

from ..constants import DEFAULTS, c


OXIDES = [
    ("SiO2", "oxideSiO2", 2, "M_SiO2", "oxideEllinghamSiO2A", "oxideEllinghamSiO2B"),
    ("TiO2", "oxideTiO2", 2, "M_TiO2", "oxideEllinghamTiO2A", "oxideEllinghamTiO2B"),
    ("Al2O3", "oxideAl2O3", 3, "M_Al2O3", "oxideEllinghamAl2O3A", "oxideEllinghamAl2O3B"),
    ("FeO", "oxideFeO", 1, "M_FeO", "oxideEllinghamFeOA", "oxideEllinghamFeOB"),
    ("MgO", "oxideMgO", 1, "M_MgO", "oxideEllinghamMgOA", "oxideEllinghamMgOB"),
    ("CaO", "oxideCaO", 1, "M_CaO", "oxideEllinghamCaOA", "oxideEllinghamCaOB"),
]


def sec_elec_j_per_kg(vcell: float, eta_current: float) -> float:
    return (vcell * 4 * c("F")) / (c("M_O2") * eta_current)


def cp_regolith_j_per_kg_k(t: float) -> float:
    return c("cpRegMaierA") + c("cpRegMaierB") * t + c("cpRegMaierC") / t**2


def sensible_heat_regolith_j_per_kg(tambient: float, tmelt: float, cp_scale: float) -> float:
    a = c("cpRegMaierA")
    b = c("cpRegMaierB")
    c_coef = c("cpRegMaierC")
    base_integral = (
        a * (tmelt - tambient)
        + (b / 2) * (tmelt**2 - tambient**2)
        - c_coef * (1 / tmelt - 1 / tambient)
    )
    return base_integral * (cp_scale / DEFAULTS["cpRegMelt"])


def melt_heat_j_per_kg(params: dict[str, Any]) -> float:
    return sensible_heat_regolith_j_per_kg(params["Tambient"], params["Tmelt"], params["cpRegMelt"]) + params["dHfus"]


def oxide_o2_kg_per_kg(oxygens: int, molar_mass_kg_per_mol: float) -> float:
    return ((oxygens / 2) * c("M_O2")) / molar_mass_kg_per_mol


def oxide_decomposition_voltage(ell_a_j_per_mol_o2: float, ell_b_j_per_mol_o2_k: float, t: float) -> float:
    dgf_j_per_mol_o2 = ell_a_j_per_mol_o2 + ell_b_j_per_mol_o2_k * t
    return -dgf_j_per_mol_o2 / (4 * c("F"))


def mre_voltage_losses(params: dict[str, Any]) -> dict[str, float]:
    j_limit = 4 * c("F") * params["Dox"] * params["Cbulk"] / params["deltaDiff"]
    utilization = min(0.999999, max(0, params["jOperating"] / max(1e-12, j_limit)))
    concentration = c("R") * params["Tmelt"] / (4 * c("F")) * math.log(1 / max(1e-9, 1 - utilization))
    activation = params["mreActivationOverpotentialV"]
    ohmic = params["jOperating"] * params["mreAreaSpecificResistanceOhmM2"]
    return {
        "activationV": activation,
        "ohmicV": ohmic,
        "concentrationV": concentration,
        "availableVoltageV": params["Vcell"] - activation - ohmic - concentration,
        "jLimit_APerM2": j_limit,
    }


def _composition_weighted_voltage(params: dict[str, Any], active: list[bool]) -> float:
    raw_fractions = [max(0, params[oxide[1]]) for oxide in OXIDES]
    scale = max(1, sum(raw_fractions))
    weighted = 0.0
    oxygen_basis = 0.0
    for index, oxide in enumerate(OXIDES):
        if not active[index]:
            continue
        _, _, oxygens, molar_mass_key, ell_a_key, ell_b_key = oxide
        basis = raw_fractions[index] / scale * oxide_o2_kg_per_kg(oxygens, c(molar_mass_key))
        weighted += basis * oxide_decomposition_voltage(c(ell_a_key), c(ell_b_key), params["Tmelt"])
        oxygen_basis += basis
    return weighted / oxygen_basis if oxygen_basis > 0 else 0


def oxide_model_yield(params: dict[str, Any]) -> dict[str, Any]:
    voltage = mre_voltage_losses(params)
    if not params["oxideModel"]:
        return {
            "xO2Effective": params["xO2"] * params["fExtract"],
            "oxideYield": [{"oxide": oxide[0], "o2KgPerKg": 0, "decomposed": False} for oxide in OXIDES],
            "reversibleVoltageV": _composition_weighted_voltage(params, [True for _ in OXIDES]),
            "availableVoltageV": voltage["availableVoltageV"],
        }

    raw_fractions = [max(0, params[oxide[1]]) for oxide in OXIDES]
    raw_total = sum(raw_fractions)
    if raw_total <= 0:
        return {
            "xO2Effective": params["xO2"] * params["fExtract"],
            "oxideYield": [{"oxide": oxide[0], "o2KgPerKg": 0, "decomposed": False} for oxide in OXIDES],
            "reversibleVoltageV": 0,
            "availableVoltageV": voltage["availableVoltageV"],
        }

    fraction_scale = max(1, raw_total)
    recovery = params["fExtract"] * c("oxideRecoveryCalibration")
    x_o2_effective = 0.0
    oxide_yield: list[dict[str, Any]] = []

    for i, oxide in enumerate(OXIDES):
        oxide_name, _, oxygens, molar_mass_key, ell_a_key, ell_b_key = oxide
        mass_frac = raw_fractions[i] / fraction_scale
        decomposed = oxide_decomposition_voltage(c(ell_a_key), c(ell_b_key), params["Tmelt"]) <= voltage["availableVoltageV"]
        o2_kg_per_kg = (
            mass_frac * oxide_o2_kg_per_kg(oxygens, c(molar_mass_key)) * recovery
            if decomposed
            else 0
        )
        x_o2_effective += o2_kg_per_kg
        oxide_yield.append(
            {
                "oxide": oxide_name,
                "o2KgPerKg": o2_kg_per_kg,
                "decomposed": decomposed,
            }
        )

    return {
        "xO2Effective": max(1e-9, x_o2_effective),
        "oxideYield": oxide_yield,
        "reversibleVoltageV": _composition_weighted_voltage(params, [row["decomposed"] for row in oxide_yield]),
        "availableVoltageV": voltage["availableVoltageV"],
    }


def simulate_electrolysis(params: dict[str, Any]) -> dict[str, Any]:
    sec_elec_j_per_kg_value = sec_elec_j_per_kg(params["Vcell"], params["etaCurrent"])
    voltage_losses = mre_voltage_losses(params)
    oxide_model = oxide_model_yield(params)
    r_reg = 1 / oxide_model["xO2Effective"]
    q_melt = melt_heat_j_per_kg(params)
    sec_thermal_j_per_kg = r_reg * q_melt
    sec_parasitic_j_per_kg = params["fParasitic"] * (sec_elec_j_per_kg_value + sec_thermal_j_per_kg)
    mdot_o2_kg_per_s = params["targetKgPerDay"] / 86400
    current_a = mdot_o2_kg_per_s * 4 * c("F") / (c("M_O2") * params["etaCurrent"])
    melt_viscosity_pa_s = params["Amu"] * params["Tmelt"] * math.exp(params["Bmu"] / (params["Tmelt"] - params["T0vft"]))
    drain_velocity_m_per_s = (
        params["rhoSlag"] * c("gL") * params["hMelt"] ** 2 * math.sin(params["thetaDrain"])
    ) / (3 * melt_viscosity_pa_s)
    j_limit_a_per_m2 = voltage_losses["jLimit_APerM2"]
    j_operating_a_per_m2 = params["jOperating"]
    electrode_area_m2 = current_a / j_operating_a_per_m2
    current_utilization = j_operating_a_per_m2 / j_limit_a_per_m2
    modeled_required_voltage = oxide_model["reversibleVoltageV"] + voltage_losses["activationV"] + voltage_losses["ohmicV"] + voltage_losses["concentrationV"]
    voltage_margin = params["Vcell"] - modeled_required_voltage
    unallocated_voltage = max(0, voltage_margin)
    electrical_input_w = current_a * params["Vcell"]
    chemical_power_w = current_a * params["etaCurrent"] * oxide_model["reversibleVoltageV"]
    modeled_loss_power_w = max(0, electrical_input_w - chemical_power_w)
    reactor_mass_kg = params["kReactorMass"] * params["targetKgPerDay"]
    warnings: list[dict[str, Any]] = []

    if j_operating_a_per_m2 > 0.85 * j_limit_a_per_m2:
        warnings.append(
            {
                "id": "anode-current",
                "severity": "alarm",
                "module": "electrolysis",
                "message": "Operating current density exceeds 85% of limiting current density.",
                "value": j_operating_a_per_m2,
                "limit": 0.85 * j_limit_a_per_m2,
            }
        )
    if voltage_margin < 0:
        warnings.append({"id": "mre-voltage-shortfall", "severity": "alarm", "module": "electrolysis", "message": "Applied MRE voltage is below the modeled reversible, activation, ohmic, and concentration requirement.", "value": params["Vcell"], "limit": modeled_required_voltage})
    if params["oxideModel"] and all(not row["decomposed"] for row in oxide_model["oxideYield"]):
        minimum_voltage = min(oxide_decomposition_voltage(c(oxide[4]), c(oxide[5]), params["Tmelt"]) for oxide in OXIDES)
        warnings.append({"id": "mre-no-oxide-yield", "severity": "alarm", "module": "electrolysis", "message": "No modeled oxide is energetically accessible at the current voltage-loss operating point.", "value": oxide_model["availableVoltageV"], "limit": minimum_voltage})

    return {
        "secElec_JPerKg": sec_elec_j_per_kg_value,
        "secThermal_JPerKg": sec_thermal_j_per_kg,
        "secParasitic_JPerKg": sec_parasitic_j_per_kg,
        "currentA": current_a,
        "cellVoltageV": params["Vcell"],
        "jLimit_APerM2": j_limit_a_per_m2,
        "jOperating_APerM2": j_operating_a_per_m2,
        "meltViscosityPaS": melt_viscosity_pa_s,
        "drainVelocityMPerS": drain_velocity_m_per_s,
        "reactorMassKg": reactor_mass_kg,
        "xO2Effective": oxide_model["xO2Effective"],
        "oxideYield": oxide_model["oxideYield"],
        "reversibleVoltageV": oxide_model["reversibleVoltageV"],
        "activationOverpotentialV": voltage_losses["activationV"],
        "ohmicOverpotentialV": voltage_losses["ohmicV"],
        "concentrationOverpotentialV": voltage_losses["concentrationV"],
        "unallocatedVoltageV": unallocated_voltage,
        "voltageMarginV": voltage_margin,
        "electrodeAreaM2": electrode_area_m2,
        "currentUtilization": current_utilization,
        "electricalInputW": electrical_input_w,
        "chemicalPowerW": chemical_power_w,
        "modeledLossPowerW": modeled_loss_power_w,
        "warnings": warnings,
    }
