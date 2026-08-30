"""FlareSolverr client for solving Cloudflare JS challenges.

FlareSolverr is a self-hosted proxy server (Docker image
``ghcr.io/flaresolverr/flaresolverr``) that launches a real Chrome
browser, solves the Cloudflare challenge for a target host, and returns
the resulting cookies (notably ``cf_clearance``). Those cookies can then
be replayed against the host's API endpoints, avoiding headless
detection on cloud IPs (e.g. GitHub Actions runners).

This module provides:

* ``FlareSolverrClient`` — an async HTTP client that talks to the
  FlareSolverr JSON API to obtain clearance cookies for a host.
* ``CloudflareSessionStore`` — an in-memory cache (backed by
  ``SessionStore``) that lets callers reuse a solved cookie set across
  many requests within a single run until it expires.

References:
    https://github.com/FlareSolverr/FlareSolverr
"""

import json
import logging
import time
from typing import Any, Optional

import aiohttp

from src.ingestion.session_store import SessionStore

logger = logging.getLogger(__name__)

DEFAULT_FLARESOLVERR_URL = "http://localhost:8191"


class FlareSolverrError(Exception):
    """Raised when FlareSolverr cannot solve a Cloudflare challenge."""


class FlareSolverrClient:
    """Async client for the FlareSolverr JSON API.

    Args:
        base_url: Base URL of the FlareSolverr service (e.g.
            ``http://localhost:8191``).
        timeout: Seconds to allow FlareSolverr's browser to solve a
            challenge before aborting.
        session_store: Optional shared ``SessionStore`` to persist
            solved cookies across runs. When provided, cookies are
            cached under the ``flaresolverr:<portal>`` key with the
            store's default TTL.
    """

    def __init__(
        self,
        base_url: str = DEFAULT_FLARESOLVERR_URL,
        timeout: int = 60,
        session_store: Optional[SessionStore] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session_store = session_store
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create the aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            )
        return self._session

    async def close(self) -> None:
        """Close the underlying aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._session = None

    async def _request(
        self, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Send a command to the FlareSolverr JSON API.

        Args:
            payload: The command payload (e.g. ``{"cmd": "request.get",
                "url": ...}``).

        Returns:
            Parsed JSON response from FlareSolverr.

        Raises:
            FlareSolverrError: If the request fails or FlareSolverr
                reports an error status.
        """
        session = await self._get_session()
        url = f"{self.base_url}/v1"
        try:
            async with session.post(url, json=payload) as resp:
                body = await resp.text()
                if resp.status != 200:
                    raise FlareSolverrError(
                        f"FlareSolverr HTTP {resp.status}: {body[:500]}"
                    )
                data = json.loads(body)
        except aiohttp.ClientError as e:
            raise FlareSolverrError(
                f"FlareSolverr unreachable at {self.base_url}: {e}"
            ) from e
        except json.JSONDecodeError as e:
            raise FlareSolverrError(
                f"FlareSolverr returned invalid JSON: {e}"
            ) from e

        if data.get("status") != "ok":
            message = data.get("message", "unknown FlareSolverr error")
            raise FlareSolverrError(
                f"FlareSolverr error: {message}"
            )
        return data

    async def get_cookies(
        self,
        url: str,
        user_agent: Optional[str] = None,
    ) -> dict[str, str]:
        """Solve the Cloudflare challenge for a URL and return cookies.

        Args:
            url: The URL to load (typically a host's homepage).
            user_agent: User-Agent to use inside the FlareSolverr
                browser.

        Returns:
            A dict mapping cookie name to value (e.g. ``{"cf_clearance":
            "..."}``).

        Raises:
            FlareSolverrError: If the challenge cannot be solved.
        """
        payload: dict[str, Any] = {
            "cmd": "request.get",
            "url": url,
            "maxTimeout": self.timeout * 1000,
        }
        if user_agent:
            payload["userAgent"] = user_agent

        data = await self._request(payload)
        solution = data.get("solution", {})
        cookies = solution.get("cookies", [])
        if not cookies:
            raise FlareSolverrError(
                f"FlareSolverr returned no cookies for {url}"
            )
        return {c.get("name", ""): c.get("value", "") for c in cookies}

    async def have_cached_cookies(
        self, portal: str
    ) -> Optional[dict[str, str]]:
        """Return cached cookies for a portal, if any and not expired.

        Args:
            portal: Portal name (e.g. ``Ixigo``).

        Returns:
            Cookie dict if a valid cached session exists, else None.
        """
        if self.session_store is None:
            return None
        entry = self.session_store.get(f"flaresolverr:{portal}")
        if entry is None:
            return None
        return dict(entry.cookies or {})

    async def cache_cookies(
        self, portal: str, cookies: dict[str, str]
    ) -> None:
        """Persist solved cookies for a portal in the session store.

        Args:
            portal: Portal name (e.g. ``Ixigo``).
            cookies: Cookie dict to cache.
        """
        if self.session_store is None:
            return
        self.session_store.put(
            f"flaresolverr:{portal}", headers={}, cookies=cookies
        )
        logger.info(
            f"Cached {len(cookies)} FlareSolverr cookies for {portal}"
        )

    async def invalidate_cached(self, portal: str) -> None:
        """Drop cached cookies for a portal.

        Args:
            portal: Portal name (e.g. ``Ixigo``).
        """
        if self.session_store is not None:
            self.session_store.invalidate(f"flaresolverr:{portal}")

    async def solve_for_portal(
        self,
        portal: str,
        url: str,
        user_agent: Optional[str] = None,
        force_refresh: bool = False,
    ) -> dict[str, str]:
        """Get valid cookies for a portal, using cache when possible.

        Tries the session store cache first. If missing, expired, or
        ``force_refresh`` is set, asks FlareSolverr to solve the
        challenge and caches the result.

        Args:
            portal: Portal name (e.g. ``Ixigo``).
            url: URL whose host's challenge should be solved.
            user_agent: User-Agent for the FlareSolverr browser.
            force_refresh: If True, skip the cache and re-solve.

        Returns:
            Cookie dict mapping cookie name to value.

        Raises:
            FlareSolverrError: If no cached cookies exist and
                FlareSolverr fails to solve the challenge.
        """
        if not force_refresh:
            cached = await self.have_cached_cookies(portal)
            if cached:
                logger.debug(f"Using cached FlareSolverr cookies for {portal}")
                return cached

        cookies = await self.get_cookies(url, user_agent=user_agent)
        await self.cache_cookies(portal, cookies)
        return cookies

    async def is_available(self) -> bool:
        """Probe whether the FlareSolverr service is reachable.

        Returns:
            True if FlareSolverr responded, False otherwise.
        """
        try:
            await self._request({"cmd": "sessions.list"})
            return True
        except FlareSolverrError:
            return False
