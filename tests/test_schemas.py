"""Tests for Pydantic V2 flight quote schemas."""

import pytest
from datetime import date, datetime
from zoneinfo import ZoneInfo

from src.cleaning.schemas import (
    FlightRecord,
    SourceEnum,
    FareClassEnum,
    compute_data_hash,
    combine_journey_datetime,
)

IST = ZoneInfo("Asia/Kolkata")


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
            "source_portal": "Ixigo",
            "origin": "DEL",
            "destination": "BOM",
            "journey_date": "2026-09-01",
            "advance_windows": 7,
            "carrier_code": "6E",
            "carrier": "IndiGo",
            "flight_number": "6E-101",
            "journey_class": "ECONOMY",
            "fare": 5750.0,
            "base_fare": 5000.0,
            "taxes": 750.0,
            "total_fare": 5750.0,
            "departure": datetime(2026, 9, 1, 8, 30, tzinfo=IST),
            "arrival": datetime(2026, 9, 1, 10, 45, tzinfo=IST),
            "stops": 0,
            "duration_min": 135,
            "is_sold_out": False,
            "is_imputed": False,
            "data_hash": "abc123",
        }
        defaults.update(overrides)
        return defaults

    def test_valid_record(self):
        rec = FlightRecord(**self._make_record())
        assert rec.source_portal == SourceEnum.IXIGO
        assert rec.total_fare == 5750.0
        assert rec.is_sold_out is False

    def test_sold_out_flag(self):
        rec = FlightRecord(**self._make_record(is_sold_out=True))
        assert rec.is_sold_out is True

    def test_invalid_total_fare_negative(self):
        with pytest.raises(ValueError):
            FlightRecord(**self._make_record(total_fare=-100))

    def test_invalid_fare_negative(self):
        with pytest.raises(ValueError):
            FlightRecord(**self._make_record(fare=0))

    def test_invalid_stops_negative(self):
        with pytest.raises(ValueError):
            FlightRecord(**self._make_record(stops=-1))

    def test_journey_date_as_date_object(self):
        rec = FlightRecord(**self._make_record(journey_date=date(2026, 9, 1)))
        assert isinstance(rec.journey_date, date)
        assert rec.journey_date == date(2026, 9, 1)

    def test_journey_date_as_string(self):
        rec = FlightRecord(**self._make_record(journey_date="2026-09-01"))
        assert isinstance(rec.journey_date, date)

    def test_carrier_code_uppercased(self):
        rec = FlightRecord(**self._make_record(carrier_code="6e"))
        assert rec.carrier_code == "6E"

    def test_carrier_code_optional(self):
        rec = FlightRecord(**self._make_record(carrier_code=None))
        assert rec.carrier_code is None

    def test_google_flights_source(self):
        rec = FlightRecord(**self._make_record(
            source_portal="Google Flights",
            carrier_code=None,
            flight_number=None,
        ))
        assert rec.source_portal == SourceEnum.GOOGLE_FLIGHTS
        assert rec.carrier_code is None

    def test_auto_hash_computed(self):
        overrides = self._make_record()
        overrides.pop("data_hash")
        rec = FlightRecord(**overrides)
        assert len(rec.data_hash) == 64

    def test_to_quote_dict_excludes_generated_columns(self):
        rec = FlightRecord(**self._make_record())
        d = rec.to_quote_dict()
        assert "route" not in d
        assert "core_fare" not in d
        assert "booking_date" not in d

    def test_to_quote_dict_roundtrip_fields(self):
        rec = FlightRecord(**self._make_record())
        d = rec.to_quote_dict()
        assert d["source_portal"] == "Ixigo"
        assert d["origin"] == "DEL"
        assert d["destination"] == "BOM"
        assert d["advance_windows"] == 7
        assert d["carrier"] == "IndiGo"
        assert d["total_fare"] == 5750.0
        assert d["departure"].tzinfo is not None


class TestComputeDataHash:
    def test_hash_deterministic(self):
        kwargs = dict(
            journey_date="2026-09-01", origin="DEL", destination="BOM",
            carrier_code="6E", flight_number="6E-101",
            journey_class="ECONOMY", total_fare=5750.0, source_portal="Ixigo",
        )
        assert compute_data_hash(**kwargs) == compute_data_hash(**kwargs)

    def test_hash_differs_on_fare(self):
        base = dict(
            journey_date="2026-09-01", origin="DEL", destination="BOM",
            carrier_code="6E", flight_number="6E-101",
            journey_class="ECONOMY", source_portal="Ixigo",
        )
        h1 = compute_data_hash(total_fare=5750.0, **base)
        h2 = compute_data_hash(total_fare=5751.0, **base)
        assert h1 != h2

    def test_hash_is_hex_string(self):
        h = compute_data_hash(
            journey_date="2026-09-01", origin="DEL", destination="BOM",
            carrier_code="AI", flight_number="AI-100",
            journey_class="ECONOMY", total_fare=10000.0,
            source_portal="Google Flights",
        )
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


class TestCombineJourneyDatetime:
    def test_combine_attaches_ist(self):
        dt = combine_journey_datetime(date(2026, 9, 1), "08:30")
        assert dt.tzinfo is not None
        assert dt.hour == 8
        assert dt.minute == 30

    def test_utc_offset(self):
        dt = combine_journey_datetime(date(2026, 9, 1), "08:30")
        assert dt.utcoffset().total_seconds() == 5.5 * 3600
