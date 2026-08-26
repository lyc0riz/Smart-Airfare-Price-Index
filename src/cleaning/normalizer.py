"""Bronze → Silver cleaning pipeline.

Reads raw FlightData records from Bronze DuckDB, deduplicates by
data_hash, validates via Pydantic, computes core_fare, and writes
cleaned records to Silver layer.
"""

import logging
from datetime import datetime
from typing import Any, Optional

from src.cleaning.schemas import FlightRecord, SourceEnum, FareClassEnum
from src.storage.db import DatabaseManager

logger = logging.getLogger(__name__)


class BronzeToSilverNormalizer:
    """Pipeline to clean Bronze records into Silver layer.

    Steps:
    1. Read all Bronze records
    2. Deduplicate by data_hash (keep first occurrence)
    3. Validate each record via Pydantic FlightRecord
    4. Compute core_fare = base_fare + tax_total
    5. Insert valid records into Silver
    """

    def __init__(self, db: Optional[DatabaseManager] = None) -> None:
        """Initialize normalizer.

        Args:
            db: Database manager. Creates default if None.
        """
        self.db = db or DatabaseManager()
        self._stats = {
            "bronze_read": 0,
            "duplicates_dropped": 0,
            "validation_failed": 0,
            "silver_inserted": 0,
        }

    def normalize(self) -> dict[str, Any]:
        """Run the full Bronze → Silver normalization pipeline.

        Returns:
            Statistics dict with counts for each step.
        """
        self._stats = {
            "bronze_read": 0,
            "duplicates_dropped": 0,
            "validation_failed": 0,
            "silver_inserted": 0,
        }

        # Step 1: Read all Bronze records
        logger.info("Reading Bronze records...")
        bronze_records = self.db.query(
            "SELECT * FROM bronze_flight_raw ORDER BY capture_timestamp"
        )
        self._stats["bronze_read"] = len(bronze_records)
        logger.info(f"Read {len(bronze_records)} Bronze records")

        if not bronze_records:
            logger.info("No Bronze records to normalize")
            return self._stats

        # Step 2: Compute empty hashes, then deduplicate
        for record in bronze_records:
            if not record.get("data_hash"):
                record["data_hash"] = self._compute_hash(record)

        # Check which hashes already exist in Silver to avoid re-inserting
        existing = self.db.query("SELECT data_hash FROM silver_flight_clean")
        existing_hashes: set[str] = {r["data_hash"] for r in existing}

        seen_hashes: set[str] = set()
        unique_records: list[dict] = []
        for record in bronze_records:
            h = record.get("data_hash", "")
            if h in seen_hashes or h in existing_hashes:
                self._stats["duplicates_dropped"] += 1
                continue
            seen_hashes.add(h)
            unique_records.append(record)

        logger.info(
            f"Dedup: {len(bronze_records)} → {len(unique_records)} unique "
            f"({self._stats['duplicates_dropped']} duplicates dropped)"
        )

        # Step 3 & 4: Validate and compute core_fare
        silver_records: list[dict] = []
        for record in unique_records:
            try:
                validated = self._validate_record(record)
                if validated:
                    silver_records.append(validated)
            except Exception as e:
                self._stats["validation_failed"] += 1
                logger.debug(
                    f"Validation failed for {record.get('data_hash', '?')[:16]}: {e}"
                )

        logger.info(
            f"Validation: {len(silver_records)} passed, "
            f"{self._stats['validation_failed']} failed"
        )

        # Step 5: Insert into Silver
        if silver_records:
            inserted = self.db.insert_silver(silver_records)
            self._stats["silver_inserted"] = inserted
            logger.info(f"Inserted {inserted} records into Silver layer")

        logger.info(f"Normalization complete: {self._stats}")
        return self._stats

    def _validate_record(self, record: dict) -> Optional[dict]:
        """Validate a Bronze record and convert to Silver format.

        Args:
            record: Raw Bronze record dict.

        Returns:
            Cleaned dict ready for Silver insertion, or None if invalid.
        """
        # Map source string to enum
        source_str = record.get("source", "")
        try:
            source_enum = SourceEnum(source_str)
        except ValueError:
            logger.debug(f"Unknown source: {source_str}")
            return None

        # Map fare class string to enum
        fare_class_str = record.get("fare_class", "ECONOMY")
        try:
            fare_class_enum = FareClassEnum(fare_class_str)
        except ValueError:
            fare_class_enum = FareClassEnum.ECONOMY

        # Parse flight_date string to date object
        flight_date_str = record.get("flight_date", "")
        if isinstance(flight_date_str, str):
            try:
                flight_date = datetime.strptime(flight_date_str, "%Y-%m-%d").date()
            except ValueError:
                logger.debug(f"Invalid flight_date: {flight_date_str}")
                return None
        else:
            flight_date = flight_date_str

        # Parse capture_timestamp
        capture_ts = record.get("capture_timestamp", "")
        if isinstance(capture_ts, str):
            try:
                capture_timestamp = datetime.fromisoformat(capture_ts)
            except ValueError:
                capture_timestamp = datetime.utcnow()
        else:
            capture_timestamp = capture_ts

        # Parse departure_time and arrival_time
        dep_time = record.get("departure_time", "00:00")
        arr_time = record.get("arrival_time", "00:00")
        if isinstance(dep_time, str):
            dep_time = self._parse_time(dep_time)
        if isinstance(arr_time, str):
            arr_time = self._parse_time(arr_time)

        # Validate via Pydantic
        try:
            flight = FlightRecord(
                source=source_enum,
                source_session_id=record.get("source_session_id"),
                route=record.get("route", ""),
                origin=record.get("origin", ""),
                destination=record.get("destination", ""),
                flight_date=flight_date,
                advance_window=record.get("advance_window", 0),
                carrier_code=record.get("carrier_code"),
                carrier_name=record.get("carrier_name", ""),
                flight_number=record.get("flight_number"),
                fare_class=fare_class_enum,
                base_fare=float(record.get("base_fare", 0)),
                tax_total=float(record.get("tax_total", 0)),
                tax_breakdown_available=bool(record.get("tax_breakdown_available", False)),
                total_fare=float(record.get("total_fare", 0)),
                currency=record.get("currency", "INR"),
                departure_time=dep_time,
                arrival_time=arr_time,
                stops=int(record.get("stops", 0)),
                duration_minutes=record.get("duration_minutes"),
                seat_remaining=record.get("seat_remaining"),
                is_refundable=bool(record.get("is_refundable", False)),
                is_imputed=bool(record.get("is_imputed", False)),
                data_hash=record.get("data_hash", ""),
            )
        except Exception as e:
            logger.debug(f"Pydantic validation error: {e}")
            return None

        # Build Silver record dict
        core_fare = round(flight.base_fare + flight.tax_total, 2)

        return {
            "record_id": flight.record_id,
            "capture_timestamp": capture_timestamp,
            "source": flight.source.value,
            "route": flight.route,
            "origin": flight.origin,
            "destination": flight.destination,
            "flight_date": flight_date,
            "advance_window": flight.advance_window,
            "carrier_code": flight.carrier_code,
            "carrier_name": flight.carrier_name,
            "flight_number": flight.flight_number,
            "fare_class": flight.fare_class.value,
            "base_fare": flight.base_fare,
            "tax_total": flight.tax_total,
            "tax_breakdown_available": flight.tax_breakdown_available,
            "total_fare": flight.total_fare,
            "currency": flight.currency,
            "departure_time": dep_time,
            "arrival_time": arr_time,
            "stops": flight.stops,
            "duration_minutes": flight.duration_minutes,
            "seat_remaining": flight.seat_remaining,
            "is_refundable": flight.is_refundable,
            "is_imputed": flight.is_imputed,
            "data_hash": flight.data_hash,
            "core_fare": core_fare,
        }

    def _parse_time(self, time_str: str):
        """Parse time string to time object.

        Args:
            time_str: Time string in HH:MM or HH:MM:SS format.

        Returns:
            time object.
        """
        from datetime import time as dt_time

        try:
            parts = time_str.split(":")
            h, m = int(parts[0]), int(parts[1])
            s = int(parts[2]) if len(parts) > 2 else 0
            return dt_time(h, m, s)
        except (ValueError, IndexError):
            return dt_time(0, 0)

    @property
    def stats(self) -> dict[str, Any]:
        """Get normalization statistics."""
        return self._stats.copy()

    def _compute_hash(self, record: dict) -> str:
        """Compute SHA-256 hash from record fields.

        Args:
            record: Bronze record dict.

        Returns:
            SHA-256 hex digest string.
        """
        from src.cleaning.schemas import compute_data_hash
        return compute_data_hash(
            route=record.get("route", ""),
            carrier_code=record.get("carrier_code"),
            flight_number=record.get("flight_number"),
            flight_date=record.get("flight_date", ""),
            total_fare=float(record.get("total_fare", 0)),
            source=record.get("source", ""),
        )
