"""
Framework-independent route domain models.

This module must not import Django, database models, HTTP clients,
or external provider implementations.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from math import isfinite

from risk.schemas import RiskLevel, RiskResult


@dataclass(frozen=True, slots=True)
class RiskAssessment:
    """Risk classification for a route checkpoint or segment.

    Attributes:
        level: Classified severity (Low=1 .. No Travel=5).
        score: Numeric score used in route-average risk; must equal the
            RiskLevel numeric value so mileage attribution (which uses
            `level`) and averaging (which uses `score`) cannot disagree.
        reasons: Human-readable explanations; preserved by aggregation.
    """

    level: RiskLevel
    score: float
    reasons: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.level, RiskLevel):
            raise ValueError(f"risk level must be a RiskLevel: {self.level!r}")
        if not isfinite(self.score):
            raise ValueError(f"risk score must be finite: {self.score!r}")
        if self.score != float(self.level.value):
            raise ValueError(
                f"risk score {self.score!r} must equal level value "
                f"{self.level.value} ({self.level.name})"
            )


@dataclass(frozen=True, slots=True)
class RouteCheckpoint:
    """A checkpoint along a route.

    `distance_from_origin_miles` is cumulative distance from the route
    origin in miles. The risk at a checkpoint applies to the segment
    ending at that checkpoint.

    A checkpoint with `weather_available=False` must have `risk=None`;
    it contributes zero risk miles and makes the route ineligible.
    """

    checkpoint_id: str
    latitude: float
    longitude: float
    distance_from_origin_miles: float
    eta: datetime
    risk: RiskAssessment | RiskResult | None = None
    weather_available: bool = False

    def __post_init__(self) -> None:
        if not self.checkpoint_id.strip():
            raise ValueError("checkpoint_id must not be empty")
        if not isinstance(self.eta, datetime):
            raise ValueError("Checkpoint ETA must be a datetime")
        if self.eta.tzinfo is None or self.eta.utcoffset() is None:
            raise ValueError("Checkpoint ETA must be timezone-aware")
        for name, value in (
            ("distance_from_origin_miles", self.distance_from_origin_miles),
            ("latitude", self.latitude),
            ("longitude", self.longitude),
        ):
            if not isfinite(value):
                raise ValueError(f"{name} must be finite: {value!r}")
        if self.distance_from_origin_miles < 0:
            raise ValueError("distance_from_origin_miles cannot be negative")
        if not -90.0 <= self.latitude <= 90.0:
            raise ValueError(f"latitude must be between -90 and 90: {self.latitude!r}")
        if not -180.0 <= self.longitude <= 180.0:
            raise ValueError(
                f"longitude must be between -180 and 180: {self.longitude!r}"
            )
        if self.risk is not None and not isinstance(
            self.risk, (RiskAssessment, RiskResult)
        ):
            raise ValueError("checkpoint risk must be a RiskAssessment or RiskResult")
        if not self.weather_available and self.risk is not None:
            raise ValueError(
                "A checkpoint without weather cannot have a risk assessment"
            )


@dataclass(frozen=True, slots=True)
class RouteSummary:
    """Aggregated route-level risk and duration metrics.

    All mileage fields are in miles; duration is in seconds.
    Mileage summaries are rounded to 6 decimals to avoid float noise.
    `average_risk_score` is 0.0 when no checkpoint has a usable
    classification (outside the valid 1-5 score range, i.e. "no data").
    """

    severe_miles: float
    high_miles: float
    no_travel_miles: float
    average_risk_score: float
    duration_seconds: float
    is_eligible: bool

    def __post_init__(self) -> None:
        for name, value in (
            ("severe_miles", self.severe_miles),
            ("high_miles", self.high_miles),
            ("no_travel_miles", self.no_travel_miles),
            ("average_risk_score", self.average_risk_score),
            ("duration_seconds", self.duration_seconds),
        ):
            if not isfinite(value):
                raise ValueError(f"{name} must be finite: {value!r}")
            if value < 0:
                raise ValueError(f"{name} cannot be negative: {value!r}")


@dataclass(frozen=True, slots=True)
class Route:
    """A candidate route.

    The summary is populated after checkpoint risks are aggregated.
    Checkpoint distances must be monotonically non-decreasing
    (each distance >= the previous one).
    """

    route_id: str
    distance_miles: float
    duration_seconds: float
    checkpoints: tuple[RouteCheckpoint, ...]
    summary: RouteSummary | None = None

    def __post_init__(self) -> None:
        if not self.route_id.strip():
            raise ValueError("route_id must not be empty")
        for name, value in (
            ("distance_miles", self.distance_miles),
            ("duration_seconds", self.duration_seconds),
        ):
            if not isfinite(value):
                raise ValueError(f"{name} must be finite: {value!r}")
        if self.distance_miles < 0:
            raise ValueError("distance_miles cannot be negative")
        if self.duration_seconds < 0:
            raise ValueError("duration_seconds cannot be negative")
        if not self.checkpoints:
            raise ValueError("A route must contain at least one checkpoint")
        previous = 0.0
        for checkpoint in self.checkpoints:
            if checkpoint.distance_from_origin_miles < previous:
                raise ValueError(
                    "Checkpoint distances must be monotonically increasing"
                )
            previous = checkpoint.distance_from_origin_miles

    def with_summary(self, summary: RouteSummary) -> Route:
        """Return a copy of this route with a calculated summary."""
        return replace(self, summary=summary)


@dataclass(frozen=True, slots=True)
class RecommendationResult:
    """Result of deterministic route recommendation.

    `recommended_route_id` is None when no route is eligible.
    """

    recommended_route_id: str | None
    ranked_route_ids: tuple[str, ...]
    all_routes_ineligible: bool

    @property
    def has_recommendation(self) -> bool:
        """Return whether an eligible route was selected."""
        return self.recommended_route_id is not None
