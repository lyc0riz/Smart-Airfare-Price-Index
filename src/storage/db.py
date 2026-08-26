"""DuckDB connection manager and DDL initialization.

Creates the three-layer medallion schema (Bronze, Silver, Gold)
and provides a connection manager for database operations.
"""

import logging
from pathlib import Path
from typing import Optional

import duckdb

logger = logging.getLogger(__name__)

# DDL statements for each medallion layer
BRONZE_DDL = """
CREATE TABLE IF NOT EXISTS bronze_flight_raw (
    record_id           UUID PRIMARY KEY,
    capture_timestamp   TIMESTAMP NOT NULL,
    source              VARCHAR NOT NULL,
    source_session_id   VARCHAR,
    route               VARCHAR NOT NULL,
    origin              VARCHAR(3) NOT NULL,
    destination         VARCHAR(3) NOT NULL,
    flight_date         DATE NOT NULL,
    advance_window      INTEGER NOT NULL,
    carrier_code        VARCHAR(2),
    carrier_name        VARCHAR(100) NOT NULL,
    flight_number       VARCHAR(20),
    fare_class          VARCHAR(30) NOT NULL DEFAULT 'ECONOMY',
    base_fare           DECIMAL(10,2) NOT NULL,
    tax_total           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_breakdown_available BOOLEAN NOT NULL DEFAULT FALSE,
    total_fare          DECIMAL(10,2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'INR',
    departure_time      TIME NOT NULL,
    arrival_time        TIME NOT NULL,
    stops               INTEGER NOT NULL DEFAULT 0,
    duration_minutes    INTEGER,
    seat_remaining      INTEGER,
    is_refundable       BOOLEAN NOT NULL DEFAULT FALSE,
    is_imputed          BOOLEAN NOT NULL DEFAULT FALSE,
    data_hash           VARCHAR(64) NOT NULL,
    raw_payload         JSON
);

CREATE INDEX IF NOT EXISTS idx_bronze_flight_date ON bronze_flight_raw(flight_date);
CREATE INDEX IF NOT EXISTS idx_bronze_route ON bronze_flight_raw(route);
CREATE INDEX IF NOT EXISTS idx_bronze_source ON bronze_flight_raw(source);
"""

SILVER_DDL = """
CREATE TABLE IF NOT EXISTS silver_flight_clean (
    record_id           UUID PRIMARY KEY,
    capture_timestamp   TIMESTAMP NOT NULL,
    source              VARCHAR NOT NULL,
    route               VARCHAR NOT NULL,
    origin              VARCHAR(3) NOT NULL,
    destination         VARCHAR(3) NOT NULL,
    flight_date         DATE NOT NULL,
    advance_window      INTEGER NOT NULL,
    carrier_code        VARCHAR(2),
    carrier_name        VARCHAR(100) NOT NULL,
    flight_number       VARCHAR(20),
    fare_class          VARCHAR(30) NOT NULL,
    base_fare           DECIMAL(10,2) NOT NULL,
    tax_total           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_breakdown_available BOOLEAN NOT NULL DEFAULT FALSE,
    total_fare          DECIMAL(10,2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'INR',
    departure_time      TIME NOT NULL,
    arrival_time        TIME NOT NULL,
    stops               INTEGER NOT NULL DEFAULT 0,
    duration_minutes    INTEGER,
    seat_remaining      INTEGER,
    is_refundable       BOOLEAN NOT NULL DEFAULT FALSE,
    is_imputed          BOOLEAN NOT NULL DEFAULT FALSE,
    data_hash           VARCHAR(64) NOT NULL,
    core_fare           DECIMAL(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_silver_flight_date ON silver_flight_clean(flight_date);
CREATE INDEX IF NOT EXISTS idx_silver_route ON silver_flight_clean(route);
CREATE INDEX IF NOT EXISTS idx_silver_source ON silver_flight_clean(source);
CREATE INDEX IF NOT EXISTS idx_silver_hash ON silver_flight_clean(data_hash);
"""

GOLD_DDL = """
CREATE TABLE IF NOT EXISTS gold_flight_index_ready (
    id                  UUID PRIMARY KEY,
    observation_date    DATE NOT NULL,
    flight_date         DATE NOT NULL,
    route               VARCHAR NOT NULL,
    origin              VARCHAR(3) NOT NULL,
    destination         VARCHAR(3) NOT NULL,
    advance_window      INTEGER NOT NULL,
    carrier_code        VARCHAR(2),
    carrier_name        VARCHAR(100) NOT NULL,
    flight_number       VARCHAR(20),
    total_fare          DECIMAL(10,2) NOT NULL,
    base_fare           DECIMAL(10,2) NOT NULL,
    tax_total           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_breakdown_available BOOLEAN NOT NULL DEFAULT FALSE,
    fare_class          VARCHAR(30) NOT NULL,
    source              VARCHAR NOT NULL,
    route_weight        DECIMAL(5,4),
    is_imputed          BOOLEAN NOT NULL DEFAULT FALSE,
    data_hash           VARCHAR(64) NOT NULL,
    UNIQUE(route, flight_date, carrier_code, flight_number, observation_date, source)
);

CREATE INDEX IF NOT EXISTS idx_gold_obs_date ON gold_flight_index_ready(observation_date);
CREATE INDEX IF NOT EXISTS idx_gold_flight_date ON gold_flight_index_ready(flight_date);
CREATE INDEX IF NOT EXISTS idx_gold_route ON gold_flight_index_ready(route);
CREATE INDEX IF NOT EXISTS idx_gold_advance ON gold_flight_index_ready(advance_window);
"""


class DatabaseManager:
    """DuckDB connection manager with medallion schema initialization.

    Usage:
        db = DatabaseManager()
        conn = db.connect()
        conn.execute("INSERT INTO bronze_flight_raw ...")
        db.close()
    """

    def __init__(
        self,
        db_path: Optional[Path] = None,
        initialize: bool = True,
    ) -> None:
        """Initialize database manager.

        Args:
            db_path: Path to DuckDB file. Defaults to {project_root}/data/apix.duckdb
            initialize: If True, create tables on connection.
        """
        if db_path is None:
            db_path = Path(__file__).resolve().parent.parent.parent / "data" / "apix.duckdb"

        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._connection: Optional[duckdb.DuckDBPyConnection] = None

        if initialize:
            conn = self.connect()
            self._initialize_schema(conn)
            logger.info(f"Database initialized: {self.db_path}")

    def connect(self) -> duckdb.DuckDBPyConnection:
        """Get or create a DuckDB connection.

        Returns:
            DuckDB connection instance.
        """
        if self._connection is None:
            self._connection = duckdb.connect(str(self.db_path))
        return self._connection

    def _initialize_schema(self, conn: duckdb.DuckDBPyConnection) -> None:
        """Create all medallion layer tables.

        Args:
            conn: Active DuckDB connection.
        """
        for name, ddl in [
            ("bronze", BRONZE_DDL),
            ("silver", SILVER_DDL),
            ("gold", GOLD_DDL),
        ]:
            try:
                conn.execute(ddl)
                logger.info(f"Created/verified {name} layer tables")
            except Exception as e:
                logger.error(f"Failed to create {name} layer: {e}")
                raise

    def insert_bronze(self, records: list[dict]) -> int:
        """Insert records into the Bronze layer.

        Args:
            records: List of record dicts matching bronze_flight_raw schema.

        Returns:
            Number of rows inserted.
        """
        conn = self.connect()
        if not records:
            return 0

        columns = [
            "record_id", "capture_timestamp", "source", "source_session_id",
            "route", "origin", "destination", "flight_date", "advance_window",
            "carrier_code", "carrier_name", "flight_number", "fare_class",
            "base_fare", "tax_total", "tax_breakdown_available", "total_fare",
            "currency", "departure_time", "arrival_time", "stops",
            "duration_minutes", "seat_remaining", "is_refundable", "is_imputed",
            "data_hash", "raw_payload",
        ]

        placeholders = ", ".join(["?" for _ in columns])
        col_names = ", ".join(columns)
        sql = f"INSERT INTO bronze_flight_raw ({col_names}) VALUES ({placeholders})"

        rows = []
        for r in records:
            row = tuple(r.get(c) for c in columns)
            rows.append(row)

        conn.executemany(sql, rows)
        logger.info(f"Inserted {len(rows)} records into Bronze layer")
        return len(rows)

    def insert_silver(self, records: list[dict]) -> int:
        """Insert records into the Silver layer (no raw_payload column).

        Args:
            records: List of record dicts matching silver_flight_clean schema.
                Must include 'core_fare' field (= base_fare + tax_total).

        Returns:
            Number of rows inserted.
        """
        conn = self.connect()
        if not records:
            return 0

        columns = [
            "record_id", "capture_timestamp", "source", "route",
            "origin", "destination", "flight_date", "advance_window",
            "carrier_code", "carrier_name", "flight_number", "fare_class",
            "base_fare", "tax_total", "tax_breakdown_available", "total_fare",
            "currency", "departure_time", "arrival_time", "stops",
            "duration_minutes", "seat_remaining", "is_refundable", "is_imputed",
            "data_hash", "core_fare",
        ]

        placeholders = ", ".join(["?" for _ in columns])
        col_names = ", ".join(columns)
        sql = f"INSERT INTO silver_flight_clean ({col_names}) VALUES ({placeholders})"

        rows = []
        for r in records:
            row = tuple(r.get(c) for c in columns)
            rows.append(row)

        conn.executemany(sql, rows)
        logger.info(f"Inserted {len(rows)} records into Silver layer")
        return len(rows)

    def query(self, sql: str) -> list[dict]:
        """Execute a query and return results as list of dicts.

        Args:
            sql: SQL query string.

        Returns:
            List of row dicts.
        """
        conn = self.connect()
        result = conn.execute(sql).fetchall()
        columns = [desc[0] for desc in conn.description] if conn.description else []
        return [dict(zip(columns, row)) for row in result]

    def table_count(self, table: str) -> int:
        """Get row count for a table.

        Args:
            table: Table name (e.g., 'bronze_flight_raw').

        Returns:
            Row count.
        """
        conn = self.connect()
        result = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
        return result[0] if result else 0

    def close(self) -> None:
        """Close the database connection."""
        if self._connection:
            self._connection.close()
            self._connection = None
            logger.info("Database connection closed")

    def __enter__(self) -> "DatabaseManager":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
