from __future__ import annotations

import math
from typing import Any


def excavator_fleet(params: dict[str, Any], soil_moved_kg_per_day: float) -> dict[str, float]:
    """Whole RASSOR-class excavators for the soil moved; mirrors `excavatorFleet`."""
    trip_seconds = (3 * params["haulDistanceM"]) / params["excavatorSpeedMps"] + params["excavatorLoadingMin"] * 60
    trips_per_day = max(1, math.floor((params["excavatorHoursPerDay"] * 3600) / trip_seconds))
    kg_per_day_each = trips_per_day * params["excavatorPayloadKg"]
    count = max(1, math.ceil(soil_moved_kg_per_day / kg_per_day_each))
    return {
        "tripsPerDay": trips_per_day,
        "kgPerDayEach": kg_per_day_each,
        "count": count,
        "massKg": count * params["excavatorMassKg"],
    }
