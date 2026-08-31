# Data Schema & Extraction Specification

Canonical reference for the APIx data pipeline. Defines the single source of truth for field names, types, extraction mappings, normalization rules, and the production Supabase (PostgreSQL) DDL.

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

## 2.3 Ixigo fareToken Structure (fully decoded — no base fare)

**Verified 2026-08-31** from 197 real `fareToken` strings captured across two routes (DEL-BOM, BLR-MAA).

The `fareToken` is a **dual-delimiter** encoded string:
- **Pipe (`|`)** separates semantic query/offer fields.
- **Tilde (`~`)** separates a trailing numeric cluster.

**Full structure:**

```
DEL|BOM|DDMMYY||1|0|0|e|INR|searchId$id|flightKeys|false|true|<tilde-cluster>
```

**Tilde cluster (positions documented against `displayFare`):**

| Position | Meaning | Verified |
|----------|---------|----------|
| 0 | Large 9-digit internal **offer ID** (~9.25M) | NOT a fare |
| 1 | **`displayFare`** — the TOTAL fare (base + taxes) | Matches `displayFare` on 195/197 tokens |
| 2 | Large 9-digit internal **offer ID** | NOT a fare |
| 3 | Large 9-digit internal **offer ID** | NOT a fare |
| 4 | **Session ID** (constant across the whole search) | Constant |
| 5 | UUID | — |

**Key facts:**
- Position 1 (`displayFare`) equals the total fare; the 2 mismatches are alternate fare buckets with
  `seatRemaining: 0`.
- Positions 0/2/3 are internal offer IDs (~9.25M), **not fares**.
- Position 4 is a session-wide constant.
- `fareDetails` contains only `displayFare`, `fareToken`, and rarely `slashedFare`.
- **There is NO base fare / tax component in the token.** Tax decomposition is not recoverable from Ixigo.

**Implication for the index:** The index uses **total fare**. `base_fare = total_fare`, and
`tax_udf`/`tax_asf`/`tax_gst`/`fees`/`taxes` remain `0.0` (see normalization rule N5/N11).

---

## 3. Normalization Rules

| Rule | Description |
|------|-------------|
| **N1** | All fares stored as `DECIMAL(10,2)` in INR. No rounding during storage. |
| **N2** | Flight numbers normalized to `XX-NNNN` format (e.g., `AI2977` → `AI-2977`). |
| **N3** | Times stored as local time (no timezone conversion). |
| **N4** | `seat_remaining` is not stored; Ixigo `seatRemaining == 0` maps to `is_sold_out = TRUE`. |
| **N5** | `base_fare = total_fare` and `taxes = 0` when source lacks tax breakdown. `core_fare` (generated) is therefore 0 until decomposition is available. |
| **N6** | Tax decomposition columns (`tax_udf`, `tax_asf`, `tax_gst`, `fees`) default to `0.00`. |
| **N7** | Google Flights `round trip total` fares are treated as one-way for index purposes (search URL specifies one-way). |
| **N8** | Missing optional fields (`duration_min`, `carrier_code`) stored as `NULL`. Google Flights gets a synthetic flight number (see N10). |
| **N9** | `data_hash` = SHA-256 of `{journey_date}:{origin}:{destination}:{carrier_code}:{flight_number}:{journey_class}:{total_fare}:{source_portal}`. |
| **N10** | Google Flights synthetic flight number: `GF-{carrier_code|NA}-{HH:MM dep}-{HH:MM arr}` (e.g., `GF-6E-08:30-10:45`). The DOM does not expose real flight numbers; the synthetic ID disambiguates quotes and prevents unique-constraint collisions on identical fares. |
| **N11** | The Ixigo `fareToken` contains NO base fare / tax component (verified 197 tokens, 2026-08-31 — see §2.3). Tax decomposition cannot be recovered from either source; the index uses **total fare**. |

---

## 4. Legacy DuckDB DDL (Removed)

The medallion (Bronze/Silver/Gold) DuckDB schema was removed in Phase 4S.
PostgreSQL on Supabase is the sole production storage layer — see
**Section 8** for the canonical DDL. Raw response JSON remains on local
disk under `data/raw/YYYY-MM-DD/` for auditable lineage.

---

## 5. Truth Triangle (Cross-Source Parity Validation)

Implemented in `src/validation/truth_triangle.py`. Cross-source matching
groups observations on the composite key:

`[journey_date, origin, destination, carrier_code, departure_time, arrival_time]`

> Note: `flight_number` is NOT part of the match key — Google Flights uses
> synthetic flight numbers (rule N10) that cannot be matched against Ixigo.

Parity metric compares `total_fare` between the primary source (Ixigo)
and secondary source (Google Flights):

- Sources agree within 1%: accept both records
- Disparity > 1%: flag in audit log, prefer primary source value
- Unknown-carrier Google Flights rows (`carrier_code IS NULL`) cannot be
  matched and are reported as unmatched

**Current status:** Implemented; parity runs post-ingestion each cycle.

---

## 6. Source Availability Matrix

| Field | Ixigo | Google Flights |
|-------|-------|----------------|
| `carrier_code` | `flightDetails[0].airlineCode` | `NULL` |
| `carrier_name` → `carrier` | `flightDetails[0].headerTextWeb` | `aria-label` regex |
| `flight_number` | `flightDetails[0].subHeaderTextWeb` (normalized) | Synthetic `GF-{code}-{dep}-{arr}` (rule N10) |
| `journey_class` | `fares[0].fareMetadata[0].cabinClass` | `"ECONOMY"` (default) |
| `base_fare` | `= total_fare` (no breakdown) | `= total_fare` (no breakdown) |
| `taxes` | `0.00` | `0.00` |
| `total_fare` | `fares[0].fareDetails.displayFare` | `aria-label` regex |
| `departure_time` | `flightDetails[0].departureTime` | `aria-label` regex |
| `arrival_time` | `flightDetails[0].arrivalTime` | `aria-label` regex |
| `stops` | `flightDetails[0].stop` | `aria-label` regex |
| `duration_min` | `flightDetails[0].duration.time` | `NULL` |
| `is_sold_out` | `seatRemaining == 0` | `FALSE` (sold-out flights not rendered) |

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

> **Note:** The legacy DuckDB DDL (former Section 4) has been removed. The Supabase schema below is the production storage layer. It is already deployed; migrations live in the Supabase migration history.

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
  cell_weight DECIMAL(10,4) GENERATED ALWAYS AS (route_weight * advance_window_weight) STORED,
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
-- Weekly APIx aggregation (normalized by total cell weight)
CREATE OR REPLACE VIEW view_apix_weekly AS
SELECT
  date_trunc('week', date) AS week_start,
  source_portal,
  SUM(index_value * cell_weight) / NULLIF(SUM(cell_weight), 0) AS apix_weekly,
  SUM(fare) AS total_fare,
  SUM(base_fare) AS total_base_fare,
  SUM(base_period_fare) AS total_base_period_fare
FROM airfare_price_index
GROUP BY date_trunc('week', date), source_portal;

-- Monthly APIx aggregation (normalized by total cell weight)
CREATE OR REPLACE VIEW view_apix_monthly AS
SELECT
  date_trunc('month', date) AS month_start,
  source_portal,
  SUM(index_value * cell_weight) / NULLIF(SUM(cell_weight), 0) AS apix_monthly,
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

### 8.8 Row-Level Security (RLS) Policies

Applied `2026-08-31` (migration `enable_rls_with_read_policies`).

**Why:** With RLS disabled, anyone possessing the Supabase **anon key** could read **and write**
every row. The anon key is publishable (safe to embed client-side), not a secret — so this was a
read/write exposure if the key leaked.

**Behavior after the change:**

| Table | `anon` role | `service_role` / pipeline / API |
|-------|-------------|--------------------------------|
| `flight_quotes` | SELECT only | Full access (bypasses RLS) |
| `route_weights` | SELECT only | Full access (bypasses RLS) |
| `advance_window_weights` | SELECT only | Full access (bypasses RLS) |
| `base_period_prices` | SELECT only | Full access (bypasses RLS) |
| `airfare_price_index` | SELECT only | Full access (bypasses RLS) |

Because the pipeline (asyncpg) and API (Supabase PostgREST) both authenticate with the
**service_role** key, which bypasses RLS entirely, enabling RLS has **no impact** on them.
The only behavioral change is that anon-key **writes** are now blocked.

```sql
-- 5 tables
ALTER TABLE public.flight_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_window_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base_period_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airfare_price_index ENABLE ROW LEVEL SECURITY;

-- anon read-only policies (one per table)
CREATE POLICY "Allow anon read access"
  ON public.flight_quotes FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access"
  ON public.route_weights FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access"
  ON public.advance_window_weights FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access"
  ON public.base_period_prices FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access"
  ON public.airfare_price_index FOR SELECT TO anon USING (true);
```

> **Note:** The three views (`view_apix_weekly`, `view_apix_monthly`,
> `view_route_leadtime_elasticity`) are defined with the `SECURITY DEFINER` property (pre-existing).
> This makes them run with the owner's privileges rather than the querying user's — independent of
> RLS on the base tables, and not affected by this change.

