"""Tests for Ixigo SSE parser."""

import json

import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

from src.ingestion.flare_solverr import FlareSolverrError
from src.ingestion.interceptors.ixigo import IxigoInterceptor


@pytest.fixture
def ixigo():
    return IxigoInterceptor()


def _make_sse_payload(flight_fare_entries: list) -> str:
    """Wrap flightFare entries in the real Ixigo SSE structure."""
    return json.dumps({
        "data": {
            "flightJourneys": [{
                "flightFare": flight_fare_entries,
            }]
        }
    })


class TestIxigoInterceptor:
    def test_normalize_flight_number(self, ixigo):
        assert ixigo._normalize_flight_number("AI2977") == "AI-2977"
        assert ixigo._normalize_flight_number("6E101") == "6E-101"
        assert ixigo._normalize_flight_number("SG1234") == "SG-1234"

    def test_normalize_flight_number_with_hyphen(self, ixigo):
        assert ixigo._normalize_flight_number("AI-2977") == "AI-2977"

    def test_normalize_flight_number_invalid_empty(self, ixigo):
        result = ixigo._normalize_flight_number("")
        assert result == ""

    def test_normalize_flight_number_invalid_short(self, ixigo):
        result = ixigo._normalize_flight_number("A")
        assert result == "A"

    def test_parse_flight_date_from_flight_keys(self, ixigo):
        result = ixigo._parse_flight_date("DEL-BOM-AI2977-01092026", 7)
        assert result == "2026-09-01"

    def test_parse_flight_date_fallback(self, ixigo):
        result = ixigo._parse_flight_date("", 7)
        from datetime import datetime, timedelta
        expected = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        assert result == expected

    def test_parse_sse_text_empty(self, ixigo):
        flights = ixigo._parse_sse_text("data: {}", "DEL-BOM", "DEL", "BOM", 7)
        assert isinstance(flights, list)

    def test_parse_sse_text_malformed(self, ixigo):
        flights = ixigo._parse_sse_text("not json at all", "DEL-BOM", "DEL", "BOM", 7)
        assert flights == []

    def test_parse_sse_text_valid_structure(self, ixigo):
        """Single nonstop flight with seat availability."""
        payload = _make_sse_payload([{
            "flightDetails": [{
                "airlineCode": "6E",
                "headerTextWeb": "IndiGo",
                "subHeaderTextWeb": "6E101",
                "departureTime": "08:30",
                "arrivalTime": "10:45",
                "duration": {"time": 135},
                "stop": 0,
                "departureDate": "2026-09-01",
            }],
            "fares": [{
                "fareDetails": {
                    "displayFare": 5750,
                },
                "fareMetadata": [{
                    "cabinClass": "ECONOMY",
                    "seatRemaining": 12,
                }],
            }],
            "refundableType": "REFUNDABLE",
            "flightKeys": ["DEL-BOM-6E101-01092026"],
        }])
        flights = ixigo._parse_sse_text(f"data: {payload}", "DEL-BOM", "DEL", "BOM", 7)
        assert len(flights) == 1
        f = flights[0]
        assert f.carrier_code == "6E"
        assert f.total_fare == 5750.0
        assert f.is_sold_out is False
        assert f.duration_min == 135

    def test_parse_sse_text_2stop_flights(self, ixigo):
        """2-stop flight with seatRemaining=0 (should map to is_sold_out=True)."""
        payload = _make_sse_payload([{
            "flightDetails": [{
                "airlineCode": "AI",
                "headerTextWeb": "Air India",
                "subHeaderTextWeb": "AI123",
                "departureTime": "06:00",
                "arrivalTime": "12:00",
                "duration": {"time": 360},
                "stop": 2,
                "departureDate": "2026-09-01",
            }],
            "fares": [{
                "fareDetails": {
                    "displayFare": 12000,
                },
                "fareMetadata": [{
                    "cabinClass": "ECONOMY",
                    "seatRemaining": 0,
                }],
            }],
            "refundableType": "NON_REFUNDABLE",
            "flightKeys": [],
        }])
        flights = ixigo._parse_sse_text(f"data: {payload}", "DEL-BOM", "DEL", "BOM", 7)
        assert len(flights) == 1
        assert flights[0].stops == 2
        assert flights[0].is_sold_out is True  # seatRemaining=0 → sold out

    def test_parse_sse_text_multi_leg_concatenated(self, ixigo):
        """Multi-leg flight: real data has comma-separated flight numbers in subHeaderTextWeb."""
        payload = _make_sse_payload([{
            "flightDetails": [
                {
                    "airlineCode": "AI",
                    "headerTextWeb": "Air India",
                    "subHeaderTextWeb": "AI809, AI2494",
                    "departureTime": "17:40",
                    "arrivalTime": "22:40",
                    "duration": {"time": 300},
                    "stop": 1,
                    "departureDate": "2026-09-01",
                },
            ],
            "fares": [{
                "fareDetails": {
                    "displayFare": 13748,
                },
                "fareMetadata": [{
                    "cabinClass": "ECONOMY",
                    "seatRemaining": 5,
                }],
            }],
            "refundableType": "REFUNDABLE",
            "flightKeys": ["DEL-BOM-AI809-01092026"],
        }])
        flights = ixigo._parse_sse_text(f"data: {payload}", "DEL-BOM", "DEL", "BOM", 7)
        assert len(flights) == 1
        f = flights[0]
        assert f.stops == 1
        assert f.total_fare == 13748.0
        assert f.is_sold_out is False


class TestIxigoFlareSolverr:
    @pytest.fixture
    def ixigo_fs(self):
        return IxigoInterceptor()

    @pytest.mark.asyncio
    async def test_ensure_cf_cookies_solves_once(self, ixigo_fs):
        ixigo_fs._cleared_cookies = None
        ixigo_fs._flaresolverr.solve_for_portal = AsyncMock(
            return_value={"cf_clearance": "abc"}
        )

        cookies = await ixigo_fs.ensure_cf_cookies()
        assert cookies == {"cf_clearance": "abc"}
        # Second call uses the cleared cookie cache (no re-solve)
        await ixigo_fs.ensure_cf_cookies()
        ixigo_fs._flaresolverr.solve_for_portal.assert_called_once()

    @pytest.mark.asyncio
    async def test_ensure_cf_cookies_force_refresh(self, ixigo_fs):
        ixigo_fs._cleared_cookies = {"cf_clearance": "old"}
        ixigo_fs._flaresolverr.solve_for_portal = AsyncMock(
            return_value={"cf_clearance": "new"}
        )

        cookies = await ixigo_fs.ensure_cf_cookies(force_refresh=True)
        assert cookies == {"cf_clearance": "new"}

    @pytest.mark.asyncio
    async def test_is_flaresolverr_available_delegates(self, ixigo_fs):
        ixigo_fs._flaresolverr.is_available = AsyncMock(return_value=True)
        assert await ixigo_fs.is_flaresolverr_available() is True

    @pytest.mark.asyncio
    async def test_search_flaresolverr_success(self, ixigo_fs):
        # Build a small valid SSE payload
        payload = _make_sse_payload([{
            "flightDetails": [{
                "airlineCode": "6E",
                "headerTextWeb": "IndiGo",
                "subHeaderTextWeb": "6E101",
                "departureTime": "08:30",
                "arrivalTime": "10:45",
                "duration": {"time": 135},
                "stop": 0,
            }],
            "fares": [{
                "fareDetails": {"displayFare": 5750},
                "fareMetadata": [{"cabinClass": "ECONOMY", "seatRemaining": 12}],
            }],
            "flightKeys": ["DEL-BOM-6E101-01092026"],
        }])
        sse_body = f"data: {payload}"

        ixigo_fs.ensure_cf_cookies = AsyncMock(
            return_value={"cf_clearance": "abc"}
        )

        resp = MagicMock()
        resp.status_code = 200
        resp.atext = AsyncMock(return_value=sse_body)

        session = AsyncMock()
        session.get.return_value = resp
        session.__aenter__.return_value = session
        session.__aexit__.return_value = False

        with patch(
            "src.ingestion.interceptors.ixigo.AsyncSession",
            return_value=session,
        ):
            flights = await ixigo_fs.search_flights_flaresolverr(
                "DEL", "BOM", "01092026", 7
            )

        assert len(flights) == 1
        assert flights[0].carrier_code == "6E"
        assert flights[0].total_fare == 5750.0

    @pytest.mark.asyncio
    async def test_search_flaresolverr_403_returns_empty(self, ixigo_fs):
        ixigo_fs.ensure_cf_cookies = AsyncMock(
            return_value={"cf_clearance": "stale"}
        )

        resp = MagicMock()
        resp.status_code = 403
        resp.atext = AsyncMock(return_value="Forbidden")

        session = AsyncMock()
        session.get.return_value = resp
        session.__aenter__.return_value = session
        session.__aexit__.return_value = False

        with patch(
            "src.ingestion.interceptors.ixigo.AsyncSession",
            return_value=session,
        ):
            flights = await ixigo_fs.search_flights_flaresolverr(
                "DEL", "BOM", "01092026", 7
            )

        assert flights == []
