"""Standalone Jevons elementary aggregate computation.

Pure functions for geometric mean price aggregation and Laspeyres
index cell computation. No I/O dependencies — suitable for testing
and reuse in pipeline orchestration.
"""

import logging
from collections import defaultdict
from datetime import date
from math import exp, log
from typing import Any

logger = logging.getLogger(__name__)

CellKey = tuple[str, str, int]


def geometric_mean(prices: list[float]) -> float:
    """Unweighted geometric mean (Jevons price aggregate).

    Args:
        prices: Positive price observations.

    Returns:
        Geometric mean, or 0.0 for an empty input.
    """
    positive = [p for p in prices if p > 0]
    if not positive:
        return 0.0
    return exp(sum(log(p) for p in positive) / len(positive))


def aggregate_jevons(
    quotes: list[dict[str, Any]],
) -> dict[tuple[str, str, int], dict[str, Any]]:
    """Group quotes into cells and compute Jevons geometric means.

    Args:
        quotes: Quote dicts with keys: origin, destination, advance_windows,
                journey_date, total_fare.

    Returns:
        Mapping of cell key (origin, destination, advance_windows) to
        {'journey_date': date, 'jevons': float}.
    """
    grouped: dict[tuple[str, str, int], list[float]] = defaultdict(list)
    journey_dates: dict[tuple[str, str, int], date] = {}

    for q in quotes:
        key = (
            q["origin"],
            q["destination"],
            q["advance_windows"],
        )
        grouped[key].append(q["total_fare"])
        jd = q["journey_date"]
        if key not in journey_dates or jd > journey_dates[key]:
            journey_dates[key] = jd

    return {
        key: {
            "journey_date": journey_dates[key],
            "jevons": round(geometric_mean(fares), 2),
        }
        for key, fares in grouped.items()
    }


CellKey = tuple[str, str, int]


def compute_cell_indices(
    current: dict[CellKey, float],
    base: dict[CellKey, float],
    route_weights: dict[tuple[str, str], float],
    window_weights: dict[int, float],
) -> tuple[list[dict[str, Any]], float]:
    """Compute per-cell relative indices and the overall APIx.

    Pure function (no I/O) for testability. Cells are matched on the
    composite key; cells missing a base period or weight are skipped.

    Args:
        current: Jevons aggregate price per cell for the observation.
        base: Base period price per cell.
        route_weights: DGCA traffic weight per (origin, destination).
        window_weights: Weight per advance window.

    Returns:
        Tuple of (cell rows with keys origin, destination,
        advance_windows, relative_index, route_weight,
        advance_window_weight, contribution; overall_apix).
    """
    rows: list[dict[str, Any]] = []
    weighted_sum = 0.0
    total_weight = 0.0

    for cell, price_now in sorted(current.items()):
        origin, destination, window = cell
        price_base = base.get(cell)
        if price_base is None or price_base <= 0:
            continue

        r_weight = route_weights.get((origin, destination))
        w_weight = window_weights.get(window)
        if r_weight is None or w_weight is None:
            continue

        relative = (price_now / price_base) * 100.0
        combined = r_weight * w_weight
        contribution = combined * relative

        rows.append({
            "origin": origin,
            "destination": destination,
            "advance_windows": window,
            "relative_index": relative,
            "route_weight": r_weight,
            "advance_window_weight": w_weight,
            "contribution": contribution,
        })

        weighted_sum += contribution
        total_weight += combined

    overall = (
        weighted_sum / total_weight if total_weight > 0 else 0.0
    )
    return rows, overall


def compute_overall_apix(
    cell_rows: list[dict[str, Any]],
) -> float:
    """Compute overall APIx from cell rows (weight-normalized sum)."""
    weighted_sum = sum(r["contribution"] for r in cell_rows)
    total_weight = sum(
        r["route_weight"] * r["advance_window_weight"] for r in cell_rows
    )
    return weighted_sum / total_weight if total_weight > 0 else 0.0