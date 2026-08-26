"""Tests for Pydantic V2 flight schemas."""

import pytest
from datetime import date

from src.cleaning.schemas import (
    FlightRecord,
    SourceEnum,
    FareClassEnum,
    compute_data_hash,
)


class TestSourceEnum:
    def test_valid_sources(self):
        assert SourceEnum.IXIGO.value == "Ixigo"
        assert SourceEnum.GOOGLE_FLIGHTS.value == "Google Flights"

    def test_invalid_source(self):
        with pytest.raises(ValueError):
            SourceEnum("invalid")


class TestFareClassEnum:
    def test_valid_fare_classes(self):
        assert FareClassEnum.ECONOMY.value == "ECONOMY"
        assert FareClassEnum.BUSINESS.value == "BUSINESS"

    def test_invalid_fare_class(self):
        with pytest.raises(ValueError):
            FareClassEnum("first")


class TestFlightRecord:
    def _make_record(self, **overrides) -> dict:
        defaults = {
            "source": "Ixigo",
            "route": "DEL-BOM",
            "origin": "DEL",
            "destination": "BOM",
            "flight_date": "2026-09-01",
            "advance_window": 7,
            "carrier_code": "6E",
            "carrier_name": "IndiGo",
            "flight_number": "6E-101",
            "fare_class": "ECONOMY",
            "base_fare": 5000.0,
            "tax_total": 750.0,
            "tax_breakdown_available": True,
            "total_fare": 5750.0,
            "currency": "INR",
            "departure_time": "08:30",
            "arrival_time": "10:45",
            "stops": 0,
            "duration_minutes": 135,
            "seat_remaining": 12,
            "is_refundable": True,
            "is_imputed": False,
            "data_hash": "abc123",
        }
        defaults.update(overrides)
        return defaults

    def test_valid_record(self):
        rec = FlightRecord(**self._make_record())
        assert rec.source == SourceEnum.IXIGO
        assert rec.total_fare == 5750.0
        assert rec.seat_remaining == 12

    def test_seat_remaining_zero_becomes_none(self):
        rec = FlightRecord(**self._make_record(seat_remaining=0))
        assert rec.seat_remaining is None

    def test_seat_remaining_none_stays_none(self):
        rec = FlightRecord(**self._make_record(seat_remaining=None))
        assert rec.seat_remaining is None

    def test_seat_remaining_positive_preserved(self):
        rec = FlightRecord(**self._make_record(seat_remaining=5))
        assert rec.seat_remaining == 5

    def test_invalid_total_fare_negative(self):
        with pytest.raises(ValueError):
            FlightRecord(**self._make_record(total_fare=-100))

    def test_invalid_stops_negative(self):
        with pytest.raises(ValueError):
            FlightRecord(**self._make_record(stops=-1))

    def test_flight_date_as_date_object(self):
        rec = FlightRecord(**self._make_record(flight_date=date(2026, 9, 1)))
        assert isinstance(rec.flight_date, date)
        assert rec.flight_date == date(2026, 9, 1)

    def test_flight_date_as_string(self):
        rec = FlightRecord(**self._make_record(flight_date="2026-09-01"))
        assert isinstance(rec.flight_date, date)

    def test_carrier_code_optional(self):
        rec = FlightRecord(**self._make_record(carrier_code=None))
        assert rec.carrier_code is None

    def test_google_flights_source(self):
        rec = FlightRecord(**self._make_record(
            source="Google Flights",
            carrier_code=None,
            flight_number=None,
        ))
        assert rec.source == SourceEnum.GOOGLE_FLIGHTS
        assert rec.carrier_code is None


class TestComputeDataHash:
    def test_hash_deterministic(self):
        h1 = compute_data_hash("DEL-BOM", "6E", "6E-101", "2026-09-01", 5750.0, "Ixigo")
        h2 = compute_data_hash("DEL-BOM", "6E", "6E-101", "2026-09-01", 5750.0, "Ixigo")
        assert h1 == h2

    def test_hash_differs_on_fare(self):
        h1 = compute_data_hash("DEL-BOM", "6E", "6E-101", "2026-09-01", 5750.0, "Ixigo")
        h2 = compute_data_hash("DEL-BOM", "6E", "6E-101", "2026-09-01", 5751.0, "Ixigo")
        assert h1 != h2

    def test_hash_differs_on_flight_number(self):
        h1 = compute_data_hash("DEL-BOM", "6E", "6E-101", "2026-09-01", 5750.0, "Ixigo")
        h2 = compute_data_hash("DEL-BOM", "6E", "6E-202", "2026-09-01", 5750.0, "Ixigo")
        assert h1 != h2

    def test_hash_is_hex_string(self):
        h = compute_data_hash("DEL-BOM", "AI", "AI-100", "2026-09-01", 10000.0, "Google Flights")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)
