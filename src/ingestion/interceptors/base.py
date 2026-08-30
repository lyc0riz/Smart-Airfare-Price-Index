"""Base interceptor class for portal-specific API extraction."""

import logging
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime, time as dtime
from typing import Any, Optional
from zoneinfo import ZoneInfo

import aiohttp

from src.cleaning.schemas import (
    FareClassEnum,
    SourceEnum,
    compute_data_hash,
)

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")
UTC = ZoneInfo("UTC")


@dataclass
class InterceptorConfig:
    """Configuration for a portal interceptor."""

    base_url: str = ""
    rate_limit_per_sec: float = 1.0
    max_retries: int = 4
    retry_backoff_base: int = 2
    request_timeout: int = 30
    user_agent: str = (
        "MoSPI-APIx-Research-Bot/1.0 "
        "(+https://mospi.gov.in/cpi; rate-limited; research-use)"
    )


@dataclass
class CapturedHeaders:
    """Headers captured from intercepted requests."""

    url: str
    method: str
    headers: dict[str, str] = field(default_factory=dict)
    post_data: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class FlightData:
    """Standardized flight data record.

    Mirrors the Supabase `flight_quotes` table (docs/
    DATA_SCHEMA_AND_EXTRACTION_SPEC.md Section 8). Times are kept as
    HH:MM strings until `to_quote_dict()` builds IST-aware datetimes.
    Fields with None values indicate source-unavailable data (e.g.,
    Google Flights does not provide carrier_code or flight_number).
    """

    source_portal: str
    origin: str
    destination: str
    journey_date: str
    advance_windows: int
    carrier_code: str | None
    carrier: str
    flight_number: str | None
    journey_class: str
    fare: float
    base_fare: float
    total_fare: float
    departure_time: str
    arrival_time: str
    stops: int
    fees: float = 0.0
    tax_udf: float = 0.0
    tax_asf: float = 0.0
    tax_gst: float = 0.0
    taxes: float = 0.0
    duration_min: int | None = None
    is_sold_out: bool = False
    capture_timestamp: float = field(default_factory=time.time)
    raw_data: dict[str, Any] = field(default_factory=dict)

    def to_quote_dict(self) -> dict[str, Any]:
        """Convert to a dict for SupabaseSink.upsert_flight_quotes().

        Builds timezone-aware datetimes for `scraping_date_time`,
        `departure`, and `arrival`, and computes `data_hash`.
        Generated columns (route, core_fare, booking_date) are excluded.
        """
        journey_date = date.fromisoformat(self.journey_date)
        dep_t = dtime.fromisoformat(self.departure_time)
        arr_t = dtime.fromisoformat(self.arrival_time)
        departure = datetime.combine(journey_date, dep_t, tzinfo=IST)
        arrival = datetime.combine(journey_date, arr_t, tzinfo=IST)
        if arrival < departure:
            # Overnight flight — arrival is next day
            arrival = datetime.combine(
                journey_date.fromordinal(journey_date.toordinal() + 1),
                arr_t,
                tzinfo=IST,
            )

        scraping_dt = datetime.fromtimestamp(self.capture_timestamp, tz=UTC)
        source_enum = SourceEnum(self.source_portal)
        class_enum = FareClassEnum(self.journey_class.upper())
        data_hash = compute_data_hash(
            journey_date,
            self.origin,
            self.destination,
            self.carrier_code,
            self.flight_number,
            class_enum.value,
            self.total_fare,
            source_enum.value,
        )

        return {
            "quote_id": uuid.uuid4(),
            "source_portal": source_enum.value,
            "scraping_date_time": scraping_dt,
            "journey_date": journey_date,
            "origin": self.origin.upper(),
            "destination": self.destination.upper(),
            "advance_windows": self.advance_windows,
            "carrier_code": (
                self.carrier_code.upper() if self.carrier_code else None
            ),
            "carrier": self.carrier,
            "flight_number": self.flight_number,
            "journey_class": class_enum.value,
            "fare": round(self.fare, 2),
            "base_fare": round(self.base_fare, 2),
            "fees": round(self.fees, 2),
            "tax_udf": round(self.tax_udf, 2),
            "tax_asf": round(self.tax_asf, 2),
            "tax_gst": round(self.tax_gst, 2),
            "taxes": round(self.taxes, 2),
            "total_fare": round(self.total_fare, 2),
            "departure": departure,
            "arrival": arrival,
            "duration_min": self.duration_min,
            "stops": self.stops,
            "is_sold_out": self.is_sold_out,
            "is_imputed": False,
            "data_hash": data_hash,
        }


class BaseInterceptor(ABC):
    """Abstract base class for portal-specific interceptors.

    Each interceptor handles:
    1. Building search URLs/payloads for its portal
    2. Making authenticated API calls
    3. Parsing responses into FlightData records
    """

    def __init__(self, config: InterceptorConfig) -> None:
        self.config = config
        self.logger = logging.getLogger(self.__class__.__name__)
        self._last_request_time: float = 0.0
        self._session: Optional[aiohttp.ClientSession] = None
        self._device_id: str = uuid.uuid4().hex[:20]

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.config.request_timeout)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def _rate_limit_wait(self) -> None:
        """Enforce rate limiting between requests."""
        now = time.time()
        min_interval = 1.0 / self.config.rate_limit_per_sec
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            wait_time = min_interval - elapsed
            self.logger.debug(f"Rate limit: waiting {wait_time:.2f}s")
            await asyncio.sleep(wait_time)
        self._last_request_time = time.time()

    async def _fetch_with_retry(
        self,
        url: str,
        headers: dict[str, str],
        params: Optional[dict[str, str]] = None,
    ) -> Optional[aiohttp.ClientResponse]:
        """Fetch URL with exponential backoff retry.

        Args:
            url: Target URL.
            headers: Request headers.
            params: Optional query parameters.

        Returns:
            ClientResponse on success, None on exhausted retries.
        """
        import asyncio

        for attempt in range(self.config.max_retries):
            await self._rate_limit_wait()
            session = await self._get_session()

            try:
                async with session.get(
                    url, headers=headers, params=params
                ) as response:
                    if response.status == 200:
                        return response
                    if response.status in (429, 500, 502, 503, 504):
                        wait = self.config.retry_backoff_base ** (attempt + 1)
                        self.logger.warning(
                            f"HTTP {response.status} from {url}, "
                            f"retrying in {wait}s (attempt {attempt + 1})"
                        )
                        await asyncio.sleep(wait)
                        continue
                    self.logger.error(
                        f"HTTP {response.status} from {url} — not retryable"
                    )
                    return None
            except aiohttp.ClientError as e:
                wait = self.config.retry_backoff_base ** (attempt + 1)
                self.logger.warning(
                    f"Network error: {e}, retrying in {wait}s"
                )
                await asyncio.sleep(wait)

        self.logger.error(f"Exhausted {self.config.max_retries} retries for {url}")
        return None

    @abstractmethod
    async def build_search_headers(self) -> dict[str, str]:
        """Build headers required for the portal's API."""

    @abstractmethod
    async def build_search_params(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        advance_window: int,
    ) -> dict[str, str]:
        """Build search query parameters.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Date in portal-specific format.
            advance_window: Advance purchase window in days.
        """

    @abstractmethod
    async def parse_response(
        self,
        response: aiohttp.ClientResponse,
        route: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Parse portal response into standardized FlightData records."""

    async def search_flights(
        self,
        origin: str,
        destination: str,
        departure_date: str,
        advance_window: int,
    ) -> list[FlightData]:
        """Execute a flight search and return parsed results.

        Args:
            origin: IATA origin code.
            destination: IATA destination code.
            departure_date: Date in portal-specific format.
            advance_window: Advance purchase window in days.

        Returns:
            List of FlightData records.
        """
        route = f"{origin}-{destination}"
        headers = await self.build_search_headers()
        params = await self.build_search_params(
            origin, destination, departure_date, advance_window
        )
        url = self.config.base_url

        self.logger.info(f"Searching {route} on {self.__class__.__name__}")

        response = await self._fetch_with_retry(url, headers, params)
        if response is None:
            self.logger.error(f"Failed to fetch {route}")
            return []

        try:
            return await self.parse_response(response, route, advance_window)
        except Exception as e:
            self.logger.error(f"Parse error for {route}: {e}")
            return []

    async def close(self) -> None:
        """Close the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()
