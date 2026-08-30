"""Async PostgreSQL sink for Supabase via asyncpg.

Handles batch upserts to all 5 APIx tables with ON CONFLICT DO UPDATE
for idempotent inserts. Uses connection pooling for performance.
"""

import logging
from datetime import date, datetime
from typing import Any, Optional

import asyncpg

from config.settings import get_settings

logger = logging.getLogger(__name__)


class SupabaseSink:
    """Async PostgreSQL sink using asyncpg connection pool.

    Provides idempotent upsert methods for all APIx tables:
    - flight_quotes
    - route_weights
    - advance_window_weights
    - base_period_prices
    - airfare_price_index
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self) -> None:
        """Create the asyncpg connection pool."""
        if self.pool is not None:
            return

        try:
            self.pool = await asyncpg.create_pool(
                self.settings.SUPABASE_DB_URL,
                min_size=2,
                max_size=10,
                command_timeout=30,
                # Supabase pooler (PgBouncer transaction mode) does not
                # support server-side prepared statements
                statement_cache_size=0,
            )
            logger.info("Connected to Supabase PostgreSQL")
        except Exception as e:
            logger.error(f"Failed to connect to Supabase: {e}")
            raise

    async def close(self) -> None:
        """Close the connection pool."""
        if self.pool:
            await self.pool.close()
            self.pool = None
            logger.info("Closed Supabase connection pool")

    async def upsert_flight_quotes(self, records: list[dict[str, Any]]) -> int:
        """Batch upsert flight quotes with ON CONFLICT DO UPDATE.

        Generated columns (route, core_fare, booking_date) are computed
        by PostgreSQL and should NOT be included in records.

        Args:
            records: List of dicts with flight_quotes column values.
                     Must exclude: route, core_fare, booking_date.

        Returns:
            Number of records upserted.
        """
        if not records:
            return 0

        sql = """
            INSERT INTO flight_quotes (
                quote_id, source_portal, scraping_date_time, journey_date,
                origin, destination, advance_windows, carrier_code,
                carrier, flight_number, journey_class, fare, base_fare,
                fees, tax_udf, tax_asf, tax_gst, taxes, total_fare,
                departure, arrival, duration_min, stops, is_sold_out,
                is_imputed, data_hash
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23, $24, $25, $26
            )
            ON CONFLICT (
                journey_date, origin, destination, carrier_code, flight_number,
                journey_class, total_fare, source_portal, advance_windows, is_sold_out
            ) DO UPDATE SET
                scraping_date_time = EXCLUDED.scraping_date_time,
                fare = EXCLUDED.fare,
                base_fare = EXCLUDED.base_fare,
                total_fare = EXCLUDED.total_fare,
                taxes = EXCLUDED.taxes,
                departure = EXCLUDED.departure,
                arrival = EXCLUDED.arrival,
                duration_min = EXCLUDED.duration_min,
                stops = EXCLUDED.stops,
                is_sold_out = EXCLUDED.is_sold_out,
                data_hash = EXCLUDED.data_hash
        """

        column_order = [
            "quote_id", "source_portal", "scraping_date_time", "journey_date",
            "origin", "destination", "advance_windows", "carrier_code",
            "carrier", "flight_number", "journey_class", "fare", "base_fare",
            "fees", "tax_udf", "tax_asf", "tax_gst", "taxes", "total_fare",
            "departure", "arrival", "duration_min", "stops", "is_sold_out",
            "is_imputed", "data_hash",
        ]

        tuples = [
            tuple(record.get(col) for col in column_order)
            for record in records
        ]

        async with self.pool.acquire() as conn:
            await conn.executemany(sql, tuples)

        logger.info(f"Upserted {len(tuples)} flight quotes")
        return len(tuples)

    async def upsert_route_weights(self, weights: list[dict[str, Any]]) -> int:
        """Upsert route weights from config.

        Args:
            weights: List of dicts with keys: origin, destination, weight.

        Returns:
            Number of records upserted.
        """
        if not weights:
            return 0

        sql = """
            INSERT INTO route_weights (origin, destination, weight)
            VALUES ($1, $2, $3)
            ON CONFLICT (origin, destination) DO UPDATE SET
                weight = EXCLUDED.weight
        """

        tuples = [
            (w["origin"], w["destination"], w["weight"])
            for w in weights
        ]

        async with self.pool.acquire() as conn:
            await conn.executemany(sql, tuples)

        logger.info(f"Upserted {len(tuples)} route weights")
        return len(tuples)

    async def upsert_advance_window_weights(
        self, weights: list[dict[str, Any]]
    ) -> int:
        """Upsert advance window weights.

        Args:
            weights: List of dicts with keys: source_portal, advance_window, weight.

        Returns:
            Number of records upserted.
        """
        if not weights:
            return 0

        sql = """
            INSERT INTO advance_window_weights (source_portal, advance_window, weight)
            VALUES ($1, $2, $3)
            ON CONFLICT (source_portal, advance_window) DO UPDATE SET
                weight = EXCLUDED.weight
        """

        tuples = [
            (w["source_portal"], w["advance_window"], w["weight"])
            for w in weights
        ]

        async with self.pool.acquire() as conn:
            await conn.executemany(sql, tuples)

        logger.info(f"Upserted {len(tuples)} advance window weights")
        return len(tuples)

    async def upsert_base_period_prices(
        self, prices: list[dict[str, Any]]
    ) -> int:
        """Upsert base period prices.

        Args:
            prices: List of dicts with keys: source_portal, base_period_date,
                    journey_date, origin, destination, advance_windows,
                    base_period_fare.

        Returns:
            Number of records upserted.
        """
        if not prices:
            return 0

        sql = """
            INSERT INTO base_period_prices (
                source_portal, base_period_date, journey_date,
                origin, destination, advance_windows, base_period_fare
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (source_portal, journey_date, origin, destination, advance_windows)
            DO UPDATE SET
                base_period_fare = EXCLUDED.base_period_fare
        """

        tuples = [
            (
                p["source_portal"], p["base_period_date"], p["journey_date"],
                p["origin"], p["destination"], p["advance_windows"],
                p["base_period_fare"],
            )
            for p in prices
        ]

        async with self.pool.acquire() as conn:
            await conn.executemany(sql, tuples)

        logger.info(f"Upserted {len(tuples)} base period prices")
        return len(tuples)

    async def upsert_airfare_price_index(
        self, records: list[dict[str, Any]]
    ) -> int:
        """Upsert computed airfare price index records.

        Args:
            records: List of dicts with all airfare_price_index columns.

        Returns:
            Number of records upserted.
        """
        if not records:
            return 0

        sql = """
            INSERT INTO airfare_price_index (
                date, journey_date, origin, destination,
                advance_windows, source_portal, index_value,
                route_weight, advance_window_weight, fare,
                base_fare, base_period_fare
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (date, origin, destination, advance_windows, source_portal)
            DO UPDATE SET
                journey_date = EXCLUDED.journey_date,
                index_value = EXCLUDED.index_value,
                route_weight = EXCLUDED.route_weight,
                advance_window_weight = EXCLUDED.advance_window_weight,
                fare = EXCLUDED.fare,
                base_fare = EXCLUDED.base_fare,
                base_period_fare = EXCLUDED.base_period_fare
        """

        tuples = [
            (
                r["date"], r["journey_date"], r["origin"], r["destination"],
                r["advance_windows"], r["source_portal"], r["index_value"],
                r["route_weight"], r["advance_window_weight"], r["fare"],
                r["base_fare"], r["base_period_fare"],
            )
            for r in records
        ]

        async with self.pool.acquire() as conn:
            await conn.executemany(sql, tuples)

        logger.info(f"Upserted {len(tuples)} airfare price index records")
        return len(tuples)

    async def query(self, sql: str, *args: Any) -> list[asyncpg.Record]:
        """Execute a read query and return results.

        Args:
            sql: SQL query with $1, $2, etc. placeholders.
            *args: Query parameters.

        Returns:
            List of asyncpg.Record objects.
        """
        async with self.pool.acquire() as conn:
            return await conn.fetch(sql, *args)

    async def execute(self, sql: str, *args: Any) -> str:
        """Execute a write query (INSERT, UPDATE, DELETE).

        Args:
            sql: SQL statement with $1, $2, etc. placeholders.
            *args: Query parameters.

        Returns:
            Command status string (e.g., "INSERT 0 5").
        """
        async with self.pool.acquire() as conn:
            return await conn.execute(sql, *args)
