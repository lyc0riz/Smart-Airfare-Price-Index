"""Tests for Google Flights DOM interceptor."""

import pytest

from src.ingestion.interceptors.google_flights import (
    GoogleFlightsInterceptor,
    AIRLINE_CODE_MAP,
)


@pytest.fixture
def gf():
    return GoogleFlightsInterceptor()


class TestGoogleFlightsInterceptor:
    def test_parse_aria_label_economy(self, gf):
        label = (
            "From 5,750 Indian rupees round trip total. "
            "Nonstop flight with IndiGo. "
            "Leaves Indira Gandhi International Airport at 8:30 AM "
            "on Tuesday, September 1, 2026 "
            "and arrives Chhatrapati Shivaji Maharaj International Airport at 10:45 AM "
            "on Tuesday, September 1, 2026."
        )
        parsed = gf._parse_aria_label(label, "DEL-BOM", "DEL", "BOM", "2026-09-01", 7)
        assert parsed is not None
        assert parsed.total_fare == 5750.0
        assert parsed.stops == 0
        assert parsed.carrier_name == "IndiGo"
        assert parsed.carrier_code == "6E"
        assert parsed.departure_time == "08:30"
        assert parsed.arrival_time == "10:45"

    def test_parse_aria_label_one_stop(self, gf):
        label = (
            "From 13,748 Indian rupees round trip total. "
            "1 stop flight with Air India. "
            "Leaves Indira Gandhi International Airport at 5:40 PM "
            "on Tuesday, September 1, 2026 "
            "and arrives Chhatrapati Shivaji Maharaj International Airport at 10:40 PM "
            "on Tuesday, September 1, 2026."
        )
        parsed = gf._parse_aria_label(label, "DEL-BOM", "DEL", "BOM", "2026-09-01", 7)
        assert parsed is not None
        assert parsed.stops == 1
        assert parsed.carrier_name == "Air India"
        assert parsed.carrier_code == "AI"

    def test_parse_aria_label_invalid(self, gf):
        assert gf._parse_aria_label("random text", "DEL-BOM", "DEL", "BOM", "2026-09-01", 7) is None
        assert gf._parse_aria_label("", "DEL-BOM", "DEL", "BOM", "2026-09-01", 7) is None

    def test_airline_code_map(self, gf):
        assert AIRLINE_CODE_MAP["IndiGo"] == "6E"
        assert AIRLINE_CODE_MAP["Air India"] == "AI"
        assert AIRLINE_CODE_MAP["SpiceJet"] == "SG"
        assert AIRLINE_CODE_MAP["Vistara"] == "UK"

    def test_parse_time_str(self, gf):
        assert gf._parse_time_str("8:30 AM") == "08:30"
        assert gf._parse_time_str("10:45 PM") == "22:45"
        assert gf._parse_time_str("12:00 AM") == "00:00"
        assert gf._parse_time_str("12:00 PM") == "12:00"
        # Invalid returns the original string (no None)
        assert gf._parse_time_str("invalid") == "invalid"
