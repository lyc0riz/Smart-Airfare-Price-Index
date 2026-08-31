"""Asynchronous ingestion worker supporting Ixigo and Google Flights.

Runs the full query matrix (30 searches per source) with rate limiting,
retry logic, and raw response storage. Ixigo uses curl_cffi (with
Playwright-solved Cloudflare cookies); Google Flights uses Playwright DOM
extraction.
"""

import asyncio
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from src.ingestion.interceptors.ixigo import IxigoConfig, IxigoInterceptor
from src.ingestion.interceptors.google_flights import (
    GoogleFlightsConfig,
    GoogleFlightsInterceptor,
)
from src.ingestion.query_builder import QueryBuilder
from src.ingestion.raw_sink import RawSink
from src.ingestion.session_store import SessionStore
from src.storage.supabase_sink import SupabaseSink

logger = logging.getLogger(__name__)


class AsyncFetcher:
    """Async worker that runs the full flight search matrix.

    Supports dual-source ingestion:
    - Ixigo: curl_cffi calls to SSE endpoint (Playwright-solved cookies)
    - Google Flights: Playwright DOM extraction

    Orchestrates: QueryBuilder → Interceptors → RawSink + SupabaseSink
    """

    def __init__(
        self,
        session_store: Optional[SessionStore] = None,
        raw_sink: Optional[RawSink] = None,
        query_builder: Optional[QueryBuilder] = None,
        supabase_sink: Optional[SupabaseSink] = None,
        rate_limit_per_sec: float = 1.0,
        sources: Optional[list[str]] = None,
        persist_to_supabase: bool = True,
    ) -> None:
        """Initialize async fetcher.

        Args:
            session_store: Token/session cache.
            raw_sink: Raw response storage.
            query_builder: Query matrix generator.
            supabase_sink: PostgreSQL sink for flight quotes.
            rate_limit_per_sec: Max requests per second per source.
            sources: List of source names to use. Default: ["Ixigo", "Google Flights"].
            persist_to_supabase: Whether to upsert flight quotes to Supabase.
        """
        self.session_store = session_store or SessionStore()
        self.raw_sink = raw_sink or RawSink()
        self.query_builder = query_builder or QueryBuilder()
        self.supabase_sink = supabase_sink or SupabaseSink()
        self.persist_to_supabase = persist_to_supabase
        self.rate_limit_per_sec = rate_limit_per_sec
        self.sources = sources or ["Ixigo", "Google Flights"]

        # Configure interceptors
        ixigo_config = IxigoConfig(
            base_url=IxigoConfig.base_url,
            rate_limit_per_sec=rate_limit_per_sec,
        )
        self.ixigo_interceptor = IxigoInterceptor(
            ixigo_config, session_store=self.session_store
        )

        gf_config = GoogleFlightsConfig(
            rate_limit_per_sec=rate_limit_per_sec,
        )
        self.gf_interceptor = GoogleFlightsInterceptor(gf_config)

        self._last_request_time: float = 0.0
        logger.info(
            f"AsyncFetcher initialized: rate={rate_limit_per_sec} req/sec, "
            f"sources={self.sources}"
        )

    async def _rate_limit_wait(self) -> None:
        """Enforce rate limiting between requests."""
        now = time.time()
        min_interval = 1.0 / self.rate_limit_per_sec
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            wait_time = min_interval - elapsed
            await asyncio.sleep(wait_time)
        self._last_request_time = time.time()

    async def _fetch_ixigo_one(
        self,
        query: dict[str, Any],
    ) -> dict[str, Any]:
        """Fetch a single search query from Ixigo.

        Solves the Cloudflare challenge once via Playwright (cached for
        the run), then replays the cookies against the SSE endpoint via
        curl_cffi. Falls back to the Playwright browser context if the
        cookie replay returns no results.

        Args:
            query: Query dict from QueryBuilder.

        Returns:
            Dict with query info and results (or error).
        """
        route = query["route"]
        origin = query["origin"]
        destination = query["destination"]
        departure_date = query["departure_date"]
        advance_window = query["advance_window"]

        await self._rate_limit_wait()

        try:
            # Only attempt the curl_cffi path if Cloudflare issued a
            # cf_clearance cookie. If not, skip straight to the Playwright
            # browser (which is already passing the challenge) — this avoids
            # pointless 403s and halves the number of requests per query.
            flights = []
            if self.ixigo_interceptor.has_cf_clearance:
                flights = await self.ixigo_interceptor.search_flights_cffi(
                    origin, destination, departure_date, advance_window
                )

            # If the cookie replay returned nothing (e.g. stale cookies),
            # fall back to the Playwright browser.
            if not flights:
                # Space the two Ixigo requests apart to avoid tripping
                # Ixigo's per-IP rate limiter (observed HTTP 429 when the
                # curl_cffi and Playwright requests fire back-to-back).
                if self.ixigo_interceptor.has_cf_clearance:
                    await asyncio.sleep(2)
                flights = await self.ixigo_interceptor.search_flights_playwright(
                    origin, destination, departure_date, advance_window
                )

            # Save extracted data
            self.raw_sink.save(
                source="ixigo",
                route=route,
                advance_window=advance_window,
                data={
                    "flight_count": len(flights),
                    "extraction_method": "curl_cffi_sse",
                },
            )

            logger.info(
                f"Ixigo OK {route} T+{advance_window}: "
                f"{len(flights)} flights"
            )
            return {
                "query": query,
                "source": "Ixigo",
                "status": "success",
                "flights": flights,
                "count": len(flights),
            }

        except Exception as e:
            logger.error(
                f"Ixigo error for {route} T+{advance_window}: {e}"
            )
            return {
                "query": query,
                "source": "Ixigo",
                "status": "error",
                "error": str(e),
                "flights": [],
                "count": 0,
            }

    async def _fetch_google_flights_one(
        self,
        query: dict[str, Any],
    ) -> dict[str, Any]:
        """Fetch a single search query from Google Flights.

        Args:
            query: Query dict from QueryBuilder.

        Returns:
            Dict with query info and results (or error).
        """
        route = query["route"]
        origin = query["origin"]
        destination = query["destination"]
        departure_date = query["departure_date"]
        advance_window = query["advance_window"]

        await self._rate_limit_wait()

        try:
            flights = await self.gf_interceptor.search_flights_dom(
                origin, destination, departure_date, advance_window
            )

            # Save extracted data
            self.raw_sink.save(
                source="google_flights",
                route=route,
                advance_window=advance_window,
                data={
                    "flight_count": len(flights),
                    "extraction_method": "dom_aria_label",
                },
            )

            logger.info(
                f"Google Flights OK {route} T+{advance_window}: "
                f"{len(flights)} flights"
            )
            return {
                "query": query,
                "source": "Google Flights",
                "status": "success",
                "flights": flights,
                "count": len(flights),
            }

        except Exception as e:
            logger.error(
                f"Google Flights error for {route} T+{advance_window}: {e}"
            )
            return {
                "query": query,
                "source": "Google Flights",
                "status": "error",
                "error": str(e),
                "flights": [],
                "count": 0,
            }

    async def _flush_quotes(self, quote_batch: list[dict[str, Any]]) -> int:
        """Batch-upsert accumulated quote dicts to Supabase.

        Args:
            quote_batch: Quote dicts from FlightData.to_quote_dict().

        Returns:
            Number of records upserted (0 if persistence disabled/failed).
        """
        if not self.persist_to_supabase or not quote_batch:
            return 0

        chunk_size = 500
        upserted = 0
        try:
            for start in range(0, len(quote_batch), chunk_size):
                chunk = quote_batch[start:start + chunk_size]
                upserted += await self.supabase_sink.upsert_flight_quotes(
                    chunk
                )
            logger.info(f"Batch upserted {upserted} flight quotes")
        except Exception as e:
            logger.error(f"Supabase batch upsert failed: {e}")
        return upserted

    async def run(
        self,
        base_date: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Run the full flight search matrix for all configured sources.

        Args:
            base_date: Reference date for query generation (default: today).

        Returns:
            Summary dict with success/error counts and all flight data.
        """
        matrix = self.query_builder.generate_search_matrix(base_date)
        logger.info(
            f"Running {len(matrix)} queries × {len(self.sources)} sources"
        )

        if self.persist_to_supabase:
            await self.supabase_sink.connect()

        start_time = time.time()
        results: list[dict[str, Any]] = []
        quote_batch: list[dict[str, Any]] = []

        # Run Ixigo queries (Playwright + curl_cffi)
        if "Ixigo" in self.sources:
            logger.info("Starting Ixigo ingestion (Playwright+curl_cffi)...")
            try:
                await self.ixigo_interceptor.start_browser()
                # Solve the Cloudflare challenge once up front, then decide
                # which path to use for each query.
                await self.ixigo_interceptor.ensure_cf_cookies()
                if self.ixigo_interceptor.has_cf_clearance:
                    logger.info(
                        "cf_clearance obtained: using curl_cffi path"
                    )
                else:
                    logger.warning(
                        "No cf_clearance cookie: using Playwright path only"
                    )
                for i, query in enumerate(matrix):
                    result = await self._fetch_ixigo_one(query)
                    results.append(result)
                    quote_batch.extend(
                        f.to_quote_dict() for f in result["flights"]
                    )

                    if (i + 1) % 10 == 0:
                        logger.info(
                            f"Ixigo progress: {i + 1}/{len(matrix)} queries"
                        )
            finally:
                await self.ixigo_interceptor.stop_browser()

        # Run Google Flights queries (Playwright-based)
        if "Google Flights" in self.sources:
            logger.info("Starting Google Flights ingestion...")
            try:
                await self.gf_interceptor.start_browser()
                for i, query in enumerate(matrix):
                    result = await self._fetch_google_flights_one(query)
                    results.append(result)
                    quote_batch.extend(
                        f.to_quote_dict() for f in result["flights"]
                    )

                    if (i + 1) % 10 == 0:
                        logger.info(
                            f"Google Flights progress: {i + 1}/{len(matrix)} queries"
                        )
            finally:
                await self.gf_interceptor.stop_browser()

        quotes_upserted = await self._flush_quotes(quote_batch)

        if self.persist_to_supabase:
            await self.supabase_sink.close()

        elapsed = time.time() - start_time

        # Compute summary
        successes = [r for r in results if r["status"] == "success"]
        errors = [r for r in results if r["status"] == "error"]
        total_flights = sum(r["count"] for r in results)

        # Per-source summary
        source_summary = {}
        for source in self.sources:
            source_results = [r for r in results if r.get("source") == source]
            source_ok = [r for r in source_results if r["status"] == "success"]
            source_err = [r for r in source_results if r["status"] == "error"]
            source_flights = sum(r["count"] for r in source_results)
            source_summary[source] = {
                "total": len(source_results),
                "successes": len(source_ok),
                "errors": len(source_err),
                "flights": source_flights,
            }

        summary = {
            "total_queries": len(matrix) * len(self.sources),
            "successes": len(successes),
            "errors": len(errors),
            "total_flights": total_flights,
            "quotes_upserted": quotes_upserted,
            "elapsed_seconds": round(elapsed, 2),
            "queries_per_second": round(
                (len(matrix) * len(self.sources)) / elapsed, 2
            )
            if elapsed > 0
            else 0,
            "sources": source_summary,
            "results": results,
        }

        logger.info(
            f"Run complete: {len(successes)}/{len(results)} OK, "
            f"{len(errors)} errors, {total_flights} flights, "
            f"{elapsed:.1f}s"
        )

        return summary

    async def close(self) -> None:
        """Clean up resources."""
        await self.ixigo_interceptor.close()
        await self.gf_interceptor.stop_browser()
        if self.supabase_sink.pool:
            await self.supabase_sink.close()


async def run_fetch(
    rate_limit: float = 1.0,
    base_date: Optional[datetime] = None,
    sources: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Convenience function to run a full fetch cycle.

    Args:
        rate_limit: Requests per second per source.
        base_date: Reference date for queries.
        sources: List of sources to use (default: ["Ixigo", "Google Flights"]).

    Returns:
        Fetch summary with flight data.
    """
    fetcher = AsyncFetcher(
        rate_limit_per_sec=rate_limit,
        sources=sources,
    )
    try:
        return await fetcher.run(base_date)
    finally:
        await fetcher.close()
