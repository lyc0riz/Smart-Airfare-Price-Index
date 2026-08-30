"""Tests for Jevons aggregates and weighted Laspeyres APIx computation."""

from datetime import date

import pytest

from src.indexing.base_calibrator import BaseCalibrator, geometric_mean
from src.indexing.laspeyres_engine import LaspeyresEngine
from src.indexing.jevons import compute_cell_indices


CELL_A = ("DEL", "BOM", 7)
CELL_B = ("DEL", "BLR", 15)
CELL_C = ("BOM", "BLR", 30)

ROUTE_WEIGHTS = {
    ("DEL", "BOM"): 0.28,
    ("DEL", "BLR"): 0.20,
    ("BOM", "BLR"): 0.16,
}
WINDOW_WEIGHTS = {7: 0.20, 15: 0.20, 30: 0.20}


class TestGeometricMean:
    def test_basic_values(self):
        assert geometric_mean([2.0, 8.0]) == pytest.approx(4.0)

    def test_single_value(self):
        assert geometric_mean([5000.0]) == pytest.approx(5000.0)

    def test_empty_returns_zero(self):
        assert geometric_mean([]) == 0.0

    def test_nonpositive_filtered(self):
        assert geometric_mean([100.0, 0.0, -5.0]) == pytest.approx(100.0)

    def test_jevons_symmetry(self):
        """Jevons is invariant to price-ratio symmetry."""
        g1 = geometric_mean([100.0, 200.0])
        g2 = geometric_mean([200.0, 400.0])
        assert g2 / g1 == pytest.approx(2.0)


class TestComputeCellIndices:
    def _compute(self, current, base):
        return compute_cell_indices(
            current, base, ROUTE_WEIGHTS, WINDOW_WEIGHTS
        )

    def test_identical_base_prices_index_exactly_100(self):
        """All cells with unchanged prices must yield exactly 100.0."""
        prices = {
            CELL_A: 5750.0,
            CELL_B: 8100.0,
            CELL_C: 4300.0,
        }
        rows, overall = self._compute(prices, dict(prices))
        assert len(rows) == 3
        for row in rows:
            assert row["relative_index"] == 100.0
            assert row["contribution"] == pytest.approx(
                row["route_weight"]
                * row["advance_window_weight"]
                * 100.0
            )
        assert overall == 100.0

    def test_identical_base_prices_exact_float_equality(self):
        """No floating-point drift: index is exactly 100.0, not approx."""
        prices = {CELL_A: 12345.67, CELL_B: 999.99}
        rows, overall = self._compute(prices, dict(prices))
        for row in rows:
            assert row["relative_index"] == 100.0
        assert overall == 100.0

    def test_price_increase_raises_index(self):
        base = {CELL_A: 5000.0}
        current = {CELL_A: 5500.0}
        rows, overall = self._compute(current, base)
        assert rows[0]["relative_index"] == pytest.approx(110.0)
        assert overall == pytest.approx(110.0)

    def test_overall_is_weight_normalized(self):
        """APIx = Σ(w·I_rel) / Σw across covered cells."""
        current = {CELL_A: 6000.0, CELL_B: 8000.0}
        base = {CELL_A: 5000.0, CELL_B: 8000.0}
        rows, overall = self._compute(current, base)
        expected = (
            0.28 * 0.20 * 120.0 + 0.20 * 0.20 * 100.0
        ) / (0.28 * 0.20 + 0.20 * 0.20)
        assert overall == pytest.approx(expected)

    def test_cell_missing_base_skipped(self):
        current = {CELL_A: 5750.0, CELL_B: 8100.0}
        base = {CELL_A: 5750.0}
        rows, _ = self._compute(current, base)
        assert len(rows) == 1
        assert rows[0]["origin"] == "DEL"
        assert rows[0]["destination"] == "BOM"

    def test_cell_missing_weight_skipped(self):
        cell_unknown_route = ("XXX", "YYY", 7)
        current = {CELL_A: 5750.0, cell_unknown_route: 1000.0}
        base = {CELL_A: 5750.0, cell_unknown_route: 1000.0}
        rows, _ = self._compute(current, base)
        assert len(rows) == 1

    def test_zero_base_price_skipped(self):
        current = {CELL_A: 5750.0}
        base = {CELL_A: 0.0}
        rows, overall = self._compute(current, base)
        assert rows == []
        assert overall == 0.0

    def test_empty_inputs(self):
        rows, overall = self._compute({}, {})
        assert rows == []
        assert overall == 0.0


class TestBaseCalibratorAggregate:
    def _quotes(self, fares_by_cell):
        quotes = []
        for (o, dest, w), fares in fares_by_cell.items():
            for fare in fares:
                quotes.append({
                    "origin": o,
                    "destination": dest,
                    "advance_windows": w,
                    "journey_date": date(2026, 9, 2),
                    "total_fare": fare,
                })
        return quotes

    def test_aggregate_jevons_geometric_mean_per_cell(self):
        quotes = self._quotes({CELL_A: [4000.0, 9000.0]})
        agg = BaseCalibrator.aggregate_jevons(quotes)
        assert agg[CELL_A]["jevons"] == pytest.approx(6000.0)

    def test_aggregate_jevons_multiple_cells(self):
        quotes = self._quotes({
            CELL_A: [5000.0, 5000.0],
            CELL_B: [8000.0],
        })
        agg = BaseCalibrator.aggregate_jevons(quotes)
        assert len(agg) == 2
        assert agg[CELL_A]["jevons"] == 5000.0
        assert agg[CELL_B]["jevons"] == 8000.0

    def test_journey_date_is_max(self):
        quotes = [
            {
                "origin": "DEL",
                "destination": "BOM",
                "advance_windows": 7,
                "journey_date": date(2026, 9, 2),
                "total_fare": 5000.0,
            },
            {
                "origin": "DEL",
                "destination": "BOM",
                "advance_windows": 7,
                "journey_date": date(2026, 9, 3),
                "total_fare": 5200.0,
            },
        ]
        agg = BaseCalibrator.aggregate_jevons(quotes)
        assert agg[CELL_A]["journey_date"] == date(2026, 9, 3)


class TestLaspeyresEngineConstruction:
    def test_instantiation_with_mock_sink(self):
        class FakeSink:
            pass

        engine = LaspeyresEngine(FakeSink())
        assert isinstance(engine.calibrator, BaseCalibrator)
