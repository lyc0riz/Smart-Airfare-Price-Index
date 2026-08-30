"""Tests for the Truth Triangle cross-source parity engine."""

import pytest
from datetime import date

from src.validation.truth_triangle import (
    MatchKey,
    ParityResult,
    build_match_key,
    compare_sources,
)

D = date(2026, 9, 2)


def _key(
    origin="DEL",
    destination="BOM",
    carrier="6E",
    dep="08:30",
    arr="10:45",
    journey_date=D,
) -> MatchKey:
    return (str(journey_date), origin, destination, carrier, dep, arr)


class TestBuildMatchKey:
    def test_normalizes_case(self):
        k1 = build_match_key(D, "del", "bom", "6e", "08:30", "10:45")
        k2 = build_match_key(D, "DEL", "BOM", "6E", "08:30", "10:45")
        assert k1 == k2

    def test_none_carrier_stays_none(self):
        key = build_match_key(D, "DEL", "BOM", None, "08:30", "10:45")
        assert key[3] is None

    def test_time_objects_normalized_to_hhmm(self):
        from datetime import time

        k1 = build_match_key(D, "DEL", "BOM", "6E", time(8, 30), time(10, 45))
        k2 = build_match_key(D, "DEL", "BOM", "6E", "08:30", "10:45")
        assert k1 == k2


class TestCompareSources:
    def test_identical_fares_all_agree(self):
        keys = [_key(), _key(carrier="AI"), _key(dep="17:40", arr="22:40")]
        primary = {k: 5750.0 for k in keys}
        secondary = {k: 5750.0 for k in keys}
        result = compare_sources(primary, secondary)
        assert result.matched_pairs == 3
        assert result.agreed_pairs == 3
        assert result.disparity_pairs == 0
        assert result.agreement_rate == 1.0
        assert result.disparities == []

    def test_identical_fares_exact_100_agreement(self):
        key = _key()
        result = compare_sources({key: 9999.99}, {key: 9999.99})
        assert result.agreement_rate == 1.0

    def test_small_delta_within_tolerance_agrees(self):
        key = _key()
        # 5750 vs 5790 → 0.696% delta, within 1%
        result = compare_sources({key: 5750.0}, {key: 5790.0})
        assert result.agreed_pairs == 1
        assert result.disparity_pairs == 0

    def test_large_delta_flagged_with_primary_preferred(self):
        key = _key()
        result = compare_sources({key: 5000.0}, {key: 6000.0})
        assert result.disparity_pairs == 1
        d = result.disparities[0]
        assert d["delta_pct"] == pytest.approx(20.0)
        assert d["preferred_source"] == "Ixigo"
        assert d["primary_fare"] == 5000.0
        assert d["secondary_fare"] == 6000.0

    def test_unmatched_counts(self):
        only_primary = _key()
        only_secondary = _key(carrier="AI")
        shared = _key(carrier="QP")
        result = compare_sources(
            {only_primary: 100.0, shared: 200.0},
            {only_secondary: 100.0, shared: 200.0},
        )
        assert result.matched_pairs == 1
        assert result.unmatched_primary == 1
        assert result.unmatched_secondary == 1

    def test_unknown_carrier_rows_never_match(self):
        """GF rows with NULL carrier_code cannot be matched."""
        gf_key = build_match_key(D, "DEL", "BOM", None, "08:30", "10:45")
        ixigo_key = build_match_key(D, "DEL", "BOM", "6E", "08:30", "10:45")
        result = compare_sources({ixigo_key: 100.0}, {gf_key: 100.0})
        assert result.matched_pairs == 0
        assert result.unmatched_primary == 1
        assert result.unmatched_secondary == 1

    def test_empty_inputs(self):
        result = compare_sources({}, {})
        assert result.matched_pairs == 0
        assert result.agreement_rate == 0.0

    def test_zero_fare_treated_as_disparity_not_crash(self):
        key = _key()
        result = compare_sources({key: 0.0}, {key: 100.0})
        assert result.disparity_pairs == 1


class TestParityResult:
    def test_agreement_rate_zero_division_guard(self):
        assert ParityResult().agreement_rate == 0.0
