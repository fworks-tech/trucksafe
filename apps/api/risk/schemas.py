"""
Domain data structures for weather risk classification.

These classes are intentionally implemented using standard Python dataclasses.
They do not depend on Django models or REST framework serializers because the
risk engine should be easy to test independently.
"""

from dataclasses import dataclass
from enum import IntEnum


class RiskLevel(IntEnum):
    """
    Ordered weather risk severity.

    The numeric values are meaningful because they allow risk levels to be
    compared directly using the built-in ordering operations.

    Higher values represent more severe operational conditions.
    """

    LOW = 1
    MODERATE = 2
    HIGH = 3
    SEVERE = 4
    NO_TRAVEL = 5


@dataclass(frozen=True, slots=True)
class WeatherObservation:
    """
    Normalized weather data for one route checkpoint.

    All values must use the application's canonical units:

    - Wind: miles per hour
    - Rain: inches per hour
    - Snow: inches per hour
    """

    wind_mph: float
    rain_inches_per_hour: float
    snow_inches_per_hour: float


@dataclass(frozen=True, slots=True)
class RiskResult:
    """
    Final risk classification for a checkpoint.

    Attributes:
        level:
            Final risk severity after weather and load rules are applied.

        reasons:
            Human-readable reasons explaining the classification.

    The reasons are stored as a tuple to keep the result immutable.
    """

    level: RiskLevel
    reasons: tuple[str, ...]

    @property
    def score(self) -> int:
        """
        Return the numeric score associated with the risk level.

        The score is useful when calculating route-level average risk.
        """
        return int(self.level)
