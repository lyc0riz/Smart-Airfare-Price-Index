"""Tests for Bronze → Silver normalization pipeline."""

import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

from src.storage.db import DatabaseManager
from src.cleaning.normalizer import BronzeToSilverNormalizer


@pytest.fixture
def db(tmp_path):
    db_path = tmp_path / "test_apix.duckdb"
    manager = DatabaseManager(db_path)
    yield manager
    manager.close()


def _make_bronze_record(**overrides) -> dict:
    defaults = {
        "record_id": str(uuid.uuid4()),
        "capture_timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "Ixigo",
        "source_session_id": None,
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
        "data_hash": "",
        "raw_payload": None,
    }
    defaults.update(overrides)
    return defaults


class TestBronzeToSilverNormalizer:
    def test_empty_bronze(self, db):
        normalizer = BronzeToSilverNormalizer(db)
        stats = normalizer.normalize()
        assert stats["bronze_read"] == 0
        assert stats["silver_inserted"] == 0

    def test_single_record_no_dedup(self, db):
        db.insert_bronze([_make_bronze_record()])
        normalizer = BronzeToSilverNormalizer(db)
        stats = normalizer.normalize()
        assert stats["bronze_read"] == 1
        assert stats["duplicates_dropped"] == 0
        assert stats["silver_inserted"] == 1
        assert stats["validation_failed"] == 0

    def test_duplicates_dropped(self, db):
        records = []
        for _ in range(3):
            r = _make_bronze_record(
                flight_number="6E-101",
                total_fare=5750.0,
                data_hash="",
            )
            records.append(r)
        db.insert_bronze(records)
        normalizer = BronzeToSilverNormalizer(db)
        stats = normalizer.normalize()
        assert stats["bronze_read"] == 3
        assert stats["duplicates_dropped"] == 2
        assert stats["silver_inserted"] == 1

    def test_different_flights_not_deduped(self, db):
        records = []
        for i in range(3):
            records.append(_make_bronze_record(
                flight_number=f"6E-{100 + i}",
                total_fare=5000.0 + i * 500,
                data_hash="",
            ))
        db.insert_bronze(records)
        normalizer = BronzeToSilverNormalizer(db)
        stats = normalizer.normalize()
        assert stats["bronze_read"] == 3
        assert stats["duplicates_dropped"] == 0
        assert stats["silver_inserted"] == 3

    def test_core_fare_computed(self, db):
        db.insert_bronze([_make_bronze_record(
            base_fare=6000.0, tax_total=900.0, total_fare=6900.0, data_hash="",
        )])
        normalizer = BronzeToSilverNormalizer(db)
        normalizer.normalize()
        result = db.query("SELECT core_fare FROM silver_flight_clean")
        assert len(result) == 1
        assert result[0]["core_fare"] == 6900.0

    def test_no_tax_breakdown(self, db):
        db.insert_bronze([_make_bronze_record(
            base_fare=8000.0, tax_total=0.0, tax_breakdown_available=False,
            total_fare=8000.0, data_hash="",
        )])
        normalizer = BronzeToSilverNormalizer(db)
        normalizer.normalize()
        result = db.query("SELECT core_fare, tax_breakdown_available FROM silver_flight_clean")
        assert result[0]["core_fare"] == 8000.0
        assert result[0]["tax_breakdown_available"] is False

    def test_hash_unique_constraint(self, db):
        records = []
        for i in range(5):
            records.append(_make_bronze_record(
                flight_number=f"6E-{100 + i}",
                total_fare=5000.0 + i * 100,
                data_hash="",
            ))
        db.insert_bronze(records)
        normalizer = BronzeToSilverNormalizer(db)
        normalizer.normalize()
        hashes = db.query("SELECT data_hash FROM silver_flight_clean")
        assert len(hashes) == 5
        assert len(set(h["data_hash"] for h in hashes)) == 5

    def test_idempotent_normalize(self, db):
        db.insert_bronze([_make_bronze_record(data_hash="")])
        normalizer = BronzeToSilverNormalizer(db)
        stats1 = normalizer.normalize()
        assert stats1["silver_inserted"] == 1

        stats2 = normalizer.normalize()
        assert stats2["silver_inserted"] == 0  # Already in Silver, skipped
        assert db.table_count("silver_flight_clean") == 1
