"""Ixigo flight data interceptor using /flights/v2/search/stream SSE endpoint.

Parses the confirmed SSE structure where each flightFare[] entry contains:
  - flightKeys: "DEL-BOM-AI2977-01092026"
  - fares[0].fareDetails.displayFare: total fare (no tax breakdown)
  - fares[0].fareMetadata[0]: seatRemaining, cabinClass
  - flightDetails[0]: airlineCode, headerTextWeb, subHeaderTextWeb, times, stops
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta
from typing import Any, Optional

import aiohttp
from curl_cffi.requests import AsyncSession

from src.ingestion.interceptors.base import (
    BaseInterceptor,
    FlightData,
    InterceptorConfig,
)

logger = logging.getLogger(__name__)

# User-Agent used by the Playwright browser context that solves the
# Cloudflare challenge. curl_cffi must send the SAME User-Agent when
# replaying the resulting cf_clearance cookie, because Cloudflare binds
# the cookie to the User-Agent of the solving client.
CHROME_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


class IxigoConfig(InterceptorConfig):
    """Ixigo-specific configuration."""

    base_url: str = "https://www.ixigo.com/flights/v2/search/stream"
    outlook_url: str = "https://www.ixigo.com/outlook/v1/onward/ranged"

    # Hardcoded client credentials (from portal analysis)
    API_KEY: str = "ixiweb!2$"
    CLIENT_ID: str = "ixiweb"
    IXI_SRC: str = "ixiweb"
    APP_VERSION: str = "2"
    WEBAPP_VERSION: str = "2.78.1"

    homepage_url: str = "https://www.ixigo.com"


class IxigoInterceptor(BaseInterceptor):
    """Ixigo flight data interceptor.

    Uses the SSE streaming endpoint to fetch real-time flight search results.
    Cloudflare clearance cookies are obtained via the Playwright browser
    context (already launched for stealth), then replayed over curl_cffi
    using Chrome's TLS/HTTP2 fingerprint.

    No login required — uses a static API key and generated device ID.
    """

    def __init__(
        self,
        config: Optional[IxigoConfig] = None,
        session_store=None,
    ) -> None:
        self.ixigo_config = config or IxigoConfig()
        super().__init__(self.ixigo_config)
        self._search_id: Optional[str] = None
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self._cf_cookiesEstablished = False
        self._session_store = session_store
        self._cleared_cookies: Optional[dict[str, str]] = None

    async def build_search_headers(self) -> dict[str, str]:
        """Build Ixigo API headers."""
        return {
            "apikey": self.ixigo_config.API_KEY,
            "clientid": self.ixigo_config.CLIENT_ID,
            "uuid": self._device_id,
            "deviceid": self._device_id,
            "ixisrc": self.ixigo_config.IXI_SRC,
            "appversion": self.ixigo_config.APP_VERSION,
            "x-request-webappversion": self.ixigo_config.WEBAPP_VERSION,
            "content-type": "application/json; charset=UTF-8",
            "accept": "text/event-stream, application/json",
            "user-agent": self.config.user_agent,
            "referer": "https://www.ixigo.com/",
        }

    async def build_search_params(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        advance_window: int,
    ) -> dict[str, str]:
        """Build Ixigo search query parameters.

        Args:
            origin: IATA origin code (e.g., 'DEL').
            destination: IATA destination code (e.g., 'BOM').
            departure_date: Date in DDMMYYYY format.
            advance_window: Advance purchase window in days (used for date calc).

        Returns:
            Query parameters dictionary.
        """
        if advance_window > 0:
            dep_date = datetime.now() + timedelta(days=advance_window)
            leave = dep_date.strftime("%d%m%Y")
        else:
            leave = departure_date

        return {
            "origin": origin,
            "destination": destination,
            "leave": leave,
            "return": "",
            "adults": "1",
            "children": "0",
            "infants": "0",
            "class": "e",
            "airlineFareType": "REGULAR",
            "version": "2.0",
            "searchSrc": "Search Form",
        }

    async def parse_response(
        self,
        response: aiohttp.ClientResponse,
        route: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Parse Ixigo SSE streaming response into FlightData records.

        The endpoint returns a single SSE frame containing all flight data.
        Each flightFare[] entry in data.flightJourneys[] represents one flight option.

        Args:
            response: aiohttp response from the SSE endpoint.
            route: Route string (e.g., 'DEL-BOM').
            advance_window: Advance purchase window in days.

        Returns:
            List of FlightData records.
        """
        flights: list[FlightData] = []
        origin, destination = route.split("-")

        # Read the entire SSE response (single frame, ~264KB)
        buffer = ""
        async for chunk in response.content.iter_any():
            buffer += chunk.decode("utf-8", errors="replace")

        # Parse SSE data frames
        for line in buffer.split("\n"):
            line = line.strip()
            if not line.startswith("data:"):
                continue

            json_str = line[5:].strip()
            if not json_str:
                continue

            try:
                data = json.loads(json_str)
                parsed = self._parse_sse_payload(
                    data, route, origin, destination, advance_window
                )
                flights.extend(parsed)
            except json.JSONDecodeError as e:
                self.logger.debug(f"Failed to parse SSE data frame: {e}")

        self.logger.info(
            f"Parsed {len(flights)} flights from Ixigo for {route}"
        )
        return flights

    def _parse_sse_payload(
        self,
        data: dict[str, Any],
        route: str,
        origin: str,
        destination: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Extract FlightData records from a single SSE payload.

        Navigates: data.flightJourneys[].flightFare[]
        Each flightFare entry contains flightDetails[0], fares[0], flightKeys.

        Args:
            data: Parsed JSON from SSE data frame.
            route: Route string (e.g., 'DEL-BOM').
            origin: IATA origin code.
            destination: IATA destination code.
            advance_window: Advance purchase window in days.

        Returns:
            List of FlightData records found in this payload.
        """
        flights: list[FlightData] = []

        payload_data = data.get("data", data)
        flight_journeys = payload_data.get("flightJourneys", [])

        for journey in flight_journeys:
            flight_fares = journey.get("flightFare", [])

            for fare_entry in flight_fares:
                flight_data = self._parse_flight_fare_entry(
                    fare_entry, route, origin, destination, advance_window
                )
                if flight_data:
                    flights.append(flight_data)

        return flights

    def _parse_flight_fare_entry(
        self,
        fare_entry: dict[str, Any],
        route: str,
        origin: str,
        destination: str,
        advance_window: int,
    ) -> Optional[FlightData]:
        """Parse a single flightFare entry into a FlightData record.

        Expected structure:
        {
            "flightKeys": "DEL-BOM-AI2977-01092026",
            "refundableType": "PARTIALLY_REFUNDABLE",
            "fares": [{"fareDetails": {"displayFare": 7000}, "fareMetadata": [{"seatRemaining": 0, "cabinClass": "ECONOMY"}]}],
            "flightDetails": [{"airlineCode": "AI", "headerTextWeb": "Air India", "subHeaderTextWeb": "AI2977", "departureTime": "19:00", "arrivalTime": "21:25", "stop": 0, "duration": {"time": 145}}]
        }

        Args:
            fare_entry: Single flightFare dict from Ixigo SSE response.
            route: Route string.
            origin: IATA origin code.
            destination: IATA destination code.
            advance_window: Advance purchase window in days.

        Returns:
            FlightData record, or None if parsing fails.
        """
        try:
            # Extract flight details
            flight_details_list = fare_entry.get("flightDetails", [])
            if not flight_details_list:
                return None

            flight_details = flight_details_list[0]
            airline_code = flight_details.get("airlineCode", "")
            carrier = flight_details.get("headerTextWeb", "")
            raw_flight_number = flight_details.get("subHeaderTextWeb", "")
            departure_time = flight_details.get("departureTime", "")
            arrival_time = flight_details.get("arrivalTime", "")
            stops = flight_details.get("stop", 0)
            duration = flight_details.get("duration", {})
            duration_min = duration.get("time") if duration else None

            # Normalize flight number: "AI2977" → "AI-2977"
            flight_number = self._normalize_flight_number(raw_flight_number)

            # Extract fare info
            fares_list = fare_entry.get("fares", [])
            if not fares_list:
                return None

            fare_details = fares_list[0].get("fareDetails", {})
            fare_metadata_list = fares_list[0].get("fareMetadata", [])

            total_fare = float(fare_details.get("displayFare", 0))
            if total_fare <= 0:
                return None

            # Extract metadata
            cabin_class = "ECONOMY"
            is_sold_out = False
            if fare_metadata_list:
                meta = fare_metadata_list[0]
                cabin_class = meta.get("cabinClass", "ECONOMY")
                is_sold_out = meta.get("seatRemaining", 0) == 0

            # Extract journey date from flightKeys: "DEL-BOM-AI2977-01092026"
            journey_date = self._parse_flight_date(
                fare_entry.get("flightKeys", ""), advance_window
            )

            return FlightData(
                source_portal="Ixigo",
                origin=origin,
                destination=destination,
                journey_date=journey_date,
                advance_windows=advance_window,
                carrier_code=airline_code,
                carrier=carrier,
                flight_number=flight_number,
                journey_class=cabin_class,
                fare=total_fare,
                base_fare=total_fare,  # No tax breakdown available
                taxes=0.0,
                total_fare=total_fare,
                departure_time=departure_time,
                arrival_time=arrival_time,
                stops=stops,
                duration_min=duration_min,
                is_sold_out=is_sold_out,
                raw_data=fare_entry,
            )

        except (KeyError, IndexError, TypeError, ValueError) as e:
            self.logger.debug(f"Failed to parse flightFare entry: {e}")
            return None

    def _normalize_flight_number(self, raw: str) -> str:
        """Normalize flight number to XX-NNNN format.

        Examples:
            "AI2977" → "AI-2977"
            "6E2054" → "6E-2054"
            "AI 2977" → "AI-2977"

        Args:
            raw: Raw flight number string from source.

        Returns:
            Normalized flight number.
        """
        # Remove spaces
        cleaned = raw.replace(" ", "")
        # Match: 1-2 alpha/digits + 3-4 digits (handles 6E, AI, SG, etc.)
        m = re.match(r"^([A-Za-z0-9]{1,2})(\d{3,4})$", cleaned)
        if m:
            return f"{m.group(1).upper()}-{m.group(2)}"
        return cleaned.upper()

    def _parse_flight_date(
        self, flight_keys, advance_window: int
    ) -> str:
        """Parse flight date from flightKeys string or list.

        Example: "DEL-BOM-AI2977-01092026" → "2026-09-01"

        Args:
            flight_keys: Ixigo flightKeys string or list of strings.
            advance_window: Fallback advance window for date calculation.

        Returns:
            Flight date in YYYY-MM-DD format.
        """
        # Handle list: extract first element
        if isinstance(flight_keys, list):
            flight_keys = flight_keys[0] if flight_keys else ""

        if flight_keys:
            # Extract date part: last segment after splitting by '-'
            parts = flight_keys.split("-")
            if len(parts) >= 4:
                date_str = parts[-1]  # "01092026"
                try:
                    return datetime.strptime(date_str, "%d%m%Y").strftime(
                        "%Y-%m-%d"
                    )
                except ValueError:
                    pass

        # Fallback: calculate from advance window
        dep_date = datetime.now() + timedelta(days=advance_window)
        return dep_date.strftime("%Y-%m-%d")

    async def search_flights_by_date(
        self,
        origin: str,
        destination: str,
        departure_date: str,
    ) -> list[FlightData]:
        """Search flights using a specific date (no advance window calculation).

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Date in DDMMYYYY format.

        Returns:
            List of FlightData records.
        """
        route = f"{origin}-{destination}"
        headers = await self.build_search_headers()
        params = {
            "origin": origin,
            "destination": destination,
            "leave": departure_date,
            "return": "",
            "adults": "1",
            "children": "0",
            "infants": "0",
            "class": "e",
            "airlineFareType": "REGULAR",
            "version": "2.0",
            "searchSrc": "Search Form",
        }

        self.logger.info(f"Searching {route} on Ixigo (date: {departure_date})")

        response = await self._fetch_with_retry(
            self.ixigo_config.base_url, headers, params
        )
        if response is None:
            return []

        try:
            return await self.parse_response(response, route, 0)
        except Exception as e:
            self.logger.error(f"Parse error for {route}: {e}")
            return []

    # ─── curl_cffi-based fetch (primary mode) ──────────────────────────

    async def ensure_cf_cookies(
        self, force_refresh: bool = False
    ) -> dict[str, str]:
        """Obtain Cloudflare clearance cookies via the Playwright browser.

        Navigates to the Ixigo homepage and waits for Cloudflare to issue
        a ``cf_clearance`` cookie, then returns the full cookie jar from
        the browser context. Cookies are cached for the run lifetime.

        Args:
            force_refresh: If True, skip cached cookies and re-solve.

        Returns:
            Cookie dict (e.g. ``{"cf_clearance": "...", ...}``).
        """
        if self._cleared_cookies and not force_refresh:
            return self._cleared_cookies

        if not self._page:
            await self.start_browser()

        self.logger.info(
            "Solving Cloudflare challenge via Playwright (Ixigo homepage)..."
        )
        try:
            await self._page.goto(
                self.ixigo_config.homepage_url,
                wait_until="domcontentloaded",
                timeout=30000,
            )
            # Poll for the cf_clearance cookie (up to 30s).
            cf_acquired = False
            for _ in range(30):
                cookies = await self._context.cookies()
                if any(c["name"] == "cf_clearance" for c in cookies):
                    cf_acquired = True
                    break
                await asyncio.sleep(1)
            if not cf_acquired:
                self.logger.warning(
                    "Cloudflare cf_clearance cookie not observed after 30s; "
                    "continuing with whatever cookies the context holds"
                )
            self._cleared_cookies = {
                c["name"]: c["value"] for c in cookies
            }
        except Exception as e:
            self.logger.warning(f"Playwright CF cookie acquisition failed: {e}")
            self._cleared_cookies = {}

        self.logger.info(
            f"Obtained {len(self._cleared_cookies)} cookies via Playwright"
        )
        return self._cleared_cookies

    async def search_flights_cffi(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Search flights via curl_cffi using Playwright-solved cookies.

        The Cloudflare challenge is solved once by the Playwright browser
        (cached for the run) and the resulting cookies are replayed against
        the SSE endpoint using curl_cffi with Chrome's TLS/HTTP2 fingerprint.

        curl_cffi is used (rather than aiohttp) because Cloudflare binds
        the clearance cookie to the TLS fingerprint of the client that
        solved the challenge. aiohttp presents a fixed, non-browser TLS
        signature which Cloudflare rejects even with a valid cookie.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Date in DDMMYYYY format.
            advance_window: Advance purchase window in days.

        Returns:
            List of FlightData records (empty on failure).
        """
        route = f"{origin}-{destination}"

        if advance_window > 0:
            dep_date = datetime.now() + timedelta(days=advance_window)
            leave = dep_date.strftime("%d%m%Y")
        else:
            leave = departure_date

        headers = await self.build_search_headers()
        # Cloudflare binds the cf_clearance cookie to the User-Agent of the
        # solving client (the Playwright Chrome context). Replay with that
        # same User-Agent so the cookie stays valid.
        headers["user-agent"] = CHROME_USER_AGENT
        cookies = await self.ensure_cf_cookies()
        params = await self.build_search_params(
            origin, destination, departure_date, advance_window
        )
        params = dict(params)
        params["leave"] = leave

        self.logger.info(
            f"Searching {route} via curl_cffi (date: {leave})"
        )

        try:
            # chrome120 matches the Playwright context's Chrome/120 UA +
            # TLS fingerprint that solved the challenge.
            async with AsyncSession(impersonate="chrome120") as session:
                response = await session.get(
                    self.ixigo_config.base_url,
                    headers=headers,
                    params=params,
                    cookies=cookies,
                    timeout=self.config.request_timeout,
                )

                if response.status_code == 200:
                    text = await response.atext()
                    flights = self._parse_sse_text(
                        text, route, origin, destination, advance_window
                    )
                    self.logger.info(
                        f"curl_cffi search {route}: {len(flights)} flights"
                    )
                    return flights

                if response.status_code in (403, 503):
                    # Cookies may have expired mid-run — nudge refresh
                    # once and let the caller decide whether to retry.
                    self.logger.warning(
                        f"HTTP {response.status_code} from {route}; cookies "
                        f"likely stale (cf_clearance refresh needed)"
                    )
                    return []

                self.logger.error(
                    f"HTTP {response.status_code} from {route}: "
                    f"{(await response.atext())[:300]}"
                )
                return []
        except Exception as e:
            self.logger.error(f"Network error for {route}: {e}")
            return []

    # ─── Playwright-based fetch (fallback mode) ──────────────────────────

    async def close(self) -> None:
        """Close the interceptor and stop the Playwright browser."""
        await super().close()
        await self.stop_browser()

    async def start_browser(self) -> None:
        """Launch Playwright browser with stealth for Ixigo."""
        try:
            from playwright.async_api import async_playwright
            from playwright_stealth import Stealth
        except ImportError as e:
            self.logger.error(f"Missing Playwright dependencies: {e}")
            raise

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=True)

        stealth = Stealth()
        self._context = await self._browser.new_context(
            user_agent=CHROME_USER_AGENT,
            viewport={"width": 1920, "height": 1080},
            locale="en-IN",
        )
        await stealth.apply_stealth_async(self._context)
        self._page = await self._context.new_page()

        self.logger.info("Ixigo Playwright browser launched")

    async def stop_browser(self) -> None:
        """Close Playwright browser."""
        if self._page:
            await self._page.close()
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        self._page = None
        self._browser = None
        self._context = None
        self._playwright = None
        self._cf_cookiesEstablished = False
        self.logger.info("Ixigo Playwright browser closed")

    async def _ensure_cf_session(self) -> None:
        """Establish Cloudflare session by loading an Ixigo page.

        This sets the cf_clearance cookie needed for API calls.
        """
        if self._cf_cookiesEstablished:
            return

        if not self._page:
            await self.start_browser()

        # Load the Ixigo homepage to get Cloudflare clearance
        self.logger.info("Establishing Cloudflare session via Ixigo homepage...")
        try:
            await self._page.goto(
                "https://www.ixigo.com",
                wait_until="domcontentloaded",
                timeout=30000,
            )
            await asyncio.sleep(3)
            self._cf_cookiesEstablished = True
            self.logger.info("Cloudflare session established")
        except Exception as e:
            self.logger.warning(f"CF session setup failed: {e}")

    async def search_flights_playwright(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Search flights using Playwright browser context.

        Uses page.evaluate(fetch()) to make the SSE request from within
        the browser, which carries Cloudflare cookies automatically.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Date in DDMMYYYY format.
            advance_window: Advance purchase window in days.

        Returns:
            List of FlightData records.
        """
        route = f"{origin}-{destination}"

        # Calculate departure date
        if advance_window > 0:
            dep_date = datetime.now() + timedelta(days=advance_window)
            leave = dep_date.strftime("%d%m%Y")
        else:
            leave = departure_date

        await self._ensure_cf_session()

        # Build the SSE URL with query params
        params = {
            "origin": origin,
            "destination": destination,
            "leave": leave,
            "return": "",
            "adults": "1",
            "children": "0",
            "infants": "0",
            "class": "e",
            "airlineFareType": "REGULAR",
            "version": "2.0",
            "searchSrc": "Search Form",
        }
        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        sse_url = f"{self.ixigo_config.base_url}?{query_string}"

        self.logger.info(f"Searching {route} via Playwright (date: {leave})")

        try:
            # Use page.evaluate to make fetch from browser context
            raw_sse = await self._page.evaluate(f"""
                async () => {{
                    const resp = await fetch("{sse_url}", {{
                        headers: {{
                            "apikey": "{self.ixigo_config.API_KEY}",
                            "clientid": "{self.ixigo_config.CLIENT_ID}",
                            "ixisrc": "{self.ixigo_config.IXI_SRC}",
                            "appversion": "{self.ixigo_config.APP_VERSION}",
                            "accept": "text/event-stream, application/json",
                        }},
                    }});
                    if (!resp.ok) throw new Error("HTTP " + resp.status);
                    return await resp.text();
                }}
            """)

            # Parse SSE from raw text directly
            flights = self._parse_sse_text(raw_sse, route, origin, destination, advance_window)

            self.logger.info(
                f"Playwright search {route}: {len(flights)} flights"
            )
            return flights

        except Exception as e:
            self.logger.error(f"Playwright search failed for {route}: {e}")
            return []

    def _parse_sse_text(
        self,
        raw_text: str,
        route: str,
        origin: str,
        destination: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Parse SSE raw text into FlightData records.

        Same logic as parse_response but works with a raw string
        instead of an aiohttp response.

        Args:
            raw_text: Raw SSE response text.
            route: Route string.
            origin: IATA origin code.
            destination: IATA destination code.
            advance_window: Advance purchase window in days.

        Returns:
            List of FlightData records.
        """
        flights: list[FlightData] = []

        for line in raw_text.split("\n"):
            line = line.strip()
            if not line.startswith("data:"):
                continue

            json_str = line[5:].strip()
            if not json_str:
                continue

            try:
                data = json.loads(json_str)
                parsed = self._parse_sse_payload(
                    data, route, origin, destination, advance_window
                )
                flights.extend(parsed)
            except json.JSONDecodeError as e:
                self.logger.debug(f"Failed to parse SSE data frame: {e}")

        return flights
