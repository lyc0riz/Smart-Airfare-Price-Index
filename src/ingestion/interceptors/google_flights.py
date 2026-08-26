"""Google Flights DOM-based flight data interceptor.

Uses Playwright to render the Google Flights search results page and
extracts flight data from div.JMc5Xc aria-labels. This is a Tier 2
fallback source — Ixigo is primary.

Extraction method:
  1. Playwright loads Google Flights with stealth settings
  2. Wait for page to fully render (JS hydration)
  3. Query all div.JMc5Xc elements with aria-label containing "rupees"
  4. Regex-parse the aria-label text to extract structured flight data

Aria-label pattern:
  "From {price} Indian rupees round trip total. {stops_text} flight with
   {airline}. Leaves {dep_airport} at {dep_time} on {dep_date} and arrives
   at {arr_airport} at {arr_time} on {arr_date}."
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from src.ingestion.interceptors.base import (
    BaseInterceptor,
    FlightData,
    InterceptorConfig,
)

logger = logging.getLogger(__name__)

# Regex pattern for Google Flights aria-label parsing
# Matches: "From 12462 Indian rupees round trip total. Nonstop flight with IndiGo. Leaves ... at 1:00 PM ... arrives ... at 3:10 PM ..."
ARIA_LABEL_PATTERN = re.compile(
    r"From ([\d,]+) Indian rupees round trip total\. "
    r"(.+?) flight with (.+?)\. "
    r"Leaves (.+?) at (\d{1,2}:\d{2}\s*[AP]M) on (.+?) "
    r"and arrives (.+?) at (\d{1,2}:\d{2}\s*[AP]M) on (.+?)\.?$"
)

# Map airline names to IATA codes
AIRLINE_CODE_MAP = {
    "IndiGo": "6E",
    "Air India": "AI",
    "SpiceJet": "SG",
    "Akasa Air": "QP",
    "Air India Express": "IX",
    "Vistara": "UK",
    "Go First": "G8",
}


class GoogleFlightsConfig(InterceptorConfig):
    """Google Flights-specific configuration."""

    base_url: str = "https://www.google.com/travel/flights"
    search_url_template: str = (
        "https://www.google.com/travel/flights"
        "?q=Flights+to+{dest}+from+{origin}+on+{date}&curr=INR"
    )
    wait_for_render: int = 15  # Seconds to wait for JS rendering


class GoogleFlightsInterceptor(BaseInterceptor):
    """Google Flights DOM-based interceptor.

    Uses Playwright to render the page and extract flight data from
    aria-label attributes. This is a Tier 2 fallback source.

    Note: This interceptor does NOT use aiohttp for fetching.
    Instead, it uses Playwright for full browser rendering.
    """

    def __init__(self, config: Optional[GoogleFlightsConfig] = None) -> None:
        self.gf_config = config or GoogleFlightsConfig()
        super().__init__(self.gf_config)
        self._playwright = None
        self._browser = None
        self._context = None

    async def start_browser(self) -> None:
        """Launch Playwright browser with stealth settings."""
        try:
            from playwright.async_api import async_playwright
            from playwright_stealth import Stealth
        except ImportError as e:
            self.logger.error(f"Missing dependencies for Playwright: {e}")
            raise

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=True)

        stealth = Stealth()
        self._context = await self._browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="en-IN",
        )
        await stealth.apply_stealth_async(self._context)

        self.logger.info("Google Flights browser launched with stealth settings")

    async def stop_browser(self) -> None:
        """Close Playwright browser."""
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        self._browser = None
        self._context = None
        self._playwright = None
        self.logger.info("Google Flights browser closed")

    async def build_search_headers(self) -> dict[str, str]:
        """Not used for DOM scraping — browser handles headers."""
        return {}

    async def build_search_params(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        advance_window: int,
    ) -> dict[str, str]:
        """Build Google Flights search URL parameters.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Date in DDMMYYYY or YYYY-MM-DD format.
            advance_window: Advance purchase window in days.

        Returns:
            Dict with 'url' key containing the full search URL.
        """
        if advance_window > 0:
            dep_date = datetime.now() + timedelta(days=advance_window)
            date_str = dep_date.strftime("%Y-%m-%d")
        else:
            # Parse DDMMYYYY or YYYY-MM-DD to YYYY-MM-DD
            try:
                dep_date = datetime.strptime(departure_date, "%d%m%Y")
                date_str = dep_date.strftime("%Y-%m-%d")
            except ValueError:
                date_str = departure_date

        url = self.gf_config.search_url_template.format(
            origin=origin,
            dest=destination,
            date=date_str,
        )

        return {"url": url}

    async def parse_response(
        self,
        response: Any,
        route: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Not used — Google Flights uses DOM parsing, not HTTP response parsing."""
        raise NotImplementedError(
            "Google Flights uses DOM parsing via search_flights_dom()"
        )

    async def search_flights_dom(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Search Google Flights using DOM extraction.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Date string (used for advance_window calc).
            advance_window: Advance purchase window in days.

        Returns:
            List of FlightData records.
        """
        route = f"{origin}-{destination}"

        # Build search URL
        params = await self.build_search_params(
            origin, destination, departure_date, advance_window
        )
        url = params["url"]

        self.logger.info(f"Searching {route} on Google Flights: {url}")

        # Ensure browser is running
        if not self._context:
            await self.start_browser()

        page = await self._context.new_page()

        try:
            await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=30000,
            )

            # Wait for flight results to render
            await asyncio.sleep(self.gf_config.wait_for_render)

            # Extract flights from DOM
            flights = await self._extract_flights_from_dom(
                page, route, origin, destination, advance_window
            )

            self.logger.info(
                f"Extracted {len(flights)} flights from Google Flights for {route}"
            )
            return flights

        except Exception as e:
            self.logger.error(f"Google Flights DOM extraction failed: {e}")
            return []
        finally:
            await page.close()

    async def _extract_flights_from_dom(
        self,
        page: Any,
        route: str,
        origin: str,
        destination: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Extract flight data from rendered Google Flights page.

        Queries div.JMc5Xc elements and parses their aria-label text.

        Args:
            page: Playwright page object.
            route: Route string.
            origin: IATA origin code.
            destination: IATA destination code.
            advance_window: Advance purchase window in days.

        Returns:
            List of FlightData records.
        """
        # Extract aria-labels from div.JMc5Xc elements
        aria_labels = await page.evaluate("""
            () => {
                const results = [];
                const divs = document.querySelectorAll('div.JMc5Xc');
                for (const div of divs) {
                    const label = div.getAttribute('aria-label');
                    if (label && label.includes('rupees')) {
                        results.push(label);
                    }
                }
                return results;
            }
        """)

        flights: list[FlightData] = []
        flight_date = self._resolve_flight_date(origin, destination, advance_window)

        for label in aria_labels:
            flight = self._parse_aria_label(
                label, route, origin, destination, flight_date, advance_window
            )
            if flight:
                flights.append(flight)

        return flights

    def _parse_aria_label(
        self,
        label: str,
        route: str,
        origin: str,
        destination: str,
        flight_date: str,
        advance_window: int,
    ) -> Optional[FlightData]:
        """Parse a Google Flights aria-label into a FlightData record.

        Args:
            label: Aria-label text from div.JMc5Xc.
            route: Route string.
            origin: IATA origin code.
            destination: IATA destination code.
            flight_date: Flight date in YYYY-MM-DD format.
            advance_window: Advance purchase window in days.

        Returns:
            FlightData record, or None if parsing fails.
        """
        m = ARIA_LABEL_PATTERN.match(label)
        if not m:
            self.logger.debug(f"Failed to parse aria-label: {label[:100]}")
            return None

        try:
            total_fare = int(m.group(1).replace(",", ""))
            stops_text = m.group(2)
            airline_name = m.group(3)
            dep_time_str = m.group(5)
            arr_time_str = m.group(8)

            # Convert stops text to integer
            stops = 0 if stops_text.lower() == "nonstop" else int(
                re.search(r"(\d+)", stops_text).group(1)
            )

            # Map airline name to IATA code
            carrier_code = AIRLINE_CODE_MAP.get(airline_name)

            # Parse times to HH:MM format
            departure_time = self._parse_time_str(dep_time_str)
            arrival_time = self._parse_time_str(arr_time_str)

            return FlightData(
                source="Google Flights",
                route=route,
                origin=origin,
                destination=destination,
                flight_date=flight_date,
                carrier_code=carrier_code,  # None for unknown airlines
                carrier_name=airline_name,
                flight_number=None,  # Not available in DOM
                fare_class="ECONOMY",  # Only economy shown by default
                base_fare=float(total_fare),  # No tax breakdown
                tax_total=0.0,
                tax_breakdown_available=False,
                total_fare=float(total_fare),
                currency="INR",
                departure_time=departure_time,
                arrival_time=arrival_time,
                stops=stops,
                duration_minutes=None,  # Not in aria-label
                seat_remaining=None,  # Not in DOM
                is_refundable=False,  # Not shown
                advance_window=advance_window,
                raw_data={"aria_label": label},
            )

        except (AttributeError, ValueError, TypeError) as e:
            self.logger.debug(f"Failed to parse aria-label values: {e}")
            return None

    def _parse_time_str(self, time_str: str) -> str:
        """Parse time string like '1:00 PM' to '13:00' format.

        Args:
            time_str: Time string from aria-label.

        Returns:
            Time in HH:MM (24-hour) format.
        """
        try:
            # Handle Unicode non-breaking space
            cleaned = time_str.replace("\u202f", " ").strip()
            dt = datetime.strptime(cleaned, "%I:%M %p")
            return dt.strftime("%H:%M")
        except ValueError:
            return time_str

    def _resolve_flight_date(
        self, origin: str, destination: str, advance_window: int
    ) -> str:
        """Resolve flight date from advance window.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            advance_window: Advance purchase window in days.

        Returns:
            Flight date in YYYY-MM-DD format.
        """
        dep_date = datetime.now() + timedelta(days=advance_window)
        return dep_date.strftime("%Y-%m-%d")
