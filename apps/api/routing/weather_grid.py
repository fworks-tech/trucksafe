"""
Weather grid domain models.

This module defines the normalized weather grid data structure used for
the heatmap visualization. It is framework-independent and does not
depend on Django, HTTP providers, databases, or external services.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import isfinite
from typing import TYPE_CHECKING

from risk.schemas import RiskLevel

if TYPE_CHECKING:
    from routing.checkpoints import Coordinate


@dataclass(frozen=True, slots=True)
class WeatherGridCell:
    """A single cell in the weather grid.

    Attributes:
        cell_id: Stable identifier for the cell.
        latitude: WGS84 latitude in decimal degrees (-90 to 90).
        longitude: WGS84 longitude in decimal degrees (-180 to 180).
        valid_at: Timezone-aware timestamp when this forecast is valid (UTC).
        risk_level: Classified risk severity, or None when unavailable.
        risk_score: Numeric risk score (1-5), or None when unavailable.
        risk_reasons: Human-readable reasons for the classification.
        weather: Raw normalized weather values when available.
    """

    cell_id: str
    latitude: float
    longitude: float
    valid_at: datetime
    risk_level: RiskLevel | None
    risk_score: float | None
    risk_reasons: tuple[str, ...]
    wind_mph: float | None = None
    rain_inches_per_hour: float | None = None
    snow_inches_per_hour: float | None = None

    def __post_init__(self) -> None:
        """Validate cell data."""
        if not self.cell_id.strip():
            raise ValueError("cell_id must not be empty")
        if not isfinite(self.latitude) or not -90.0 <= self.latitude <= 90.0:
            raise ValueError(
                f"latitude must be between -90 and 90: {self.latitude!r}"
            )
        if not isfinite(self.longitude) or not -180.0 <= self.longitude <= 180.0:
            raise ValueError(
                f"longitude must be between -180 and 180: {self.longitude!r}"
            )
        if not isinstance(self.valid_at, datetime):
            raise ValueError("valid_at must be a datetime")
        if self.valid_at.tzinfo is None or self.valid_at.utcoffset() is None:
            raise ValueError("valid_at must be timezone-aware (UTC)")
        if self.risk_level is not None and not isinstance(self.risk_level, RiskLevel):
            raise ValueError(
                f"risk_level must be a RiskLevel or None: {self.risk_level!r}"
            )
        if self.risk_score is not None:
            if not isfinite(self.risk_score):
                raise ValueError(f"risk_score must be finite: {self.risk_score!r}")
            if not 1.0 <= self.risk_score <= 5.0:
                raise ValueError(
                    f"risk_score must be in range 1-5: {self.risk_score!r}"
                )
        if self.risk_level is None and self.risk_score is not None:
            raise ValueError("risk_score requires risk_level")
        if self.risk_level is not None and self.risk_score is None:
            raise ValueError("risk_level requires risk_score")
        if self.risk_level is not None and (
            self.risk_score != float(self.risk_level.value)
        ):
            raise ValueError(
                f"risk_score {self.risk_score!r} must equal level value "
                f"{self.risk_level.value} ({self.risk_level.name})"
            )
        if self.wind_mph is not None and (
            not isfinite(self.wind_mph) or self.wind_mph < 0
        ):
            raise ValueError(f"wind_mph must be finite and >= 0: {self.wind_mph!r}")
        if self.rain_inches_per_hour is not None and (
            not isfinite(self.rain_inches_per_hour) or self.rain_inches_per_hour < 0
        ):
            raise ValueError(
                f"rain_inches_per_hour must be finite and >= 0: "
                f"{self.rain_inches_per_hour!r}"
            )
        if self.snow_inches_per_hour is not None and (
            not isfinite(self.snow_inches_per_hour) or self.snow_inches_per_hour < 0
        ):
            raise ValueError(
                f"snow_inches_per_hour must be finite and >= 0: "
                f"{self.snow_inches_per_hour!r}"
            )


@dataclass(frozen=True, slots=True)
class WeatherGrid:
    """Weather grid for a route plan and forecast offset.

    Attributes:
        route_id: The route plan this grid belongs to.
        route_plan_id: The route plan ID from the API.
        forecast_start: Start of the forecast window (inclusive, UTC).
        forecast_end: End of the forecast window (exclusive, UTC).
        cells: Ordered grid cells along the route corridor.
    """

    route_id: str
    route_plan_id: str
    forecast_start: datetime
    forecast_end: datetime
    cells: tuple[WeatherGridCell, ...]

    def __post_init__(self) -> None:
        """Validate grid data."""
        if not self.route_id.strip():
            raise ValueError("route_id must not be empty")
        if not self.route_plan_id.strip():
            raise ValueError("route_plan_id must not be empty")
        if not isinstance(self.forecast_start, datetime) or (
            self.forecast_start.tzinfo is None
        ):
            raise ValueError("forecast_start must be timezone-aware (UTC)")
        if not isinstance(self.forecast_end, datetime) or (
            self.forecast_end.tzinfo is None
        ):
            raise ValueError("forecast_end must be timezone-aware (UTC)")
        if self.forecast_end <= self.forecast_start:
            raise ValueError("forecast_end must be after forecast_start")
        if (self.forecast_end - self.forecast_start).total_seconds() > 48 * 3600:
            raise ValueError("forecast window must not exceed 48 hours")


def build_weather_grid(
    route_plan_id: str,
    route_id: str,
    checkpoints: tuple[Coordinate, ...],
    departure_at: datetime,
    load_weight_lb: float,
    offset_hours: int,
    weather_provider: object,
) -> WeatherGrid:
    """
    Build a weather grid for the given route and forecast offset.

    The grid samples weather at regular intervals along the route corridor
    using the estimated arrival time plus the forecast offset.

    Args:
        route_plan_id: The route plan identifier.
        route_id: The specific route identifier.
        checkpoints: Route checkpoints with coordinates and ETAs.
        departure_at: Base departure time (UTC).
        load_weight_lb: Truck load weight in pounds.
        offset_hours: Forecast offset in hours (0-48).
        weather_provider: Weather provider instance.

    Returns:
        A WeatherGrid with cells covering the route corridor.

    Raises:
        ValueError: If inputs are invalid or offset_hours is out of range.
    """
    from math import isfinite

    if not isfinite(load_weight_lb) or load_weight_lb < 0:
        raise ValueError(f"load_weight_lb must be finite and >= 0: {load_weight_lb!r}")
    if not isinstance(offset_hours, int) or not 0 <= offset_hours <= 48:
        raise ValueError(f"offset_hours must be an integer in 0..48: {offset_hours!r}")
    if not isinstance(departure_at, datetime) or departure_at.tzinfo is None:
        raise ValueError("departure_at must be timezone-aware (UTC)")

    departure_utc = departure_at.astimezone(UTC)
    valid_at = departure_utc.replace(
        minute=0, second=0, microsecond=0
    ) + timedelta(hours=offset_hours)

    cells = []
    for index, checkpoint in enumerate(checkpoints):
        cell_id = f"cell-{route_id}-{index}"
        observation = weather_provider.get_weather(
            checkpoint.latitude,
            checkpoint.longitude,
            valid_time=valid_at,
        )
        if observation is None:
            cells.append(
                WeatherGridCell(
                    cell_id=cell_id,
                    latitude=checkpoint.latitude,
                    longitude=checkpoint.longitude,
                    valid_at=valid_at,
                    risk_level=None,
                    risk_score=None,
                    risk_reasons=(),
                )
            )
        else:
            from risk.engine import calculate_risk
            risk_result = calculate_risk(observation, load_weight_lb)
            cells.append(
                WeatherGridCell(
                    cell_id=cell_id,
                    latitude=checkpoint.latitude,
                    longitude=checkpoint.longitude,
                    valid_at=valid_at,
                    risk_level=risk_result.level,
                    risk_score=float(risk_result.level.value),
                    risk_reasons=risk_result.reasons,
                    wind_mph=observation.wind_mph,
                    rain_inches_per_hour=observation.rain_inches_per_hour,
                    snow_inches_per_hour=observation.snow_inches_per_hour,
                )
            )

    if not cells:
        raise ValueError("route must have at least one checkpoint")

    forecast_start = valid_at
    forecast_end = valid_at + timedelta(hours=1)

    return WeatherGrid(
        route_id=route_id,
        route_plan_id=route_plan_id,
        forecast_start=forecast_start,
        forecast_end=forecast_end,
        cells=tuple(cells),
    )


def _validate_checkpoint(checkpoint: Coordinate) -> None:
    """Validate a checkpoint coordinate."""
    if not isfinite(checkpoint.latitude) or not -90.0 <= checkpoint.latitude <= 90.0:
        raise ValueError(
            f"latitude must be between -90 and 90: {checkpoint.latitude!r}"
        )
    if not isfinite(checkpoint.longitude) or not (
            -180.0 <= checkpoint.longitude <= 180.0
        ):
        raise ValueError(
            f"longitude must be between -180 and 180: {checkpoint.longitude!r}"
        )


__all__ = [
    "WeatherGridCell",
    "WeatherGrid",
    "build_weather_grid",
]