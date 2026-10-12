"""
Tests for the weather grid domain models and builder.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from risk.schemas import RiskLevel, WeatherObservation
from routing.checkpoints import Checkpoint, Coordinate
from routing.weather_grid import WeatherGrid, WeatherGridCell, build_weather_grid


class TestWeatherGridCell:
    def test_valid_cell_with_risk(self) -> None:
        valid_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        cell = WeatherGridCell(
            cell_id="cell-1",
            latitude=40.0,
            longitude=-100.0,
            valid_at=valid_at,
            risk_level=RiskLevel.MODERATE,
            risk_score=2.0,
            risk_reasons=("wind",),
            wind_mph=30.0,
            rain_inches_per_hour=0.1,
            snow_inches_per_hour=0.0,
        )
        assert cell.cell_id == "cell-1"
        assert cell.risk_level == RiskLevel.MODERATE
        assert cell.risk_score == 2.0

    def test_valid_cell_unavailable_weather(self) -> None:
        valid_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        cell = WeatherGridCell(
            cell_id="cell-1",
            latitude=40.0,
            longitude=-100.0,
            valid_at=valid_at,
            risk_level=None,
            risk_score=None,
            risk_reasons=(),
        )
        assert cell.risk_level is None
        assert cell.risk_score is None
        assert cell.risk_reasons == ()

    def test_invalid_empty_cell_id(self) -> None:
        valid_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        with pytest.raises(ValueError, match="cell_id must not be empty"):
            WeatherGridCell(
                cell_id="",
                latitude=40.0,
                longitude=-100.0,
                valid_at=valid_at,
                risk_level=None,
                risk_score=None,
                risk_reasons=(),
            )

    def test_invalid_latitude(self) -> None:
        valid_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        with pytest.raises(ValueError, match="latitude must be between -90 and 90"):
            WeatherGridCell(
                cell_id="cell-1",
                latitude=95.0,
                longitude=-100.0,
                valid_at=valid_at,
                risk_level=None,
                risk_score=None,
                risk_reasons=(),
            )

    def test_invalid_longitude(self) -> None:
        valid_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        with pytest.raises(ValueError, match="longitude must be between -180 and 180"):
            WeatherGridCell(
                cell_id="cell-1",
                latitude=40.0,
                longitude=200.0,
                valid_at=valid_at,
                risk_level=None,
                risk_score=None,
                risk_reasons=(),
            )

    def test_naive_datetime_rejected(self) -> None:
        with pytest.raises(ValueError, match="valid_at must be timezone-aware"):
            WeatherGridCell(
                cell_id="cell-1",
                latitude=40.0,
                longitude=-100.0,
                valid_at=datetime(2026, 10, 12, 14, 0),  # naive
                risk_level=None,
                risk_score=None,
                risk_reasons=(),
            )

    def test_risk_score_mismatch_rejected(self) -> None:
        valid_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        with pytest.raises(ValueError, match="risk_score.*must equal level value"):
            WeatherGridCell(
                cell_id="cell-1",
                latitude=40.0,
                longitude=-100.0,
                valid_at=valid_at,
                risk_level=RiskLevel.MODERATE,
                risk_score=3.0,  # wrong score
                risk_reasons=("wind",),
            )

    def test_risk_level_none_with_score_rejected(self) -> None:
        valid_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        with pytest.raises(ValueError, match="risk_score requires risk_level"):
            WeatherGridCell(
                cell_id="cell-1",
                latitude=40.0,
                longitude=-100.0,
                valid_at=valid_at,
                risk_level=None,
                risk_score=2.0,
                risk_reasons=(),
            )

    def test_negative_weather_values_rejected(self) -> None:
        valid_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        with pytest.raises(ValueError, match="wind_mph must be finite and >= 0"):
            WeatherGridCell(
                cell_id="cell-1",
                latitude=40.0,
                longitude=-100.0,
                valid_at=valid_at,
                risk_level=RiskLevel.LOW,
                risk_score=1.0,
                risk_reasons=("wind",),
                wind_mph=-5.0,
            )


class TestWeatherGrid:
    def test_valid_grid(self) -> None:
        forecast_start = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        forecast_end = forecast_start + timedelta(hours=1)
        cells = (
            WeatherGridCell(
                cell_id="cell-1",
                latitude=40.0,
                longitude=-100.0,
                valid_at=forecast_start,
                risk_level=RiskLevel.LOW,
                risk_score=1.0,
                risk_reasons=("wind",),
            ),
        )
        grid = WeatherGrid(
            route_id="route-1",
            route_plan_id="plan-1",
            forecast_start=forecast_start,
            forecast_end=forecast_end,
            cells=cells,
        )
        assert grid.route_id == "route-1"
        assert len(grid.cells) == 1

    def test_empty_route_id_rejected(self) -> None:
        forecast_start = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        forecast_end = forecast_start + timedelta(hours=1)
        cells = (
            WeatherGridCell(
                cell_id="cell-1",
                latitude=40.0,
                longitude=-100.0,
                valid_at=forecast_start,
                risk_level=None,
                risk_score=None,
                risk_reasons=(),
            ),
        )
        with pytest.raises(ValueError, match="route_id must not be empty"):
            WeatherGrid(
                route_id="",
                route_plan_id="plan-1",
                forecast_start=forecast_start,
                forecast_end=forecast_end,
                cells=cells,
            )

    def test_forecast_end_before_start_rejected(self) -> None:
        forecast_start = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        forecast_end = datetime(2026, 10, 12, 13, 0, tzinfo=UTC)
        cells = ()
        with pytest.raises(
            ValueError, match="forecast_end must be after forecast_start"
        ):
            WeatherGrid(
                route_id="route-1",
                route_plan_id="plan-1",
                forecast_start=forecast_start,
                forecast_end=forecast_end,
                cells=cells,
            )

    def test_forecast_window_exceeds_48_hours_rejected(self) -> None:
        forecast_start = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        forecast_end = forecast_start + timedelta(hours=49)
        cells = ()
        with pytest.raises(
            ValueError, match="forecast window must not exceed 48 hours"
        ):
            WeatherGrid(
                route_id="route-1",
                route_plan_id="plan-1",
                forecast_start=forecast_start,
                forecast_end=forecast_end,
                cells=cells,
            )


class TestBuildWeatherGrid:
    def test_build_grid_with_mock_provider(self) -> None:
        checkpoints = (
            Coordinate(latitude=40.0, longitude=-100.0),
            Coordinate(latitude=40.5, longitude=-100.5),
        )
        departure_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        load_weight_lb = 35000.0

        mock_provider = MagicMock()
        mock_provider.get_weather.return_value = WeatherObservation(
            wind_mph=20.0, rain_inches_per_hour=0.05, snow_inches_per_hour=0.0
        )

        grid = build_weather_grid(
            route_plan_id="plan-1",
            route_id="route-1",
            checkpoints=checkpoints,
            departure_at=departure_at,
            load_weight_lb=load_weight_lb,
            offset_hours=1,
            weather_provider=mock_provider,
        )

        assert grid.route_id == "route-1"
        assert grid.route_plan_id == "plan-1"
        assert len(grid.cells) == 2
        assert grid.cells[0].risk_level == RiskLevel.LOW
        assert grid.cells[1].risk_level == RiskLevel.LOW

    def test_build_grid_with_unavailable_weather(self) -> None:
        checkpoints = (Coordinate(latitude=40.0, longitude=-100.0),)
        departure_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        load_weight_lb = 35000.0

        mock_provider = MagicMock()
        mock_provider.get_weather.return_value = None

        grid = build_weather_grid(
            route_plan_id="plan-1",
            route_id="route-1",
            checkpoints=checkpoints,
            departure_at=departure_at,
            load_weight_lb=load_weight_lb,
            offset_hours=0,
            weather_provider=mock_provider,
        )

        assert len(grid.cells) == 1
        assert grid.cells[0].risk_level is None
        assert grid.cells[0].risk_score is None

    def test_invalid_offset_hours_rejected(self) -> None:
        checkpoints = (Coordinate(latitude=40.0, longitude=-100.0),)
        departure_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        load_weight_lb = 35000.0
        mock_provider = MagicMock()

        with pytest.raises(
            ValueError, match="offset_hours must be an integer in 0..48"
        ):
            build_weather_grid(
                route_plan_id="plan-1",
                route_id="route-1",
                checkpoints=checkpoints,
                departure_at=departure_at,
                load_weight_lb=load_weight_lb,
                offset_hours=49,
                weather_provider=mock_provider,
            )

    def test_negative_offset_hours_rejected(self) -> None:
        checkpoints = (Coordinate(latitude=40.0, longitude=-100.0),)
        departure_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        load_weight_lb = 35000.0
        mock_provider = MagicMock()

        with pytest.raises(
            ValueError, match="offset_hours must be an integer in 0..48"
        ):
            build_weather_grid(
                route_plan_id="plan-1",
                route_id="route-1",
                checkpoints=checkpoints,
                departure_at=departure_at,
                load_weight_lb=load_weight_lb,
                offset_hours=-1,
                weather_provider=mock_provider,
            )

    def test_empty_checkpoints_rejected(self) -> None:
        departure_at = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
        load_weight_lb = 35000.0
        mock_provider = MagicMock()

        with pytest.raises(ValueError, match="route must have at least one checkpoint"):
            build_weather_grid(
                route_plan_id="plan-1",
                route_id="route-1",
                checkpoints=(),
                departure_at=departure_at,
                load_weight_lb=load_weight_lb,
                offset_hours=0,
                weather_provider=mock_provider,
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
