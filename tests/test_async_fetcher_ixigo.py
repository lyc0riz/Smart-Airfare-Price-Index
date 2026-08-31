"""Tests for the AsyncFetcher Ixigo fetch orchestration."""

import pytest
from unittest.mock import AsyncMock

from src.ingestion.async_fetcher import AsyncFetcher


class TestAsyncFetcherIxigo:
    @pytest.fixture
    def fetcher(self):
        f = AsyncFetcher(sources=["Ixigo"], persist_to_supabase=False)
        # Stub out the interceptor with controllable mocks.
        f.ixigo_interceptor.search_flights_cffi = AsyncMock()
        f.ixigo_interceptor.search_flights_playwright = AsyncMock()
        return f

    def _query(self):
        return {
            "route": "DEL-BOM",
            "origin": "DEL",
            "destination": "BOM",
            "departure_date": "01092026",
            "advance_window": 7,
        }

    @pytest.mark.asyncio
    async def test_skips_cffi_when_no_clearance(self, fetcher):
        fetcher.ixigo_interceptor._cleared_cookies = {}
        fetcher.ixigo_interceptor.search_flights_playwright.return_value = []
        query = self._query()

        with pytest.MonkeyPatch.context() as mp:
            import asyncio
            mp.setattr(asyncio, "sleep", AsyncMock())
            result = await fetcher._fetch_ixigo_one(query)

        assert result["status"] == "success"
        assert result["count"] == 0
        fetcher.ixigo_interceptor.search_flights_cffi.assert_not_awaited()
        fetcher.ixigo_interceptor.search_flights_playwright.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_uses_cffi_when_clearance_present(self, fetcher):
        fetcher.ixigo_interceptor._cleared_cookies = {"cf_clearance": "abc"}
        fetcher.ixigo_interceptor.search_flights_cffi.return_value = [object()]
        query = self._query()

        import asyncio
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(asyncio, "sleep", AsyncMock())
            result = await fetcher._fetch_ixigo_one(query)

        assert result["status"] == "success"
        assert result["count"] == 1
        fetcher.ixigo_interceptor.search_flights_cffi.assert_awaited_once()
        # No fallback since cffi returned flights.
        fetcher.ixigo_interceptor.search_flights_playwright.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_fallback_with_delay_when_cffi_empty(self, fetcher):
        fetcher.ixigo_interceptor._cleared_cookies = {"cf_clearance": "abc"}
        fetcher.ixigo_interceptor.search_flights_cffi.return_value = []
        fetcher.ixigo_interceptor.search_flights_playwright.return_value = []
        query = self._query()

        import asyncio
        sleep_mock = AsyncMock()
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(asyncio, "sleep", sleep_mock)
            result = await fetcher._fetch_ixigo_one(query)

        assert result["status"] == "success"
        fetcher.ixigo_interceptor.search_flights_cffi.assert_awaited_once()
        fetcher.ixigo_interceptor.search_flights_playwright.assert_awaited_once()
        # Delay only applied when there was clearance (avoiding 429).
        sleep_mock.assert_awaited_once_with(2)

    def test_ixigo_rate_slowed_when_global_fast(self):
        f = AsyncFetcher(sources=["Ixigo"], persist_to_supabase=False)
        assert f.ixigo_interceptor.config.rate_limit_per_sec == 0.2
