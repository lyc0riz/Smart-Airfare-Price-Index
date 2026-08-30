"""Jevons elementary aggregates and base-period calibration.

Computes daily geometric-mean prices per index cell
`(origin, destination, advance_windows)` from `flight_quotes`, and
calibrates base-period prices from the first scrape date into the
`base_period_prices` table.

Price basis: `total_fare`. Both configured sources currently lack tax
decomposition (`base_fare = total_fare`, `taxes = 0`), so `total_fare`
is the only consistently populated price measure.
"""

import logging
from collections import defaultdict
from datetime import date
from math import exp, log
from typing import Any, Optional

from src.storage.supabase_sink import SupabaseSink

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


class BaseCalibrator:
    """Computes Jevons elementary aggregates and calibrates base periods."""

    def __init__(self, sink: SupabaseSink) -> None:
        """Initialize with a connected SupabaseSink.

        Args:
            sink: Async PostgreSQL sink with an open connection pool.
        """
        self.sink = sink

    async def fetch_daily_quotes(
        self,
        source_portal: str,
        observation_date: date,
    ) -> list[dict[str, Any]]:
        """Fetch usable quotes scraped on the observation date.

        Excludes imputed and sold-out quotes and non-positive fares.

        Args:
            source_portal: Portal identifier ('Ixigo', 'Google Flights').
            observation_date: Scrape date (matches `booking_date`).

        Returns:
            List of dicts with origin, destination, advance_windows,
            journey_date, total_fare.
        """
        rows = await self.sink.query(
            """
            SELECT origin, destination, advance_windows,
                   journey_date, total_fare::float8 AS total_fare
            FROM flight_quotes
            WHERE source_portal = $1
              AND booking_date = $2
              AND is_imputed = FALSE
              AND is_sold_out = FALSE
              AND total_fare > 0
            """,
            source_portal,
            observation_date,
        )
        return [dict(r) for r in rows]

    @staticmethod
    def aggregate_jevons(
        quotes: list[dict[str, Any]],
    ) -> dict[CellKey, dict[str, Any]]:
        """Group quotes into cells and compute Jevons geometric means.

        Args:
            quotes: Quote dicts from fetch_daily_quotes().

        Returns:
            Mapping of cell key to {'journey_date': date, 'jevons': float}.
        """
        grouped: dict[CellKey, list[float]] = defaultdict(list)
        journey_dates: dict[CellKey, date] = {}

        for q in quotes:
            key: CellKey = (
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

    async def compute_daily_aggregates(
        self,
        source_portal: str,
        observation_date: date,
    ) -> dict[CellKey, dict[str, Any]]:
        """Fetch quotes for a date and compute Jevons cell aggregates.

        Args:
            source_portal: Portal identifier.
            observation_date: Scrape date.

        Returns:
            Jevons aggregates keyed by cell.
        """
        quotes = await self.fetch_daily_quotes(source_portal, observation_date)
        aggregates = self.aggregate_jevons(quotes)
        logger.info(
            f"Jevons aggregates for {source_portal} on {observation_date}: "
            f"{len(aggregates)} cells from {len(quotes)} quotes"
        )
        return aggregates

    async def has_base_period(
        self,
        source_portal: str,
    ) -> bool:
        """Check whether any base period prices exist for the portal.

        Args:
            source_portal: Portal identifier.

        Returns:
            True if at least one base period row exists.
        """
        rows = await self.sink.query(
            """
            SELECT 1 FROM base_period_prices
            WHERE source_portal = $1
            LIMIT 1
            """,
            source_portal,
        )
        return len(rows) > 0

    async def calibrate(
        self,
        source_portal: str,
        observation_date: date,
    ) -> int:
        """Calibrate base period prices from the given scrape date.

        Uses that day's Jevons cell aggregates as base_period_fare. The
        first scrape day therefore becomes the index base (index = 100).

        Args:
            source_portal: Portal identifier.
            observation_date: The base period scrape date.

        Returns:
            Number of base period rows written.
        """
        aggregates = await self.compute_daily_aggregates(
            source_portal, observation_date
        )
        if not aggregates:
            logger.warning(
                f"No quotes found for {source_portal} on {observation_date}; "
                f"base period not calibrated"
            )
            return 0

        prices = [
            {
                "source_portal": source_portal,
                "base_period_date": observation_date,
                "journey_date": agg["journey_date"],
                "origin": key[0],
                "destination": key[1],
                "advance_windows": key[2],
                "base_period_fare": agg["jevons"],
            }
            for key, agg in aggregates.items()
        ]
        count = await self.sink.upsert_base_period_prices(prices)
        logger.info(
            f"Calibrated {count} base period prices for {source_portal} "
            f"from {observation_date}"
        )
        return count

    async def ensure_base_period(
        self,
        source_portal: str,
        observation_date: date,
    ) -> bool:
        """Ensure a base period exists, calibrating from today if missing.

        Args:
            source_portal: Portal identifier.
            observation_date: Fallback calibration date.

        Returns:
            True if a base period exists (pre-existing or newly created).
        """
        if await self.has_base_period(source_portal):
            return True
        logger.info(
            f"No base period for {source_portal}; calibrating from "
            f"{observation_date}"
        )
        await self.calibrate(source_portal, observation_date)
        return await self.has_base_period(source_portal)

    async def load_base_prices(
        self,
        source_portal: str,
    ) -> dict[CellKey, float]:
        """Load base period fares keyed by cell.

        Args:
            source_portal: Portal identifier.

        Returns:
            Mapping of cell key to base period fare.
        """
        rows = await self.sink.query(
            """
            SELECT origin, destination, advance_windows,
                   base_period_fare::float8 AS base_period_fare
            FROM base_period_prices
            WHERE source_portal = $1
            """,
            source_portal,
        )
        return {
            (r["origin"], r["destination"], r["advance_windows"]):
                r["base_period_fare"]
            for r in rows
        }

    async def load_weights(
        self,
        source_portal: str,
    ) -> tuple[dict[tuple[str, str], float], dict[int, float]]:
        """Load route weights and advance window weights for a portal.

        Args:
            source_portal: Portal identifier.

        Returns:
            Tuple of (route_weights keyed by (origin, destination),
            window_weights keyed by advance window).
        """
        route_rows = await self.sink.query(
            """
            SELECT origin, destination, weight::float8 AS weight
            FROM route_weights
            """
        )
        window_rows = await self.sink.query(
            """
            SELECT advance_window, weight::float8 AS weight
            FROM advance_window_weights
            WHERE source_portal = $1
            """,
            source_portal,
        )
        route_weights = {
            (r["origin"], r["destination"]): r["weight"]
            for r in route_rows
        }
        window_weights = {
            r["advance_window"]: r["weight"] for r in window_rows
        }
        return route_weights, window_weights
