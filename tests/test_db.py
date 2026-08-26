"""Tests for DuckDB storage layer."""

import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

from src.storage.db import DatabaseManager


@pytest.fixture
def db(tmp_path):
    db_path = tmp_path / "test_apix.duckdb"
    manager = DatabaseManager(db_path)
    yield manager
    manager.close()


class TestDatabaseManager:
    def test_init_creates_tables(self, db):
        tables = db.query(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'main' ORDER BY table_name"
        )
        table_names = [t["table_name"] for t in tables]
        assert "bronze_flight_raw" in table_names
        assert "silver_flight_clean" in table_names
        assert "gold_flight_index_ready" in table_names

    def test_insert_bronze_single(self, db):
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "record_id": str(uuid.uuid4()),
            "capture_timestamp": now,
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
            "data_hash": "abc123",
            "raw_payload": '{"test": true}',
        }
        inserted = db.insert_bronze([record])
        assert inserted == 1
        assert db.table_count("bronze_flight_raw") == 1

    def test_insert_bronze_multiple(self, db):
        now = datetime.now(timezone.utc).isoformat()
        records = []
        for i in range(5):
            records.append({
                "record_id": str(uuid.uuid4()),
                "capture_timestamp": now,
                "source": "Ixigo",
                "source_session_id": None,
                "route": "DEL-BOM",
                "origin": "DEL",
                "destination": "BOM",
                "flight_date": "2026-09-01",
                "advance_window": 7,
                "carrier_code": "6E",
                "carrier_name": "IndiGo",
                "flight_number": f"6E-{100 + i}",
                "fare_class": "ECONOMY",
                "base_fare": 5000.0 + i * 100,
                "tax_total": 750.0,
                "tax_breakdown_available": True,
                "total_fare": 5750.0 + i * 100,
                "currency": "INR",
                "departure_time": "08:30",
                "arrival_time": "10:45",
                "stops": 0,
                "duration_minutes": 135,
                "seat_remaining": 12,
                "is_refundable": True,
                "is_imputed": False,
                "data_hash": f"hash_{i}",
                "raw_payload": None,
            })
        inserted = db.insert_bronze(records)
        assert inserted == 5
        assert db.table_count("bronze_flight_raw") == 5

    def test_table_count_empty(self, db):
        assert db.table_count("bronze_flight_raw") == 0

    def test_query_returns_dicts(self, db):
        now = datetime.now(timezone.utc).isoformat()
        db.insert_bronze([{
            "record_id": str(uuid.uuid4()),
            "capture_timestamp": now,
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
            "data_hash": "abc123",
            "raw_payload": None,
        }])
        result = db.query("SELECT carrier_code, total_fare FROM bronze_flight_raw")
        assert len(result) == 1
        assert result[0]["carrier_code"] == "6E"
        assert result[0]["total_fare"] == 5750.0
