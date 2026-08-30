"""Tests for jevons.py pure functions."""

import pytest
from datetime import date

from src.indexing.jevons import (
    CellKey,
    geometric_mean,
    aggregate_jevons,
    compute_cell_indices,
    compute_overall_apix,
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

    def test_jevons_symmetry(self):
        g1 = geometric_mean([100.0, 200.0])
        g2 = geometric_mean([200.0, 400.0])
        assert g2 / g1 == pytest.approx(2.0)


class TestAggregateJevons:
    def test_single_cell(self):
        quotes = [
            {"origin": "DEL", "destination": "BOM", "advance_windows": 7,
             "journey_date": date(2026, 9, 2), "total_fare": 5000.0},
            {"origin": "DEL", "destination": "BOM", "advance_windows": 7,
             "journey_date": date(2026, 9, 2), "total_fare": 6000.0},
        ]
        result = aggregate_jevons(quotes)
        assert len(result) == 1
        key = ("DEL", "BOM", 7)
        assert result[key]["jevons"] == pytest.approx(5477.23, rel=0.01)
        assert result[key]["journey_date"] == date(2026, 9, 2)

    def test_multiple_cells(self):
        quotes = [
            {"origin": "DEL", "destination": "BOM", "advance_windows": 7,
             "journey_date": date(2026, 9, 2), "total_fare": 5000.0},
            {"origin": "DEL", "destination": "BLR", "advance_windows": 15,
             "journey_date": date(2026, 9, 2), "total_fare": 8000.0},
        ]
        result = aggregate_jevons(quotes)
        assert len(result) == 2
        assert result[("DEL", "BOM", 7)]["jevons"] == 5000.0
        assert result[("DEL", "BLR", 15)]["jevons"] == 8000.0

    def test_journey_date_max(self):
        quotes = [
            {"origin": "DEL", "destination": "BOM", "advance_windows": 7,
             "journey_date": date(2026, 9, 2), "total_fare": 5000.0},
            {"origin": "DEL", "destination": "BOM", "advance_windows": 7,
             "journey_date": date(2026, 9, 3), "total_fare": 5200.0},
        ]
        result = aggregate_jevons(quotes)
        assert result[("DEL", "BOM", 7)]["journey_date"] == date(2026, 9, 3)

    def test_empty_quotes(self):
        assert aggregate_jevons([]) == {}


class TestComputeCellIndices:
    ROUTE_WEIGHTS = {("DEL", "BOM"): 0.28, ("DEL", "BLR"): 0.20}
    WINDOW_WEIGHTS = {7: 0.20, 15: 0.20}

    def _compute(self, current, base):
        from src.indexing.jevons import compute_cell_indices
        return compute_cell_indices(current, base, self.ROUTE_WEIGHTS, self.WINDOW_WEIGHTS)

    def test_identical_base_prices_index_100(self):
        prices = {("DEL", "BOM", 7): 5750.0, ("DEL", "BLR", 15): 8100.0}
        rows, overall = self._compute(prices, dict(prices))
        assert len(rows) == 2
        for row in rows:
            assert row["relative_index"] == 100.0
        assert overall == 100.0

    def test_identical_base_prices_exact_float_equality(self):
        prices = {("DEL", "BOM", 7): 12345.67, ("DEL", "BLR", 15): 999.99}
        rows, overall = self._compute(prices, dict(prices))
        for row in rows:
            assert row["relative_index"] == 100.0
        assert overall == 100.0

    def test_price_increase_raises_index(self):
        base = {("DEL", "BOM", 7): 5000.0}
        current = {("DEL", "BOM", 7): 5500.0}
        rows, overall = self._compute(current, base)
        assert rows[0]["relative_index"] == pytest.approx(110.0)
        assert overall == pytest.approx(110.0)

    def test_overall_is_weight_normalized(self):
        current = {("DEL", "BOM", 7): 6000.0, ("DEL", "BLR", 15): 8000.0}
        base = {("DEL", "BOM", 7): 5000.0, ("DEL", "BLR", 15): 8000.0}
        rows, overall = self._compute(current, base)
        expected = (
            0.28 * 0.20 * 120.0 + 0.20 * 0.20 * 100.0
        ) / (0.28 * 0.20 + 0.20 * 0.20)
        assert overall == pytest.approx(expected)

    def test_cell_missing_base_skipped(self):
        current = {("DEL", "BOM", 7): 5750.0, ("DEL", "BLR", 15): 8100.0}
        base = {("DEL", "BOM", 7): 5750.0}
        rows, _ = self._compute(current, base)
        assert len(rows) == 1
        assert rows[0]["origin"] == "DEL"
        assert rows[0]["destination"] == "BOM"

    def test_cell_missing_weight_skipped(self):
        cell_unknown = ("XXX", "YYY", 7)
        current = {("DEL", "BOM", 7): 5750.0, cell_unknown: 1000.0}
        base = {("DEL", "BOM", 7): 5750.0, cell_unknown: 1000.0}
        rows, _ = self._compute(current, base)
        assert len(rows) == 1

    def test_zero_base_price_skipped(self):
        current = {("DEL", "BOM", 7): 5750.0}
        base = {("DEL", "BOM", 7): 0.0}
        rows, overall = self._compute(current, base)
        assert rows == []
        assert overall == 0.0

    def test_empty_inputs(self):
        rows, overall = self._compute({}, {})
        assert rows == []
        assert overall == 0.0


class TestComputeOverallApix:
    def test_from_cell_rows(self):
        rows = [
            {"route_weight": 0.28, "advance_window_weight": 0.20, "contribution": 5.6},
            {"route_weight": 0.20, "advance_window_weight": 0.20, "contribution": 2.0},
        ]
        apix = compute_overall_apix(rows)
        expected = (5.6 + 2.0) / (0.28*0.20 + 0.20*0.20)
        assert apix == pytest.approx(expected)

    def test_empty_rows(self):
        assert compute_overall_apix([]) == 0.0