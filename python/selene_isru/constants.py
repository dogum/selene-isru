from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[2]
_CONSTANTS_PATH = _ROOT / "constants" / "constants.json"

with _CONSTANTS_PATH.open("r", encoding="utf-8") as handle:
    _RAW: dict[str, dict[str, Any]] = json.load(handle)

PHYSICAL_CONSTANTS: dict[str, dict[str, Any]] = {
    key: value for key, value in _RAW.items() if value["kind"] == "physical"
}
PARAM_META: dict[str, dict[str, Any]] = {
    key: value for key, value in _RAW.items() if value["kind"] == "parameter"
}
DEFAULTS: dict[str, Any] = {key: value["value"] for key, value in PARAM_META.items()}


def c(name: str) -> float:
    return float(PHYSICAL_CONSTANTS[name]["value"])
