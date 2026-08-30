"""Tests for the FlareSolverr Cloudflare-challenge client."""

import json

import aiohttp
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.ingestion.flare_solverr import (
    DEFAULT_FLARESOLVERR_URL,
    FlareSolverrClient,
    FlareSolverrError,
)
from src.ingestion.session_store import SessionStore


def _ok_payload(cookies):
    return {
        "status": "ok",
        "message": "",
        "solution": {
            "url": "https://www.ixigo.com",
            "cookies": cookies,
            "userAgent": "test",
        },
    }


def _err_payload(message="could not solve challenge"):
    return {"status": "error", "message": message}


class TestFlareSolverrClientInit:
    def test_default_url(self):
        client = FlareSolverrClient()
        assert client.base_url == DEFAULT_FLARESOLVERR_URL

    def test_trailing_slash_stripped(self):
        client = FlareSolverrClient(base_url="http://localhost:8191/")
        assert client.base_url == "http://localhost:8191"


class TestFlareSolverrRequest:
    def _session_with_post(self, resp):
        post_cm = AsyncMock()
        post_cm.__aenter__.return_value = resp
        post_cm.__aexit__.return_value = False
        session = MagicMock()
        session.post.return_value = post_cm
        return session

    @pytest.mark.asyncio
    async def test_request_ok(self):
        client = FlareSolverrClient()
        payload = _ok_payload([{"name": "cf_clearance", "value": "abc"}])

        resp = MagicMock()
        resp.status = 200
        resp.text = AsyncMock(return_value=json.dumps(payload))
        session = self._session_with_post(resp)

        with patch.object(
            client, "_get_session", new=AsyncMock(return_value=session)
        ):
            data = await client._request({"cmd": "request.get", "url": "x"})

        assert data["status"] == "ok"
        assert data["solution"]["cookies"][0]["value"] == "abc"

    @pytest.mark.asyncio
    async def test_request_error_status(self):
        client = FlareSolverrClient()
        payload = _err_payload()

        resp = MagicMock()
        resp.status = 200
        resp.text = AsyncMock(return_value=json.dumps(payload))
        session = self._session_with_post(resp)

        with patch.object(
            client, "_get_session", new=AsyncMock(return_value=session)
        ):
            with pytest.raises(FlareSolverrError):
                await client._request({"cmd": "request.get"})

    @pytest.mark.asyncio
    async def test_request_http_error(self):
        client = FlareSolverrClient()

        resp = MagicMock()
        resp.status = 500
        resp.text = AsyncMock(return_value="boom")
        session = self._session_with_post(resp)

        with patch.object(
            client, "_get_session", new=AsyncMock(return_value=session)
        ):
            with pytest.raises(FlareSolverrError):
                await client._request({"cmd": "request.get"})

    @pytest.mark.asyncio
    async def test_request_connection_error(self):
        client = FlareSolverrClient()

        session = MagicMock()
        session.post.side_effect = aiohttp.ClientConnectionError("down")

        with patch.object(
            client, "_get_session", new=AsyncMock(return_value=session)
        ):
            with pytest.raises(FlareSolverrError):
                await client._request({"cmd": "request.get"})


class TestFlareSolverrGetCookies:
    @pytest.mark.asyncio
    async def test_get_cookies_success(self):
        client = FlareSolverrClient()
        cookies = [{"name": "cf_clearance", "value": "xyz"}]
        payload = _ok_payload(cookies)

        with patch.object(
            client, "_request", new=AsyncMock(return_value=payload)
        ):
            result = await client.get_cookies("https://www.ixigo.com")

        assert result == {"cf_clearance": "xyz"}

    @pytest.mark.asyncio
    async def test_get_cookies_empty_raises(self):
        client = FlareSolverrClient()
        payload = _ok_payload([])

        with patch.object(
            client, "_request", new=AsyncMock(return_value=payload)
        ):
            with pytest.raises(FlareSolverrError):
                await client.get_cookies("https://www.ixigo.com")


class TestFlareSolverrCache:
    @pytest.fixture
    def store(self, tmp_path):
        return SessionStore(storage_dir=tmp_path)

    @pytest.mark.asyncio
    async def test_solve_for_portal_caches(self, store):
        client = FlareSolverrClient(session_store=store)
        cookies = [{"name": "cf_clearance", "value": "abc"}]
        payload = _ok_payload(cookies)

        with patch.object(
            client, "_request", new=AsyncMock(return_value=payload)
        ):
            result = await client.solve_for_portal(
                "Ixigo", "https://www.ixigo.com"
            )

        assert result == {"cf_clearance": "abc"}
        # Cached in store for next call
        cached = await client.have_cached_cookies("Ixigo")
        assert cached == {"cf_clearance": "abc"}

    @pytest.mark.asyncio
    async def test_solve_for_portal_reuses_cache(self, store):
        store.put(
            "flaresolverr:Ixigo",
            headers={},
            cookies={"cf_clearance": "cached"},
        )
        client = FlareSolverrClient(session_store=store)
        mock_request = AsyncMock(return_value=_ok_payload([]))

        with patch.object(client, "_request", mock_request):
            result = await client.solve_for_portal(
                "Ixigo", "https://www.ixigo.com"
            )

        # Cache hit — FlareSolverr not consulted
        assert result == {"cf_clearance": "cached"}
        mock_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_solve_for_portal_force_refresh(self, store):
        store.put(
            "flaresolverr:Ixigo",
            headers={},
            cookies={"cf_clearance": "old"},
        )
        client = FlareSolverrClient(session_store=store)
        payload = _ok_payload([{"name": "cf_clearance", "value": "new"}])

        with patch.object(
            client, "_request", new=AsyncMock(return_value=payload)
        ):
            result = await client.solve_for_portal(
                "Ixigo",
                "https://www.ixigo.com",
                force_refresh=True,
            )

        assert result == {"cf_clearance": "new"}

    def test_no_cache_when_no_store(self):
        client = FlareSolverrClient()
        assert client.session_store is None


class TestFlareSolverrAvailability:
    @pytest.mark.asyncio
    async def test_is_available_when_ok(self):
        client = FlareSolverrClient()
        with patch.object(
            client, "_request", new=AsyncMock(return_value={"status": "ok"})
        ):
            assert await client.is_available() is True

    @pytest.mark.asyncio
    async def test_is_available_when_error(self):
        client = FlareSolverrClient()
        with patch.object(
            client,
            "_request",
            new=AsyncMock(side_effect=FlareSolverrError("down")),
        ):
            assert await client.is_available() is False


class TestAsyncFetcherFlareSolverrRequired:
    @pytest.fixture
    def fetcher(self):
        from src.ingestion.async_fetcher import AsyncFetcher

        return AsyncFetcher(
            persist_to_supabase=False,
            flaresolverr_required=True,
            flaresolverr_url="http://flaresolverr:8191",
        )

    @pytest.mark.asyncio
    async def test_aborts_when_required_and_unavailable(self, fetcher):
        from unittest.mock import MagicMock

        fetcher.query_builder.generate_search_matrix = MagicMock(return_value=[])
        fetcher.ixigo_interceptor.is_flaresolverr_available = AsyncMock(
            return_value=False
        )

        with pytest.raises(RuntimeError):
            await fetcher.run()

    @pytest.mark.asyncio
    async def test_proceeds_when_required_and_available(self, fetcher):
        from unittest.mock import MagicMock

        matrix = [{"route": "DEL-BOM", "origin": "DEL",
                   "destination": "BOM", "departure_date": "01092026",
                   "advance_window": 7}]
        fetcher.query_builder.generate_search_matrix = MagicMock(
            return_value=matrix
        )
        fetcher.ixigo_interceptor.is_flaresolverr_available = AsyncMock(
            return_value=True
        )
        fetcher.ixigo_interceptor.start_browser = AsyncMock()
        fetcher.ixigo_interceptor.stop_browser = AsyncMock()
        fetcher._fetch_ixigo_flaresolverr = AsyncMock(
            return_value={"query": {}, "source": "Ixigo",
                          "status": "success", "flights": [], "count": 0}
        )

        summary = await fetcher.run()

        assert summary["total_queries"] > 0
        fetcher._fetch_ixigo_flaresolverr.assert_called()

