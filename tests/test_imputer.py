"""Tests for Jevons cell-relative imputation engine."""

import pytest
from datetime import date, time
from unittest.mock import AsyncMock, MagicMock, patch

from src.cleaning.imputer import (
    ImputationResult,
    compute_growth_factor,
    geometric_mean,
    Imputer,
    FlightMatchKey,
    CellKey,
)


class TestGeometricMean:
    def test_basic(self):
        assert geometric_mean([2.0, 8.0]) == pytest.approx(4.0)

    def test_single(self):
        assert geometric_mean([5000.0]) == pytest.approx(5000.0)

    def test_empty(self):
        assert geometric_mean([]) == 0.0

    def test_zeros_filtered(self):
        assert geometric_mean([100.0, 0.0, -5.0]) == pytest.approx(100.0)


class TestComputeGrowthFactor:
    def test_identical_prices(self):
        prices = {("6E", "6E-101", date(2026, 9, 1), "08:30", "10:45"): 5000.0}
        assert compute_growth_factor(prices, prices) == 1.0

    def test_price_increase(self):
        prior = {("6E", "6E-101", date(2026, 9, 1), "08:30", "10:45"): 5000.0}
        current = {("6E", "6E-101", date(2026, 9, 1), "08:30", "10:45"): 5500.0}
        assert compute_growth_factor(current, prior) == pytest.approx(1.1)

    def test_no_matches_returns_one(self):
        prior = {("6E", "6E-101", date(2026, 9, 1), "08:30", "10:45"): 5000.0}
        current = {("AI", "AI-202", date(2026, 9, 1), "09:00", "11:00"): 6000.0}
        assert compute_growth_factor(current, prior) == 1.0

    def test_multiple_matches(self):
        prior = {
            ("6E", "6E-101", date(2026, 9, 1), "08:30", "10:45"): 5000.0,
            ("AI", "AI-202", date(2026, 9, 1), "09:00", "11:00"): 6000.0,
        }
        current = {
            ("6E", "6E-101", date(2026, 9, 1), "08:30", "10:45"): 5500.0,
            ("AI", "AI-202", date(2026, 9, 1), "09:00", "11:00"): 6600.0,
        }
        assert compute_growth_factor(current, prior) == pytest.approx(1.1)


class TestImputerUnit:
    """Unit tests for Imputer helper methods (mocking sink)."""

    @pytest.fixture
    def mock_sink(self):
        return AsyncMock()

    @pytest.fixture
    def imputer(self, mock_sink):
        return Imputer(mock_sink)

    def test_flight_match_key(self, imputer):
        quote = {
            "carrier_code": "6E",
            "flight_number": "6E-101",
            "journey_date": date(2026, 9, 1),
            "dep_time": time(8, 30),
            "arr_time": time(10, 45),
        }
        key = imputer._build_flight_match_key(quote)
        assert key == ("6E", "6E-101", date(2026, 9, 1), "08:30", "10:45")

    def test_flight_match_key_none_carrier(self, imputer):
        quote = {
            "carrier_code": None,
            "flight_number": "GF-NA-08:30-10:45",
            "journey_date": date(2026, 9, 1),
            "dep_time": time(8, 30),
            "arr_time": time(10, 45),
        }
        key = imputer._build_flight_match_key(quote)
        assert key[0] == ""  # Empty string for None carrier

    def test_group_by_cell(self, imputer):
        quotes = [
            {"origin": "DEL", "destination": "BOM", "advance_windows": 7, "total_fare": 5000},
            {"origin": "DEL", "destination": "BOM", "advance_windows": 7, "total_fare": 6000},
            {"origin": "DEL", "destination": "BLR", "advance_windows": 15, "total_fare": 8000},
        ]
        grouped = imputer._group_by_cell(quotes)
        assert len(grouped) == 2
        assert len(grouped[("DEL", "BOM", 7)]) == 2
        assert len(grouped[("DEL", "BLR", 15)]) == 1


class TestComputeFallbackGrowth:
    @pytest.fixture
    def imputer(self):
        return Imputer(AsyncMock())

    def test_cell_growth_used(self, imputer):
        cell = ("DEL", "BOM", 7)
        cell_growth = {cell: 1.05}
        route_growth = {}
        national = 1.02
        growth, level = imputer._compute_fallback_growth(cell, cell_growth, route_growth, national)
        assert growth == 1.05
        assert level == "cell"

    def test_route_fallback(self, imputer):
        cell = ("DEL", "BOM", 7)
        cell_growth = {}
        route_growth = {("DEL", "BOM"): 1.03}
        national = 1.02
        growth, level = imputer._compute_fallback_growth(cell, cell_growth, route_growth, national)
        assert growth == 1.03
        assert level == "route"

    def test_national_fallback(self, imputer):
        cell = ("DEL", "BOM", 7)
        cell_growth = {}
        route_growth = {}
        national = 1.02
        growth, level = imputer._compute_fallback_growth(cell, cell_growth, route_growth, national)
        assert growth == 1.02
        assert level == "national"

    def test_none_fallback(self, imputer):
        """When all growth factors are <= 0, returns 1.0 with 'none' level."""
        cell = ("DEL", "BOM", 7)
        cell_growth = {cell: 0.0}
        route_growth = {("DEL", "BOM"): 0.0}
        national = 0.0
        growth, level = imputer._compute_fallback_growth(cell, cell_growth, route_growth, national)
        assert growth == 1.0
        assert level == "none"

    def test_zero_growth_skipped(self, imputer):
        """Zero or negative growth should trigger fallback."""
        cell = ("DEL", "BOM", 7)
        cell_growth = {cell: 0.0}
        route_growth = {("DEL", "BOM"): 1.03}
        national = 1.0
        growth, level = imputer._compute_fallback_growth(cell, cell_growth, route_growth, national)
        assert growth == 1.03
        assert level == "route"


class TestImputationResult:
    def test_default_fallback_dict(self):
        r = ImputationResult(observation_date=date(2026, 9, 1))
        assert isinstance(r.fallback_used, dict)

    def test_fallback_counting(self):
        r = ImputationResult(observation_date=date(2026, 9, 1))
        r.fallback_used["cell"] = 5
        r.fallback_used["route"] = 3
        r.fallback_used["national"] = 1
        assert r.fallback_used["cell"] == 5
        assert r.fallback_used["route"] == 3
        assert r.fallback_used["national"] == 1


# Integration-style tests with mocked sink
class TestImputerIntegration:
    @pytest.mark.asyncio
    async def test_impute_source_no_missing_cells(self):
        """When all cells have available quotes, nothing to impute."""
        mock_sink = AsyncMock()
        
        async def query_side_effect(sql, *args):
            if "route_weights" in sql:
                return [{"origin": "DEL", "destination": "BOM"}]
            elif "advance_window_weights" in sql:
                return [{"advance_window": 7}]
            elif "booking_date" in sql and "is_sold_out = FALSE" in sql:
                # Current day quotes (available)
                return [{
                    "origin": "DEL", "destination": "BOM", "advance_windows": 7,
                    "journey_date": date(2026, 9, 2), "carrier_code": "6E",
                    "flight_number": "6E-101", "total_fare": 5000.0,
                    "dep_time": time(8, 30), "arr_time": time(10, 45),
                    "is_sold_out": False, "is_imputed": False
                }]
            elif "booking_date" in sql:
                # Prior day quotes
                return [{
                    "origin": "DEL", "destination": "BOM", "advance_windows": 7,
                    "journey_date": date(2026, 9, 2), "carrier_code": "6E",
                    "flight_number": "6E-101", "total_fare": 4800.0,
                    "dep_time": time(8, 30), "arr_time": time(10, 45),
                    "is_sold_out": False, "is_imputed": False
                }]
            return []

        mock_sink.query.side_effect = query_side_effect

        imputer = Imputer(mock_sink)
        result = await imputer.impute_source("Ixigo", date(2026, 9, 1))

        assert result.cells_checked == 1
        assert result.cells_missing == 0
        assert result.cells_imputed == 0
        assert result.cells_failed == 0

    @pytest.mark.asyncio
    async def test_impute_source_all_sold_out(self):
        """Cell with only sold-out quotes gets imputed."""
        mock_sink = AsyncMock()
        
        async def query_side_effect(sql, *args):
            if "route_weights" in sql:
                return [{"origin": "DEL", "destination": "BOM"}]
            elif "advance_window_weights" in sql:
                return [{"advance_window": 7}]
            elif "booking_date" in sql and "is_sold_out = FALSE" in sql:
                # Current day: sold out
                return [{
                    "origin": "DEL", "destination": "BOM", "advance_windows": 7,
                    "journey_date": date(2026, 9, 2), "carrier_code": "6E",
                    "flight_number": "6E-101", "total_fare": 5000.0,
                    "dep_time": time(8, 30), "arr_time": time(10, 45),
                    "is_sold_out": True, "is_imputed": False
                }]
            elif "booking_date" in sql:
                # Prior day: available
                return [{
                    "origin": "DEL", "destination": "BOM", "advance_windows": 7,
                    "journey_date": date(2026, 9, 2), "carrier_code": "6E",
                    "flight_number": "6E-101", "total_fare": 4800.0,
                    "dep_time": time(8, 30), "arr_time": time(10, 45),
                    "is_sold_out": False, "is_imputed": False
                }]
            return []

        mock_sink.query.side_effect = query_side_effect

        imputer = Imputer(mock_sink)
        result = await imputer.impute_source("Ixigo", date(2026, 9, 1))

        assert result.cells_checked == 1
        assert result.cells_missing == 1
        assert result.cells_imputed == 1
        assert result.cells_failed == 0
        # Verify upsert was called with imputed quote
        assert mock_sink.upsert_flight_quotes.called
        call_args = mock_sink.upsert_flight_quotes.call_args[0][0]
        assert call_args[0]["is_imputed"] is True
        assert call_args[0]["carrier"] == "IMPUTED"

    @pytest.mark.asyncio
    async def test_impute_source_no_prior_data(self):
        """Missing prior day data -> no imputation."""
        mock_sink = AsyncMock()
        
        async def query_side_effect(sql, *args):
            if "route_weights" in sql:
                return [{"origin": "DEL", "destination": "BOM"}]
            elif "advance_window_weights" in sql:
                return [{"advance_window": 7}]
            elif "booking_date" in sql and "is_sold_out = FALSE" in sql:
                # Current day: NO available quotes (all sold out filtered by query)
                return []
            elif "booking_date" in sql:
                # Prior day: no data
                return []
            return []

        mock_sink.query.side_effect = query_side_effect

        imputer = Imputer(mock_sink)
        result = await imputer.impute_source("Ixigo", date(2026, 9, 1))

        # Cell has no available quotes, but no prior data either
        # The cell should be detected as missing but fail to impute
        assert result.cells_missing == 1
        assert result.cells_imputed == 0
        assert result.cells_failed == 1


class TestRunImputation:
    @pytest.mark.asyncio
    async def test_run_imputation_calls_both_sources(self):
        mock_sink = AsyncMock()
        
        call_count = {"route": 0, "window": 0, "quotes": 0}
        
        async def query_side_effect(sql, *args):
            if "route_weights" in sql:
                call_count["route"] += 1
                return [{"origin": "DEL", "destination": "BOM"}]
            elif "advance_window_weights" in sql:
                call_count["window"] += 1
                return [{"advance_window": 7}]
            elif "booking_date" in sql:
                call_count["quotes"] += 1
                return []
            return []

        mock_sink.query.side_effect = query_side_effect

        from src.cleaning.imputer import run_imputation
        results = await run_imputation(mock_sink, date(2026, 9, 1))

        assert "Ixigo" in results
        assert "Google Flights" in results
        # Should query route_weights and window_weights for each portal
        assert call_count["route"] == 2
        assert call_count["window"] == 2