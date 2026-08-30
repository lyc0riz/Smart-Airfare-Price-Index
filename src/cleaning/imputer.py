"""Sold-out and missing value imputation using Jevons cell-relative method.

For cells with no available quotes or all quotes sold-out on the observation
date, imputes prices using the geometric-mean growth factor of matched
flights between the previous day and today, with hierarchical fallback.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from math import exp, log
from typing import Any, Optional

from src.storage.supabase_sink import SupabaseSink

logger = logging.getLogger(__name__)

CellKey = tuple[str, str, int]  # (origin, destination, advance_windows)
FlightMatchKey = tuple[str, str, str, date, str, str]  # carrier, flight_number, journey_date, dep, arr


@dataclass
class ImputationResult:
    """Summary of an imputation run."""
    observation_date: date
    cells_checked: int = 0
    cells_missing: int = 0
    cells_imputed: int = 0
    cells_failed: int = 0
    fallback_used: dict[str, int] = None

    def __post_init__(self):
        if self.fallback_used is None:
            self.fallback_used = defaultdict(int)


def geometric_mean(prices: list[float]) -> float:
    """Unweighted geometric mean (Jevons price aggregate)."""
    positive = [p for p in prices if p > 0]
    if not positive:
        return 0.0
    return exp(sum(log(p) for p in positive) / len(positive))


def compute_growth_factor(
    current_prices: dict[FlightMatchKey, float],
    prior_prices: dict[FlightMatchKey, float],
) -> float:
    """Compute cell-relative Jevons growth factor R = G(current) / G(prior).

    Only considers flights present in BOTH days (matched by key).

    Args:
        current_prices: Matched flight key -> fare for observation date.
        prior_prices: Matched flight key -> fare for previous date.

    Returns:
        Growth factor (ratio of geometric means), or 1.0 if no matches.
    """
    matched_keys = set(current_prices.keys()) & set(prior_prices.keys())
    if not matched_keys:
        return 1.0

    current_vals = [current_prices[k] for k in matched_keys]
    prior_vals = [prior_prices[k] for k in matched_keys]

    g_current = geometric_mean(current_vals)
    g_prior = geometric_mean(prior_vals)

    if g_prior <= 0:
        return 1.0

    return g_current / g_prior


class Imputer:
    """Imputes missing/sold-out flight prices using cell-relative Jevons method."""

    def __init__(self, sink: SupabaseSink) -> None:
        """Initialize imputer with a connected SupabaseSink."""
        self.sink = sink

    async def _get_quotes_for_date(
        self,
        source_portal: str,
        observation_date: date,
        include_sold_out: bool = False,
    ) -> list[dict[str, Any]]:
        """Fetch all quotes for a source/date."""
        sold_out_clause = "" if include_sold_out else "AND is_sold_out = FALSE"
        rows = await self.sink.query(
            f"""
            SELECT origin, destination, advance_windows, journey_date,
                   carrier_code, flight_number, total_fare::float8 AS total_fare,
                   departure::time AS dep_time, arrival::time AS arr_time,
                   is_sold_out, is_imputed
            FROM flight_quotes
            WHERE source_portal = $1
              AND booking_date = $2
              {sold_out_clause}
              AND total_fare > 0
            """,
            source_portal,
            observation_date,
        )
        return [dict(r) for r in rows]

    async def _get_all_cells(self, source_portal: str) -> set[CellKey]:
        """Get all expected cells from route_weights × advance_window_weights."""
        route_rows = await self.sink.query(
            "SELECT origin, destination FROM route_weights"
        )
        window_rows = await self.sink.query(
            "SELECT advance_window FROM advance_window_weights WHERE source_portal = $1",
            source_portal,
        )
        routes = {(r["origin"], r["destination"]) for r in route_rows}
        windows = {r["advance_window"] for r in window_rows}
        return {(o, d, w) for (o, d) in routes for w in windows}

    def _build_flight_match_key(self, quote: dict[str, Any]) -> FlightMatchKey:
        """Build the matching key for cross-day flight comparison."""
        return (
            quote["carrier_code"] or "",
            quote["flight_number"] or "",
            quote["journey_date"],
            quote["dep_time"].strftime("%H:%M") if quote["dep_time"] else "",
            quote["arr_time"].strftime("%H:%M") if quote["arr_time"] else "",
        )

    def _group_by_cell(self, quotes: list[dict[str, Any]]) -> dict[CellKey, list[dict[str, Any]]]:
        """Group quotes by cell (origin, destination, advance_windows)."""
        grouped = defaultdict(list)
        for q in quotes:
            key: CellKey = (q["origin"], q["destination"], q["advance_windows"])
            grouped[key].append(q)
        return grouped

    def _get_matched_prices(
        self,
        current_quotes: list[dict[str, Any]],
        prior_quotes: list[dict[str, Any]],
    ) -> tuple[dict[FlightMatchKey, float], dict[FlightMatchKey, float]]:
        """Extract matched flight prices keyed by FlightMatchKey."""
        current_map = {}
        for q in current_quotes:
            key = self._build_flight_match_key(q)
            if all(key):  # Skip incomplete keys
                current_map[key] = q["total_fare"]

        prior_map = {}
        for q in prior_quotes:
            key = self._build_flight_match_key(q)
            if all(key):
                prior_map[key] = q["total_fare"]

        return current_map, prior_map

    def _compute_fallback_growth(
        self,
        cell: CellKey,
        cell_growth: dict[CellKey, float],
        route_growth: dict[tuple[str, str], float],
        national_growth: float,
    ) -> tuple[float, str]:
        """Determine growth factor using hierarchical fallback.

        Returns:
            (growth_factor, fallback_level)
        """
        if cell in cell_growth and cell_growth[cell] > 0:
            return cell_growth[cell], "cell"

        route = (cell[0], cell[1])
        if route in route_growth and route_growth[route] > 0:
            return route_growth[route], "route"

        if national_growth > 0:
            return national_growth, "national"

        return 1.0, "none"

    async def _get_route_growth(
        self,
        current_by_cell: dict[CellKey, list[dict]],
        prior_by_cell: dict[CellKey, list[dict]],
    ) -> dict[tuple[str, str], float]:
        """Compute route-level growth factors (all windows combined)."""
        route_current = defaultdict(list)
        route_prior = defaultdict(list)

        for cell, quotes in current_by_cell.items():
            route = (cell[0], cell[1])
            for q in quotes:
                route_current[route].append(q["total_fare"])

        for cell, quotes in prior_by_cell.items():
            route = (cell[0], cell[1])
            for q in quotes:
                route_prior[route].append(q["total_fare"])

        growth = {}
        for route in set(route_current.keys()) & set(route_prior.keys()):
            g_cur = geometric_mean(route_current[route])
            g_prior = geometric_mean(route_prior[route])
            if g_prior > 0:
                growth[route] = g_cur / g_prior
        return growth

    async def _get_national_growth(
        self,
        current_quotes: list[dict[str, Any]],
        prior_quotes: list[dict[str, Any]],
    ) -> float:
        """Compute national-level growth factor."""
        cur_fares = [q["total_fare"] for q in current_quotes]
        prior_fares = [q["total_fare"] for q in prior_quotes]
        g_cur = geometric_mean(cur_fares)
        g_prior = geometric_mean(prior_fares)
        return g_cur / g_prior if g_prior > 0 else 1.0

    async def impute_source(
        self,
        source_portal: str,
        observation_date: date,
    ) -> ImputationResult:
        """Run imputation for a single source portal.

        Args:
            source_portal: 'Ixigo' or 'Google Flights'
            observation_date: The scrape date to impute for.

        Returns:
            ImputationResult with summary statistics.
        """
        result = ImputationResult(observation_date=observation_date)
        prior_date = observation_date - timedelta(days=1)

        # Fetch current and prior day quotes
        current_quotes = await self._get_quotes_for_date(source_portal, observation_date)
        prior_quotes = await self._get_quotes_for_date(source_portal, prior_date)

        all_cells = await self._get_all_cells(source_portal)
        result.cells_checked = len(all_cells)

        current_by_cell = self._group_by_cell(current_quotes)
        prior_by_cell = self._group_by_cell(prior_quotes)

        # Compute cell-level growth factors
        cell_growth = {}
        for cell in all_cells:
            cur_quotes = current_by_cell.get(cell, [])
            prior_quotes_cell = prior_by_cell.get(cell, [])
            cur_map, prior_map = self._get_matched_prices(cur_quotes, prior_quotes_cell)
            cell_growth[cell] = compute_growth_factor(cur_map, prior_map)

        # Route and national fallback growth
        route_growth = await self._get_route_growth(current_by_cell, prior_by_cell)
        national_growth = await self._get_national_growth(current_quotes, prior_quotes)

        # Identify missing/sold-out cells
        cells_to_impute = []
        for cell in all_cells:
            quotes = current_by_cell.get(cell, [])
            has_available = any(not q["is_sold_out"] for q in quotes)
            if not has_available:
                result.cells_missing += 1
                cells_to_impute.append(cell)

        # For each missing cell, find prior day price and apply growth
        for cell in cells_to_impute:
            origin, destination, window = cell

            # Find prior price for this exact flight (by match key) in this cell
            prior_cell_quotes = prior_by_cell.get(cell, [])
            if not prior_cell_quotes:
                result.cells_failed += 1
                continue

            # Use the median prior fare in this cell as base
            prior_fares = [q["total_fare"] for q in prior_cell_quotes if q["total_fare"] > 0]
            if not prior_fares:
                result.cells_failed += 1
                continue

            base_price = geometric_mean(prior_fares)
            growth_factor, fallback = self._compute_fallback_growth(
                cell, cell_growth, route_growth, national_growth
            )

            result.fallback_used[fallback] += 1

            imputed_price = round(base_price * growth_factor, 2)

            # Get journey_date from prior quotes (should be same)
            journey_date = prior_cell_quotes[0]["journey_date"]

            # Create imputed quote record
            imputed_quote = {
                "quote_id": None,  # Will be generated
                "source_portal": source_portal,
                "scraping_date_time": None,  # Use current time
                "journey_date": journey_date,
                "origin": origin,
                "destination": destination,
                "advance_windows": window,
                "carrier_code": None,
                "carrier": "IMPUTED",
                "flight_number": f"IMP-{origin}-{destination}-{window}",
                "journey_class": "ECONOMY",
                "fare": imputed_price,
                "base_fare": imputed_price,
                "fees": 0.0,
                "tax_udf": 0.0,
                "tax_asf": 0.0,
                "tax_gst": 0.0,
                "taxes": 0.0,
                "total_fare": imputed_price,
                "departure": None,
                "arrival": None,
                "duration_min": None,
                "stops": 0,
                "is_sold_out": False,
                "is_imputed": True,
                "data_hash": f"imputed_{source_portal}_{origin}_{destination}_{window}_{observation_date}",
            }

            try:
                await self.sink.upsert_flight_quotes([imputed_quote])
                result.cells_imputed += 1
                logger.debug(
                    f"Imputed {source_portal} {cell}: base={base_price:.2f}, "
                    f"growth={growth_factor:.4f} ({fallback}), imputed={imputed_price:.2f}"
                )
            except Exception as e:
                logger.error(f"Failed to impute {cell}: {e}")
                result.cells_failed += 1

        logger.info(
            f"Imputation {source_portal} {observation_date}: "
            f"checked={result.cells_checked}, missing={result.cells_missing}, "
            f"imputed={result.cells_imputed}, failed={result.cells_failed}, "
            f"fallbacks={dict(result.fallback_used)}"
        )
        return result

    async def impute_all_sources(self, observation_date: date) -> dict[str, ImputationResult]:
        """Run imputation for all configured sources."""
        results = {}
        for portal in ("Ixigo", "Google Flights"):
            results[portal] = await self.impute_source(portal, observation_date)
        return results


async def run_imputation(
    sink: SupabaseSink,
    observation_date: date,
) -> dict[str, ImputationResult]:
    """Convenience function to run imputation for all sources."""
    imputer = Imputer(sink)
    return await imputer.impute_all_sources(observation_date)