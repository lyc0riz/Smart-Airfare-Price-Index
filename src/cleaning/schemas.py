"""Pydantic V2 models for APIx flight data.

Defines the validated flight quote schema matching the Supabase
`flight_quotes` table (docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md Section 8).

Generated columns (`route`, `core_fare`, `booking_date`) are computed by
PostgreSQL and are NOT part of this model.
"""

import hashlib
import uuid
from datetime import date, datetime, time
from enum import Enum
from typing import Optional
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator

IST = ZoneInfo("Asia/Kolkata")


class SourceEnum(str, Enum):
    """Data source portal identifiers."""

    IXIGO = "Ixigo"
    GOOGLE_FLIGHTS = "Google Flights"


class FareClassEnum(str, Enum):
    """Cabin class identifiers."""

    ECONOMY = "ECONOMY"
    PREMIUM_ECONOMY = "PREMIUM_ECONOMY"
    BUSINESS = "BUSINESS"
    FIRST = "FIRST"


def compute_data_hash(
    journey_date: date,
    origin: str,
    destination: str,
    carrier_code: Optional[str],
    flight_number: Optional[str],
    journey_class: str,
    total_fare: float,
    source_portal: str,
) -> str:
    """Compute SHA-256 hash of the flight quote composite key."""
    raw = (
        f"{journey_date}:{origin}:{destination}:{carrier_code or ''}:"
        f"{flight_number or ''}:{journey_class}:{total_fare}:{source_portal}"
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def combine_journey_datetime(journey_date: date, hhmm: str) -> datetime:
    """Combine a journey date with an HH:MM local time into IST-aware datetime.

    Args:
        journey_date: Scheduled departure date.
        hhmm: Local time in HH:MM (24-hour) format.

    Returns:
        Timezone-aware datetime in Asia/Kolkata.
    """
    t = time.fromisoformat(hhmm)
    return datetime.combine(journey_date, t, tzinfo=IST)


class FlightRecord(BaseModel):
    """Validated flight quote record.

    Mirrors the `flight_quotes` table columns. Use `to_quote_dict()` to
    produce a dict compatible with `SupabaseSink.upsert_flight_quotes()`.
    """

    model_config = {"populate_by_name": True}

    quote_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_portal: SourceEnum
    scraping_date_time: datetime = Field(default_factory=lambda: datetime.now(tz=IST))
    journey_date: date
    origin: str = Field(min_length=3, max_length=3)
    destination: str = Field(min_length=3, max_length=3)
    advance_windows: int = Field(ge=0, le=365)
    carrier_code: Optional[str] = Field(default=None, max_length=10)
    carrier: str = Field(max_length=50)
    flight_number: Optional[str] = Field(default=None, max_length=50)
    journey_class: FareClassEnum = FareClassEnum.ECONOMY
    fare: float = Field(gt=0)
    base_fare: float = Field(gt=0)
    fees: float = Field(default=0.0, ge=0)
    tax_udf: float = Field(default=0.0, ge=0)
    tax_asf: float = Field(default=0.0, ge=0)
    tax_gst: float = Field(default=0.0, ge=0)
    taxes: float = Field(default=0.0, ge=0)
    total_fare: float = Field(gt=0)
    departure: datetime
    arrival: datetime
    duration_min: Optional[int] = Field(default=None, ge=0)
    stops: int = Field(ge=0, default=0)
    is_sold_out: bool = False
    is_imputed: bool = False
    data_hash: str = ""

    @field_validator("origin", "destination")
    @classmethod
    def validate_iata(cls, v: str) -> str:
        """Ensure IATA code is uppercase."""
        return v.upper()

    @field_validator("carrier_code")
    @classmethod
    def validate_carrier_code(cls, v: Optional[str]) -> Optional[str]:
        """Ensure carrier code is uppercase if provided."""
        return v.upper() if v else v

    @field_validator("total_fare", "fare", "base_fare")
    @classmethod
    def validate_positive_money(cls, v: float) -> float:
        """Monetary amounts must be positive."""
        if v <= 0:
            raise ValueError(f"monetary amount must be positive: {v}")
        return round(v, 2)

    def compute_hash(self) -> str:
        """Compute and set the data hash."""
        self.data_hash = compute_data_hash(
            self.journey_date,
            self.origin,
            self.destination,
            self.carrier_code,
            self.flight_number,
            self.journey_class.value,
            self.total_fare,
            self.source_portal.value,
        )
        return self.data_hash

    def model_post_init(self, __context: dict) -> None:
        """Auto-compute data_hash if empty."""
        if not self.data_hash:
            self.compute_hash()

    def to_quote_dict(self) -> dict:
        """Produce a dict for SupabaseSink.upsert_flight_quotes().

        Excludes generated columns (route, core_fare, booking_date).
        """
        return {
            "quote_id": uuid.UUID(self.quote_id),
            "source_portal": self.source_portal.value,
            "scraping_date_time": self.scraping_date_time,
            "journey_date": self.journey_date,
            "origin": self.origin,
            "destination": self.destination,
            "advance_windows": self.advance_windows,
            "carrier_code": self.carrier_code,
            "carrier": self.carrier,
            "flight_number": self.flight_number,
            "journey_class": self.journey_class.value,
            "fare": self.fare,
            "base_fare": self.base_fare,
            "fees": self.fees,
            "tax_udf": self.tax_udf,
            "tax_asf": self.tax_asf,
            "tax_gst": self.tax_gst,
            "taxes": self.taxes,
            "total_fare": self.total_fare,
            "departure": self.departure,
            "arrival": self.arrival,
            "duration_min": self.duration_min,
            "stops": self.stops,
            "is_sold_out": self.is_sold_out,
            "is_imputed": self.is_imputed,
            "data_hash": self.data_hash,
        }


class IxigoRawPayload(BaseModel):
    """Raw Ixigo SSE flightFare entry for deserialization."""

    flightKeys: str = ""
    refundableType: str = ""
    fares: list[dict] = []
    flightFilter: list[dict] = []
    flightDetails: list[dict] = []
    sort: dict = {}


class GoogleFlightsAriaData(BaseModel):
    """Parsed Google Flights aria-label data."""

    total_fare: int
    stops_text: str
    airline: str
    dep_airport: str
    dep_time: str
    dep_date: str
    arr_airport: Optional[str] = None
    arr_time: str
    arr_date: Optional[str] = None
