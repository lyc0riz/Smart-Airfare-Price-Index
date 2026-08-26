# Data Schema & Extraction Specification

Canonical reference for the APIx data pipeline. Defines the single source of truth for field names, types, extraction mappings, normalization rules, and DDL for all three medallion layers (Bronze → Silver → Gold).

---

## 1. Canonical Record Fields

| # | Field Name | Type | Nullable | Description |
|---|-----------|------|----------|-------------|
| 1 | `record_id` | UUID | No | Unique identifier for each record |
| 2 | `capture_timestamp` | TIMESTAMP_UTC | No | ISO-8601 UTC timestamp when record was captured |
| 3 | `source` | ENUM | No | Data source portal (`Ixigo`, `Google Flights`) |
| 4 | `source_session_id` | STRING | Yes | Portal session identifier (for audit trail) |
| 5 | `route` | STRING | No | Composite key `ORIGIN-DEST` (e.g., `DEL-BOM`) |
| 6 | `origin` | STRING | No | IATA 3-letter origin code |
| 7 | `destination` | STRING | No | IATA 3-letter destination code |
| 8 | `flight_date` | DATE | No | Scheduled departure date `YYYY-MM-DD` |
| 9 | `advance_window` | INT | No | Days between capture and departure |
| 10 | `carrier_code` | STRING | No | IATA 2-letter airline code (e.g., `6E`, `AI`) |
| 11 | `carrier_name` | STRING | No | Airline display name (e.g., `IndiGo`) |
| 12 | `flight_number` | STRING | No | Normalized flight number (e.g., `6E-2054`) |
| 13 | `fare_class` | STRING | No | Cabin class (`ECONOMY`, `PREMIUM_ECONOMY`, `BUSINESS`, `FIRST`) |
| 14 | `base_fare` | DECIMAL(10,2) | No | Base fare in INR (excl. taxes). Set = `total_fare` when breakdown unavailable |
| 15 | `tax_total` | DECIMAL(10,2) | No | Total taxes + fees in INR. Set `0.00` when breakdown unavailable |
| 16 | `tax_breakdown_available` | BOOLEAN | No | `TRUE` if source provides tax decomposition |
| 17 | `total_fare` | DECIMAL(10,2) | No | Final payable fare in INR (base + all taxes) |
| 18 | `currency` | STRING | No | ISO-4217 currency code (always `INR`) |
| 19 | `departure_time` | TIME | No | Scheduled local departure time `HH:MM` |
| 20 | `arrival_time` | TIME | No | Scheduled local arrival time `HH:MM` |
| 21 | `stops` | INT | No | Number of stops (0 = nonstop) |
| 22 | `duration_minutes` | INT | Yes | Total travel duration in minutes |
| 23 | `seat_remaining` | INT | Yes | Seats left in fare bucket (`NULL` if unknown) |
| 24 | `is_refundable` | BOOLEAN | No | Whether ticket is refundable |
| 25 | `is_imputed` | BOOLEAN | No | `TRUE` if value was imputed (not observed) |
| 26 | `data_hash` | STRING | No | SHA-256 of `(route, carrier_code, flight_number, flight_date, total_fare, source)` |

### Derived / Computed Fields (Silver/Gold layer only)

| Field | Formula | Description |
|-------|---------|-------------|
| `core_fare` | `base_fare + tax_total` | Cross-source parity check field |
| `fare_per_km` | `total_fare / route_distance_km` | Normalized fare for cross-route comparison |
| `price_index_weight` | From `routes_weights.json` | DGCA traffic volume weight for index computation |

---

## 2. Source Extraction Mappings

### 2.1 Ixigo (SSE API)

**Endpoint:** `GET /flights/v2/search/stream`

| Schema Field | Ixigo Path | Transform |
|-------------|-----------|-----------|
| `source` | — | Hardcoded `"Ixigo"` |
| `route` | — | Derived from `origin` + `destination` params |
| `origin` | `search params.origin` | Passthrough |
| `destination` | `search params.destination` | Passthrough |
| `flight_date` | `flightKeys` | Parse `"DEL-BOM-AI2977-01092026"` → extract date `01092026` → `2026-09-01` |
| `advance_window` | — | From query matrix |
| `carrier_code` | `flightDetails[0].airlineCode` | Passthrough (e.g., `"AI"`) |
| `carrier_name` | `flightDetails[0].headerTextWeb` | Passthrough (e.g., `"Air India"`) |
| `flight_number` | `flightDetails[0].subHeaderTextWeb` | Normalize: `"AI2977"` → `"AI-2977"` |
| `fare_class` | `fares[0].fareMetadata[0].cabinClass` | Map: `"ECONOMY"` → `"ECONOMY"` |
| `base_fare` | `fares[0].fareDetails.displayFare` | Set = `total_fare` (no breakdown) |
| `tax_total` | — | Hardcoded `0.00` |
| `tax_breakdown_available` | — | Hardcoded `FALSE` |
| `total_fare` | `fares[0].fareDetails.displayFare` | Direct (integer → decimal) |
| `currency` | — | Hardcoded `"INR"` |
| `departure_time` | `flightDetails[0].departureTime` | `"19:00"` → `"19:00"` |
| `arrival_time` | `flightDetails[0].arrivalTime` | `"21:25"` → `"21:25"` |
| `stops` | `flightDetails[0].stop` | Direct (integer) |
| `duration_minutes` | `flightDetails[0].duration.time` | Direct (already in minutes) |
| `seat_remaining` | `fares[0].fareMetadata[0].seatRemaining` | Direct (`0` likely = undisclosed, treat as `NULL`) |
| `is_refundable` | `refundableType` | `"REFUNDABLE"` → `TRUE`, else `FALSE` |
| `is_imputed` | — | Hardcoded `FALSE` |
| `data_hash` | — | SHA-256 of composite key fields |

**Ixigo SSE structure (confirmed):**
```
data.flightJourneys[].flightFare[]  ← one entry per flight option
  ├── flightKeys: "DEL-BOM-AI2977-01092026"
  ├── refundableType: "PARTIALLY_REFUNDABLE"
  ├── fares[0]
  │   ├── fareDetails.displayFare: 7000       ← TOTAL fare (no tax breakdown)
  │   └── fareMetadata[0]
  │       ├── seatRemaining: 0
  │       ├── cabinClass: "ECONOMY"
  │       └── fareBasisCode: {"AI2977": "SU1YXR2I"}
  ├── flightDetails[0]
  │   ├── airlineCode: "AI"
  │   ├── headerTextWeb: "Air India"
  │   ├── subHeaderTextWeb: "AI2977"
  │   ├── departureTime: "19:00"
  │   ├── arrivalTime: "21:25"
  │   ├── stop: 0
  │   └── duration: {"text": "2h 25m", "time": 145}
  └── flightFilter[0]
      ├── stops: 0
      └── airline: ["AI"]
```

### 2.2 Google Flights (DOM Scraping)

**Method:** Playwright renders page, extract from `div.JMc5Xc[aria-label]`

| Schema Field | Google Flights Source | Transform |
|-------------|----------------------|-----------|
| `source` | — | Hardcoded `"Google Flights"` |
| `route` | — | Derived from search URL params |
| `origin` | Search URL | `"DEL"` from query |
| `destination` | Search URL | `"BOM"` from query |
| `flight_date` | Search URL | Date from query (all flights same date) |
| `advance_window` | — | From query matrix |
| `carrier_code` | — | `NULL` (not in DOM) |
| `carrier_name` | `aria-label` regex | Extract: `"flight with {airline}"` |
| `flight_number` | — | `NULL` (not in DOM) |
| `fare_class` | — | Defaults to `"ECONOMY"` (only economy shown) |
| `base_fare` | `aria-label` regex | Set = `total_fare` (no breakdown) |
| `tax_total` | — | Hardcoded `0.00` |
| `tax_breakdown_available` | — | Hardcoded `FALSE` |
| `total_fare` | `aria-label` regex | `"From {price} Indian rupees"` → extract integer |
| `currency` | — | Hardcoded `"INR"` |
| `departure_time` | `aria-label` regex | `"at {time} on"` → extract time |
| `arrival_time` | `aria-label` regex | `"at {time} on"` → extract time (second occurrence) |
| `stops` | `aria-label` regex | `"{N} stop"` or `"Nonstop"` → integer |
| `duration_minutes` | — | `NULL` (not in aria-label) |
| `seat_remaining` | — | `NULL` (not in DOM) |
| `is_refundable` | — | `FALSE` (not shown) |
| `is_imputed` | — | Hardcoded `FALSE` |
| `data_hash` | — | SHA-256 of composite key fields |

**Google Flights aria-label pattern:**
```
"From {price} Indian rupees round trip total. {stops_text} flight with {airline}. 
 Leaves {dep_airport} at {dep_time} on {dep_date} and arrives at {arr_airport} 
 at {arr_time} on {arr_date}."
```

**Regex:**
```python
r'From (\d+) Indian rupees round trip total\. (.+?) flight with (.+?)\. 
  Leaves (.+?) at (\d{1,2}:\d{2}\s*[AP]M) on (.+?) and arrives(?: at (.+?))? 
  at (\d{1,2}:\d{2}\s*[AP]M) on (.+?)\.?$'
```

---

## 3. Normalization Rules

| Rule | Description |
|------|-------------|
| **N1** | All fares stored as `DECIMAL(10,2)` in INR. No rounding during storage. |
| **N2** | Flight numbers normalized to `XX-NNNN` format (e.g., `AI2977` → `AI-2977`). |
| **N3** | Times stored as local time (no timezone conversion). |
| **N4** | `seat_remaining = 0` from Ixigo treated as `NULL` (undisclosed, not sold out). |
| **N5** | `base_fare = total_fare` and `tax_total = 0` when source lacks tax breakdown. |
| **N6** | `tax_breakdown_available` flag explicitly set to `FALSE` for Ixigo and Google Flights. |
| **N7** | Google Flights `round trip total` fares are treated as one-way for index purposes (search URL specifies one-way). |
| **N8** | Missing optional fields (`duration_minutes`, `seat_remaining`, `carrier_code`, `flight_number`) stored as `NULL`. |
| **N9** | `data_hash` = SHA-256(f"{route}:{carrier_code}:{flight_number}:{flight_date}:{total_fare}:{source}"). |

---

## 4. Medallion DDL (DuckDB)

### 4.1 Bronze Layer (Raw Extracts)

```sql
CREATE TABLE IF NOT EXISTS bronze_flight_raw (
    record_id           UUID PRIMARY KEY,
    capture_timestamp   TIMESTAMP NOT NULL,
    source              VARCHAR NOT NULL,          -- 'Ixigo', 'Google Flights'
    source_session_id   VARCHAR,
    route               VARCHAR NOT NULL,          -- 'DEL-BOM'
    origin              VARCHAR(3) NOT NULL,
    destination         VARCHAR(3) NOT NULL,
    flight_date         DATE NOT NULL,
    advance_window      INTEGER NOT NULL,
    carrier_code        VARCHAR(2),                -- NULL for Google Flights
    carrier_name        VARCHAR(100) NOT NULL,
    flight_number       VARCHAR(20),               -- NULL for Google Flights
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
    raw_payload         JSON                       -- Full source response for audit
);

-- Partition index for efficient date-range queries
CREATE INDEX idx_bronze_flight_date ON bronze_flight_raw(flight_date);
CREATE INDEX idx_bronze_route ON bronze_flight_raw(route);
CREATE INDEX idx_bronze_source ON bronze_flight_raw(source);
```

### 4.2 Silver Layer (Cleaned & Deduplicated)

```sql
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
    core_fare           DECIMAL(10,2) GENERATED ALWAYS AS (base_fare + tax_total) STORED
);

CREATE INDEX idx_silver_flight_date ON silver_flight_clean(flight_date);
CREATE INDEX idx_silver_route ON silver_flight_clean(route);
CREATE INDEX idx_silver_source ON silver_flight_clean(source);
CREATE INDEX idx_silver_hash ON silver_flight_clean(data_hash);
```

### 4.3 Gold Layer (Index-Ready Aggregates)

```sql
CREATE TABLE IF NOT EXISTS gold_flight_index_ready (
    id                  UUID PRIMARY KEY,
    observation_date    DATE NOT NULL,             -- Date of capture
    flight_date         DATE NOT NULL,             -- Date of travel
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
    route_weight        DECIMAL(5,4),              -- From routes_weights.json
    is_imputed          BOOLEAN NOT NULL DEFAULT FALSE,
    data_hash           VARCHAR(64) NOT NULL,
    UNIQUE(route, flight_date, carrier_code, flight_number, observation_date, source)
);

CREATE INDEX idx_gold_obs_date ON gold_flight_index_ready(observation_date);
CREATE INDEX idx_gold_flight_date ON gold_flight_index_ready(flight_date);
CREATE INDEX idx_gold_route ON gold_flight_index_ready(route);
CREATE INDEX idx_gold_advance ON gold_flight_index_ready(advance_window);
```

---

## 5. Truth Triangle (Future Multi-Source Validation)

When a second source is added, group observations by composite key:
`[flight_date, route, flight_number]`

```
Core Fare = base_fare + tax_total
```

- If sources agree within 1%: accept both records
- If sources disagree > 1%: flag in audit log, prefer primary source
- Tie-breaker: If available, cross-reference against airline direct API

**Current status:** Single source (Ixigo primary, Google Flights secondary). Truth Triangle deferred until cross-source matching is implemented.

---

## 6. Source Availability Matrix

| Field | Ixigo | Google Flights |
|-------|-------|----------------|
| `carrier_code` | `flightDetails[0].airlineCode` | `NULL` |
| `carrier_name` | `flightDetails[0].headerTextWeb` | `aria-label` regex |
| `flight_number` | `flightDetails[0].subHeaderTextWeb` | `NULL` |
| `fare_class` | `fares[0].fareMetadata[0].cabinClass` | `"ECONOMY"` (default) |
| `base_fare` | `= total_fare` (no breakdown) | `= total_fare` (no breakdown) |
| `tax_total` | `0.00` | `0.00` |
| `tax_breakdown_available` | `FALSE` | `FALSE` |
| `total_fare` | `fares[0].fareDetails.displayFare` | `aria-label` regex |
| `departure_time` | `flightDetails[0].departureTime` | `aria-label` regex |
| `arrival_time` | `flightDetails[0].arrivalTime` | `aria-label` regex |
| `stops` | `flightDetails[0].stop` | `aria-label` regex |
| `duration_minutes` | `flightDetails[0].duration.time` | `NULL` |
| `seat_remaining` | `fares[0].fareMetadata[0].seatRemaining` | `NULL` |
| `is_refundable` | `refundableType` field | `NULL` |

---

## 7. Agent Checklist

- [ ] All records have `record_id` (UUID) and `capture_timestamp` (ISO-8601 UTC)
- [ ] `source` is one of: `Ixigo`, `Google Flights`
- [ ] `route` matches `ORIGIN-DEST` pattern (3-letter IATA codes)
- [ ] `flight_date` is valid `YYYY-MM-DD`
- [ ] `carrier_code` is 2-letter IATA code or `NULL`
- [ ] `flight_number` follows `XX-NNNN` format or is `NULL`
- [ ] `total_fare > 0` for all non-imputed records
- [ ] `base_fare + tax_total = total_fare` (within rounding tolerance)
- [ ] `tax_breakdown_available = FALSE` when `tax_total = 0.00`
- [ ] `seat_remaining IS NULL` when value is `0` (Ixigo undisclosed)
- [ ] `data_hash` matches computed SHA-256 of composite key
- [ ] `is_imputed = FALSE` for directly observed records

---

## 8. Supabase DDL (PostgreSQL)

> **Note:** Section 4 contains legacy DuckDB DDL. The Supabase schema below is the production storage layer. Run this DDL in Supabase SQL Editor.

### 8.1 Flight Quotes (main data table)

```sql
CREATE TABLE IF NOT EXISTS flight_quotes (
  quote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_portal VARCHAR(20) NOT NULL,
  scraping_date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  journey_date DATE NOT NULL,
  origin VARCHAR(3) NOT NULL,
  destination VARCHAR(3) NOT NULL,
  advance_windows INT NOT NULL,
  booking_date DATE GENERATED ALWAYS AS (scraping_date_time::date) STORED,
  carrier_code VARCHAR(10),
  carrier VARCHAR(50) NOT NULL,
  flight_number VARCHAR(50),
  journey_class VARCHAR(20) NOT NULL,
  fare DECIMAL(10,2) NOT NULL,
  base_fare DECIMAL(10,2) NOT NULL,
  fees DECIMAL(10,2) DEFAULT 0.00,
  tax_udf DECIMAL(10,2) DEFAULT 0.00,
  tax_asf DECIMAL(10,2) DEFAULT 0.00,
  tax_gst DECIMAL(10,2) DEFAULT 0.00,
  taxes DECIMAL(10,2) DEFAULT 0.00,
  total_fare DECIMAL(10,2) NOT NULL,
  departure TIMESTAMPTZ NOT NULL,
  arrival TIMESTAMPTZ NOT NULL,
  duration_min INT,
  stops INT NOT NULL,
  is_sold_out BOOLEAN DEFAULT FALSE,
  is_imputed BOOLEAN DEFAULT FALSE,
  data_hash VARCHAR(64) NOT NULL,
  route VARCHAR(10) GENERATED ALWAYS AS (origin || '-' || destination) STORED,
  core_fare DECIMAL(10,2) GENERATED ALWAYS AS (total_fare - base_fare - fees) STORED,
  CONSTRAINT unique_flight_quote UNIQUE (
    journey_date, origin, destination, carrier_code, flight_number,
    journey_class, total_fare, source_portal, advance_windows, is_sold_out
  )
);

CREATE INDEX idx_flight_quotes_journey_date ON flight_quotes(journey_date);
CREATE INDEX idx_flight_quotes_route ON flight_quotes(route);
CREATE INDEX idx_flight_quotes_source ON flight_quotes(source_portal);
CREATE INDEX idx_flight_quotes_data_hash ON flight_quotes(data_hash);
```

### 8.2 Route Weights (DGCA traffic volume)

```sql
CREATE TABLE IF NOT EXISTS route_weights (
  origin VARCHAR(3) NOT NULL,
  destination VARCHAR(3) NOT NULL,
  route VARCHAR(10) GENERATED ALWAYS AS (origin || '-' || destination) STORED,
  weight DECIMAL(5,4) NOT NULL,
  PRIMARY KEY (origin, destination)
);
```

### 8.3 Advance Window Weights

```sql
CREATE TABLE IF NOT EXISTS advance_window_weights (
  source_portal VARCHAR(20) NOT NULL,
  advance_window INT NOT NULL,
  weight DECIMAL(5,4) NOT NULL,
  PRIMARY KEY (source_portal, advance_window)
);
```

### 8.4 Base Period Prices

```sql
CREATE TABLE IF NOT EXISTS base_period_prices (
  source_portal VARCHAR(20) NOT NULL,
  base_period_date DATE NOT NULL,
  journey_date DATE NOT NULL,
  origin VARCHAR(3) NOT NULL,
  destination VARCHAR(3) NOT NULL,
  advance_windows INT NOT NULL,
  base_period_fare DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (source_portal, journey_date, origin, destination, advance_windows)
);
```

### 8.5 Airfare Price Index (daily computed)

```sql
CREATE TABLE IF NOT EXISTS airfare_price_index (
  date DATE NOT NULL,
  journey_date DATE NOT NULL,
  origin VARCHAR(3) NOT NULL,
  destination VARCHAR(3) NOT NULL,
  route VARCHAR(10) GENERATED ALWAYS AS (origin || '-' || destination) STORED,
  advance_windows INT NOT NULL,
  source_portal VARCHAR(20) NOT NULL,
  index_value DECIMAL(10,2) NOT NULL,
  route_weight DECIMAL(5,4) NOT NULL,
  advance_window_weight DECIMAL(5,4) NOT NULL,
  fare DECIMAL(10,2) NOT NULL,
  base_fare DECIMAL(10,2) NOT NULL,
  base_period_fare DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (date, origin, destination, advance_windows, source_portal)
);

CREATE INDEX idx_airfare_index_date ON airfare_price_index(date);
CREATE INDEX idx_airfare_index_route ON airfare_price_index(route);
```

### 8.6 Views

```sql
-- Weekly APIx aggregation
CREATE OR REPLACE VIEW view_apix_weekly AS
SELECT
  date_trunc('week', date) AS week_start,
  source_portal,
  SUM(route_weight * advance_window_weight * index_value) AS apix_weekly,
  SUM(fare) AS total_fare,
  SUM(base_fare) AS total_base_fare,
  SUM(base_period_fare) AS total_base_period_fare
FROM airfare_price_index
GROUP BY date_trunc('week', date), source_portal;

-- Monthly APIx aggregation
CREATE OR REPLACE VIEW view_apix_monthly AS
SELECT
  date_trunc('month', date) AS month_start,
  source_portal,
  SUM(route_weight * advance_window_weight * index_value) AS apix_monthly,
  SUM(fare) AS total_fare,
  SUM(base_fare) AS total_base_fare,
  SUM(base_period_fare) AS total_base_period_fare
FROM airfare_price_index
GROUP BY date_trunc('month', date), source_portal;

-- Route-level lead-time elasticity
CREATE OR REPLACE VIEW view_route_leadtime_elasticity AS
SELECT
  a.origin,
  a.destination,
  a.advance_windows,
  a.date,
  a.index_value AS current_index,
  b.index_value AS previous_index,
  CASE
    WHEN b.index_value > 0 THEN ((a.index_value - b.index_value) / b.index_value) * 100
    ELSE NULL
  END AS percentage_change
FROM airfare_price_index a
LEFT JOIN airfare_price_index b
  ON a.origin = b.origin
  AND a.destination = b.destination
  AND a.advance_windows = b.advance_windows
  AND a.source_portal = b.source_portal
  AND b.date = a.date - INTERVAL '1 day'
ORDER BY a.origin, a.destination, a.advance_windows, a.date;
```

### 8.7 Supabase Field Mapping (Current → New)

| Current Field | New Column | Notes |
|---------------|-----------|-------|
| `record_id` | `quote_id` | UUID, PK |
| `capture_timestamp` | `scraping_date_time` | `TIMESTAMPTZ` |
| — | `booking_date` | Generated: `scraping_date_time::date` |
| `source` | `source_portal` | VARCHAR(20) |
| `tax_total` | `taxes` | DECIMAL(10,2) |
| `departure_time` | `departure` | TIMESTAMPTZ |
| `arrival_time` | `arrival` | TIMESTAMPTZ |
| `duration_minutes` | `duration_min` | INTEGER |
| `seat_remaining` | `is_sold_out` | BOOLEAN: `seat_remaining == 0` → True |
| `fare_class` | `cabin_class` | VARCHAR(30) |
| `carrier_name` | `carrier` | VARCHAR(50) |
| `advance_window` | `advance_windows` | INTEGER (plural) |
| — | `tax_udf` | NEW: `0.0` default |
| — | `tax_asf` | NEW: `0.0` default |
| — | `tax_gst` | NEW: `0.0` default |
| — | `fees` | NEW: `0.0` default |
| — | `route` | Generated: `origin \|\| '-' \|\| destination` |
| — | `core_fare` | Generated: `total_fare - base_fare - fees` |

**Generated columns** (don't send from Python): `route`, `core_fare`, `booking_date`

**Dropped from schema:** `source_session_id`, `is_refundable`, `raw_payload`
