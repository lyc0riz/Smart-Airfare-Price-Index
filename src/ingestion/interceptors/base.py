"""Base interceptor class for portal-specific API extraction."""

import logging
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

import aiohttp

logger = logging.getLogger(__name__)


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

    Matches the canonical schema defined in docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md.
    Fields with None values indicate source-unavailable data (e.g., Google Flights
    does not provide carrier_code or flight_number).
    """

    source: str
    route: str
    origin: str
    destination: str
    flight_date: str
    carrier_code: str | None
    carrier_name: str
    flight_number: str | None
    fare_class: str
    base_fare: float
    tax_total: float
    tax_breakdown_available: bool
    total_fare: float
    currency: str
    departure_time: str
    arrival_time: str
    stops: int
    duration_minutes: int | None
    seat_remaining: int | None
    is_refundable: bool
    advance_window: int
    capture_timestamp: float = field(default_factory=time.time)
    raw_data: dict[str, Any] = field(default_factory=dict)


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
