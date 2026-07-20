from __future__ import annotations

import math
from typing import Any

from ..constants import c


def simulate_cryo(params: dict[str, Any]) -> dict[str, float]:
    product_kg_per_day = params["targetKgPerDay"]
    v_tank = params["reserveDays"] * product_kg_per_day / params["rhoCryo"]
    r_tank = (3 * v_tank / (4 * math.pi)) ** (1 / 3)
    a_tank = 4 * math.pi * r_tank**2
    a_proj = math.pi * r_tank**2
    illum = 0 if params["site"] == "polar" else 1
    q_solar = params["alphaTank"] * c("ISOLAR") * a_proj * illum
    q_albedo = params["alphaTank"] * c("ISOLAR") * 0.12 * params["Fview"] * a_tank * illum
    q_ir = params["epsTank"] * c("sigma") * params["Tsurface"] ** 4 * params["Fview"] * a_tank
    q_space = params["epsTank"] * c("sigma") * (params["Ttank"] ** 4 - 3**4) * a_tank * (1 - params["Fview"])
    q_env = q_solar + q_albedo + q_ir - q_space
    teq_raw = (q_env / (params["epsTank"] * c("sigma") * a_tank)) ** 0.25 if q_env > 0 else params["Ttank"]
    t_hot = max(teq_raw, params["Ttank"])
    t_cold = params["Ttank"]
    t_m = (t_hot + t_cold) / 2
    layer_density_for_correlation = params["Nlaydens"] / 10
    mli_flux_w_per_m2 = (
        params["C1mli"] * layer_density_for_correlation ** params["rExp"] * t_m * (t_hot - t_cold) / params["Nmli"]
        + params["C2mli"] * params["epsLayer"] * (t_hot**4.67 - t_cold**4.67) / params["Nmli"]
    )
    q_leak_w = max(0, mli_flux_w_per_m2 * a_tank) + params["qStrutW"]
    boiloff_kg_per_day = q_leak_w / c("dHvap_LOX") * 86400
    cryocooler_power_w = q_leak_w * (t_hot - t_cold) / (params["eta2ndLaw"] * t_cold)
    cryo_mass_kg = params["kCryoMass"] * product_kg_per_day

    return {
        "qLeakW": q_leak_w,
        "boiloffKgPerDay": boiloff_kg_per_day,
        "cryocoolerPowerW": cryocooler_power_w,
        "mliFlux_WPerM2": mli_flux_w_per_m2,
        "cryoMassKg": cryo_mass_kg,
    }
