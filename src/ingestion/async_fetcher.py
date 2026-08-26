"""Asynchronous ingestion worker supporting Ixigo and Google Flights.

Runs the full query matrix (30 searches per source) with rate limiting,
retry logic, and raw response storage. Ixigo uses aiohttp; Google Flights
uses Playwright DOM extraction.
"""

import asyncio
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import aiohttp

from src.ingestion.interceptors.ixigo import IxigoConfig, IxigoInterceptor
from src.ingestion.interceptors.google_flights import (
    GoogleFlightsConfig,
    GoogleFlightsInterceptor,
)
from src.ingestion.query_builder import QueryBuilder
from src.ingestion.raw_sink import RawSink
from src.ingestion.session_store import SessionStore

logger = logging.getLogger(__name__)


class AsyncFetcher:
    """Async worker that runs the full flight search matrix.

    Supports dual-source ingestion:
    - Ixigo: aiohttp API calls to SSE endpoint
    - Google Flights: Playwright DOM extraction

    Orchestrates: QueryBuilder → Interceptors → RawSink
    """

    def __init__(
        self,
        session_store: Optional[SessionStore] = None,
        raw_sink: Optional[RawSink] = None,
        query_builder: Optional[QueryBuilder] = None,
        rate_limit_per_sec: float = 1.0,
        sources: Optional[list[str]] = None,
    ) -> None:
        """Initialize async fetcher.

        Args:
            session_store: Token/session cache.
            raw_sink: Raw response storage.
            query_builder: Query matrix generator.
            rate_limit_per_sec: Max requests per second per source.
            sources: List of source names to use. Default: ["Ixigo", "Google Flights"].
        """
        self.session_store = session_store or SessionStore()
        self.raw_sink = raw_sink or RawSink()
        self.query_builder = query_builder or QueryBuilder()
        self.rate_limit_per_sec = rate_limit_per_sec
        self.sources = sources or ["Ixigo", "Google Flights"]

        # Configure interceptors
        ixigo_config = IxigoConfig(
            base_url=IxigoConfig.base_url,
            rate_limit_per_sec=rate_limit_per_sec,
        )
        self.ixigo_interceptor = IxigoInterceptor(ixigo_config)

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
        session: aiohttp.ClientSession,
    ) -> dict[str, Any]:
        """Fetch a single search query from Ixigo.

        Args:
            query: Query dict from QueryBuilder.
            session: Shared aiohttp session.

        Returns:
            Dict with query info and results (or error).
        """
        route = query["route"]
        advance_window = query["advance_window"]
        params = query["params"]

        await self._rate_limit_wait()

        try:
            headers = await self.ixigo_interceptor.build_search_headers()

            async with session.get(
                self.ixigo_interceptor.ixigo_config.base_url,
                headers=headers,
                params=params,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as response:
                if response.status == 200:
                    # Read full response body before parsing
                    raw_text = await response.text()

                    # Parse SSE from the raw text
                    flights = await self.ixigo_interceptor.parse_response(
                        response, route, advance_window
                    )

                    # Save raw response
                    self.raw_sink.save(
                        source="ixigo",
                        route=route,
                        advance_window=advance_window,
                        data={
                            "status": response.status,
                            "params": params,
                            "raw_sse": raw_text,
                            "flight_count": len(flights),
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

                elif response.status in (429, 500, 502, 503, 504):
                    logger.warning(
                        f"Ixigo HTTP {response.status} for {route} T+{advance_window}"
                    )
                    return {
                        "query": query,
                        "source": "Ixigo",
                        "status": "error",
                        "error": f"HTTP {response.status}",
                        "flights": [],
                        "count": 0,
                    }

                else:
                    body = await response.text()
                    logger.error(
                        f"Ixigo HTTP {response.status} for {route} T+{advance_window}: "
                        f"{body[:200]}"
                    )
                    return {
                        "query": query,
                        "source": "Ixigo",
                        "status": "error",
                        "error": f"HTTP {response.status}: {body[:200]}",
                        "flights": [],
                        "count": 0,
                    }

        except asyncio.TimeoutError:
            logger.error(f"Ixigo timeout for {route} T+{advance_window}")
            return {
                "query": query,
                "source": "Ixigo",
                "status": "error",
                "error": "Timeout",
                "flights": [],
                "count": 0,
            }
        except aiohttp.ClientError as e:
            logger.error(f"Ixigo network error for {route} T+{advance_window}: {e}")
            return {
                "query": query,
                "source": "Ixigo",
                "status": "error",
                "error": str(e),
                "flights": [],
                "count": 0,
            }

    async def _fetch_ixigo_playwright(
        self,
        query: dict[str, Any],
    ) -> dict[str, Any]:
        """Fetch a single search query from Ixigo via Playwright.

        Uses browser context to bypass Cloudflare protection.

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
                    "extraction_method": "playwright_sse",
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

        start_time = time.time()
        results: list[dict[str, Any]] = []

        # Run Ixigo queries (Playwright-based — Cloudflare blocks aiohttp)
        if "Ixigo" in self.sources:
            logger.info("Starting Ixigo ingestion (Playwright)...")
            try:
                await self.ixigo_interceptor.start_browser()
                for i, query in enumerate(matrix):
                    result = await self._fetch_ixigo_playwright(query)
                    results.append(result)

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

                    if (i + 1) % 10 == 0:
                        logger.info(
                            f"Google Flights progress: {i + 1}/{len(matrix)} queries"
                        )
            finally:
                await self.gf_interceptor.stop_browser()

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
    fetcher = AsyncFetcher(rate_limit_per_sec=rate_limit, sources=sources)
    try:
        return await fetcher.run(base_date)
    finally:
        await fetcher.close()
