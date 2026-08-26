"""Pydantic V2 models for APIx flight data.

Defines validated schemas for raw (Bronze), cleaned (Silver), and
index-ready (Gold) flight data layers.
"""

import hashlib
import uuid
from datetime import date, datetime, time
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


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
    route: str,
    carrier_code: Optional[str],
    flight_number: Optional[str],
    flight_date: date,
    total_fare: float,
    source: str,
) -> str:
    """Compute SHA-256 hash of composite key fields."""
    raw = f"{route}:{carrier_code or ''}:{flight_number or ''}:{flight_date}:{total_fare}:{source}"
    return hashlib.sha256(raw.encode()).hexdigest()


class FlightRecord(BaseModel):
    """Validated flight data record.

    Used across all three medallion layers. The Bronze layer populates
    `raw_payload`; Silver strips it; Gold adds `route_weight`.
    """

    model_config = {"populate_by_name": True}

    record_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    capture_timestamp: datetime = Field(default_factory=lambda: datetime.utcnow())
    source: SourceEnum
    source_session_id: Optional[str] = None
    route: str
    origin: str = Field(min_length=3, max_length=3)
    destination: str = Field(min_length=3, max_length=3)
    flight_date: date
    advance_window: int = Field(ge=0, le=365)
    carrier_code: Optional[str] = Field(default=None, min_length=2, max_length=2)
    carrier_name: str
    flight_number: Optional[str] = None
    fare_class: FareClassEnum = FareClassEnum.ECONOMY
    base_fare: float = Field(gt=0)
    tax_total: float = Field(ge=0, default=0.0)
    tax_breakdown_available: bool = False
    total_fare: float = Field(gt=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    departure_time: time
    arrival_time: time
    stops: int = Field(ge=0, default=0)
    duration_minutes: Optional[int] = Field(default=None, ge=0)
    seat_remaining: Optional[int] = Field(default=None, ge=0)
    is_refundable: bool = False
    is_imputed: bool = False
    data_hash: str = ""
    raw_payload: Optional[dict] = None

    @field_validator("route")
    @classmethod
    def validate_route(cls, v: str) -> str:
        """Ensure route follows ORIGIN-DEST pattern."""
        parts = v.split("-")
        if len(parts) != 2 or len(parts[0]) != 3 or len(parts[1]) != 3:
            raise ValueError(f"Route must be ORIGIN-DEST (3-letter codes): {v}")
        return v.upper()

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

    @field_validator("seat_remaining")
    @classmethod
    def validate_seat_remaining(cls, v: Optional[int]) -> Optional[int]:
        """Treat 0 as NULL (undisclosed, not sold out)."""
        return None if v == 0 else v

    @field_validator("total_fare")
    @classmethod
    def validate_total_fare_positive(cls, v: float) -> float:
        """Total fare must be positive."""
        if v <= 0:
            raise ValueError(f"total_fare must be positive: {v}")
        return round(v, 2)

    def compute_hash(self) -> str:
        """Compute and set the data hash."""
        self.data_hash = compute_data_hash(
            self.route,
            self.carrier_code,
            self.flight_number,
            self.flight_date,
            self.total_fare,
            self.source.value,
        )
        return self.data_hash

    def model_post_init(self, __context: dict) -> None:
        """Auto-compute data_hash if empty."""
        if not self.data_hash:
            self.compute_hash()

    def to_core_fare(self) -> float:
        """Compute core fare = base_fare + tax_total."""
        return round(self.base_fare + self.tax_total, 2)


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
