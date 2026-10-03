from __future__ import annotations

from typing import Any


def _balance(node_id: str, label: str, mass_in: float, mass_out: float) -> dict[str, Any]:
    raw_residual = mass_in - mass_out
    residual = 0 if abs(raw_residual) < 1e-9 else raw_residual
    return {"id": node_id, "label": label, "massInKgPerDay": mass_in, "massOutKgPerDay": mass_out, "residualKgPerDay": residual}


def material_ledger(params: dict[str, Any], production: dict[str, float]) -> dict[str, Any]:
    flows: list[dict[str, Any]] = []
    balances: list[dict[str, Any]] = []
    if params["site"] == "equatorial":
        flows.extend([
            {"material": "regolith", "from": "terrain", "to": "mre", "kgPerDay": production["regolithKgPerDay"]},
            {"material": "oxygen", "from": "mre", "to": "product-storage", "kgPerDay": production["o2KgPerDay"]},
            {"material": "deoxygenated-regolith", "from": "mre", "to": "construction", "kgPerDay": production["slagKgPerDay"]},
        ])
        balances.append(_balance("mre-separation", "MRE aggregate material split", production["regolithKgPerDay"], production["o2KgPerDay"] + production["slagKgPerDay"]))
    else:
        mobilized_water = production["regolithKgPerDay"] * params["chiIce"]
        vapor_loss = mobilized_water - production["waterKgPerDay"]
        dry_tailings = production["regolithKgPerDay"] - mobilized_water
        flows.extend([
            {"material": "icy-regolith", "from": "terrain", "to": "sublimation", "kgPerDay": production["regolithKgPerDay"]},
            {"material": "water", "from": "sublimation", "to": "electrolysis" if production["grossH2KgPerDay"] > 0 else "product-storage", "kgPerDay": production["waterKgPerDay"]},
            {"material": "water-vapor", "from": "sublimation", "to": "uncaptured-loss", "kgPerDay": vapor_loss},
            {"material": "dry-tailings", "from": "sublimation", "to": "tailings", "kgPerDay": dry_tailings},
        ])
        balances.append(
            _balance("polar-extraction", "Polar water extraction", production["regolithKgPerDay"], production["waterKgPerDay"] + vapor_loss + dry_tailings)
        )
        if not params["enableSabatier"] and production["grossH2KgPerDay"] > 0:
            # Propellant mode: every kilogram of water becomes stored O2 and H2.
            flows.extend([
                {"material": "oxygen", "from": "electrolysis", "to": "product-storage", "kgPerDay": production["o2KgPerDay"]},
                {"material": "hydrogen", "from": "electrolysis", "to": "product-storage", "kgPerDay": production["h2KgPerDay"]},
            ])
            balances.append(
                _balance("water-electrolysis", "Water electrolysis", production["waterKgPerDay"], production["o2KgPerDay"] + production["h2KgPerDay"])
            )
        if params["enableSabatier"]:
            h2_consumed = production["grossH2KgPerDay"] - production["h2KgPerDay"]
            flows.extend([
                {"material": "oxygen", "from": "electrolysis", "to": "product-storage", "kgPerDay": production["o2KgPerDay"]},
                {"material": "hydrogen", "from": "electrolysis", "to": "sabatier", "kgPerDay": h2_consumed},
                {"material": "hydrogen", "from": "electrolysis", "to": "product-storage", "kgPerDay": production["h2KgPerDay"]},
                {"material": "carbon-dioxide", "from": "imported-feed", "to": "sabatier", "kgPerDay": production["co2ImportedKgPerDay"]},
                {"material": "methane", "from": "sabatier", "to": "product-storage", "kgPerDay": production["ch4KgPerDay"]},
                {"material": "water", "from": "sabatier", "to": "recycle", "kgPerDay": production["waterRecycleKgPerDay"]},
            ])
            balances.extend([
                _balance("water-electrolysis", "Water electrolysis", production["waterKgPerDay"], production["o2KgPerDay"] + production["grossH2KgPerDay"]),
                _balance("sabatier", "Sabatier conversion", h2_consumed + production["co2ImportedKgPerDay"], production["ch4KgPerDay"] + production["waterRecycleKgPerDay"]),
            ])
    return {"flows": flows, "balances": balances, "maxAbsResidualKgPerDay": max((abs(row["residualKgPerDay"]) for row in balances), default=0)}
