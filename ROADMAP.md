# ROADMAP.md: Real-Time Airfare Price Index (APIx) System

An automated, scalable, and ethically compliant data pipeline and index construction platform designed for the National Statistical Office (NSO) and Reserve Bank of India (RBI) to augment the Consumer Price Index (CPI).

---

## Tech Stack Overview

- **Core Runtime & Logic:** Python 3.11+, `pydantic` (v2), `asyncio`
- **Token Harvesting & Headless Automation:** `playwright`, `playwright-stealth`
- **Asynchronous Ingestion:** `aiohttp`, `httpx`, `tenacity` (retry logic)
- **Data Processing & Analytics:** `pandas`, `numpy`, `scipy` (geometric mean / Jevons computation)
- **Data Persistence:** PostgreSQL on Supabase (asyncpg pool, 5 tables + 3 views)

---

## Phase 1: Environment Setup, Project Scaffolding & Configuration

- [ ] **1.1 Project Structure Setup**
  - Initialize the repository directory structure:
    ```text
    Airfare Price Fetcher/
    ├── config/
    │   ├── routes_weights.json
    │   └── settings.py
    ├── data/
    │   ├── raw/
    │   ├── processed/
    │   └── indices/
    ├── src/
    │   ├── ingestion/
    │   ├── validation/
    │   ├── cleaning/
    │   ├── indexing/
    │   ├── api/
    │   └── dashboard/
    ├── tests/
    ├── storage/
    ├── requirements.txt
    └── main.py
    ```
  - Create `requirements.txt` pinning: `playwright`, `playwright-stealth`, `aiohttp`, `pandas`, `numpy`, `scipy`, `fastapi`, `uvicorn`, `streamlit`, `plotly`, `pydantic`, `pytest`.

- [ ] **1.2 DGCA Route Basket & Parameters Configuration**
  - Create `config/routes_weights.json` containing top domestic sectors and their DGCA passenger traffic volume weights (e.g., `DEL-BOM`: 0.28, `DEL-BLR`: 0.20, `BOM-BLR`: 0.16, `DEL-CCU`: 0.14, `BLR-HYD`: 0.12, `MAA-DEL`: 0.10).
  - Define the standard advance-purchase window matrix: `[1, 7, 15, 30, 45]` days ($T+1$ to $T+45$).
  - Configure target airline codes (`6E`: IndiGo, `AI`: Air India, `IX`: Air India Express, `QP`: Akasa Air, `SG`: SpiceJet) and target portal (`Ixigo`).

- [ ] **1.3 Ethical Scraping & Policy Guard**
  - Create `src/ingestion/compliance.py` using `urllib.robotparser`.
  - Implement dynamic `robots.txt` fetching and parsing for target domains with automated logging of crawl-delay rules.
  - Implement a custom User-Agent builder: `"MoSPI-APIx-Research-Bot/1.0 (+https://mospi.gov.in/cpi; rate-limited; research-use)"`.

---

## Phase 2: Token Harvester & Session Manager (Playwright)

- [x] **2.1 Playwright Stealth Harvester Engine**
  - Create `src/ingestion/token_harvester.py`.
  - Configure Playwright with `playwright-stealth` in headless mode to simulate human TLS/browser handshakes.
  - Implement network listener hooks via `page.on("request")` and `page.on("response")` to intercept internal search API endpoints and HTTP headers.

- [x] **2.2 Target-Specific Token Interceptors**
  - **Ixigo:** Intercept API gateway session keys, client IDs, and `x-auth-token` headers from `/api/v2/flights/` endpoints.
  - **Google Flights:** DOM-based interceptor using Playwright to render page and extract flight data from `div.JMc5Xc` aria-labels.

- [x] **2.3 Token Cache Store**
  - Create `src/ingestion/session_store.py` to persist active tokens, cookies, and timestamps into a local cached JSON/Redis store with a defined Time-To-Live (TTL = 4 hours).
  - Implement a validity-check function that triggers a headless browser refresh only when a token is expired or returns a `401/403` status.

---

## Phase 3: Parametric Query Matrix & Asynchronous Ingestion Engine

- [x] **3.1 Parametric Query Generator**
  - Create `src/ingestion/query_matrix.py`.
  - Implement a generator function that takes current execution date $D_0$, routes from `routes_weights.json`, and advance windows $t \in [1, 7, 15, 30, 45]$ to output target departure dates: $D_{dep} = D_0 + t$.
  - Build parametric search URL/payload builder for Ixigo and Google Flights.

- [x] **3.2 Asynchronous Ingestion Worker (`aiohttp` + Playwright)**
  - Create `src/ingestion/async_fetcher.py`.
  - Build asynchronous fetch workers using `aiohttp.ClientSession` for Ixigo (SSE API).
  - Build Playwright DOM extraction for Google Flights (aria-label parsing).
  - Implement token-bucket rate limiting (max 1 req/sec/domain) to enforce ethical scraping.
  - Implement exponential backoff retry logic for transient network errors (`5xx`, `429`).

- [x] **3.3 Raw Response Storage**
  - Create `src/ingestion/raw_sink.py` to dump raw JSON responses to `data/raw/YYYY-MM-DD/` labeled by source, route, and advance window for auditable data lineage.

- [x] **3.4 Data Schema & Extraction Spec**
  - Create `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` with canonical 26-field schema, dual-source extraction mappings (Ixigo SSE + Google Flights DOM), normalization rules, and medallion DDL.
  - Create `src/cleaning/schemas.py` with Pydantic V2 models (`FlightRecord`, `SourceEnum`, `FareClassEnum`).
  - Create `src/storage/db.py` with DuckDB connection manager and Bronze/Silver/Gold DDL.

---

## Phase 4: Data Parsing, Normalization & "Truth Triangle" Validation

- [x] **4.1 Unified Schema Data Extractor**
  - Create `src/cleaning/schemas.py` using `pydantic` V2 models.
  - Standardize raw payloads into the target record structure:
    - `capture_timestamp` (ISO-8601 UTC)
    - `source` (`Ixigo` | `Google Flights`)
    - `route` (`ORIGIN-DEST`)
    - `flight_date` (`YYYY-MM-DD`)
    - `advance_window` (integer days)
    - `carrier_code` (IATA 2-letter code, nullable for Google Flights)
    - `carrier_name` (airline display name)
    - `flight_number` (normalized `XX-NNNN` format, nullable for Google Flights)
    - `fare_class` (`ECONOMY`, etc.)
    - `base_fare` (float, = `total_fare` when no breakdown available)
    - `tax_total` (float, `0.00` when no breakdown available)
    - `tax_breakdown_available` (boolean flag)
    - `total_fare` (float, final payable amount)
    - `departure_time`, `arrival_time` (HH:MM format)
    - `stops` (integer)
    - `duration_minutes` (integer, nullable)
    - `seat_remaining` (integer, nullable; 0 → NULL for Ixigo)
    - `is_refundable` (boolean)
    - `is_imputed` (boolean)
    - `data_hash` (SHA-256 of composite key)

- [x] **4.2 Bronze → Silver Cleaning Pipeline**
  - Deduplicate by `data_hash`.
  - Validate all fields against Pydantic schemas.
  - Compute `core_fare = base_fare + tax_total`.
  - Write to `silver_flight_clean` table.
  - **Note:** DuckDB `db.py` is legacy. New writes go to `supabase_sink.py`.

- [x] **4.3 "Truth Triangle" Parity Validation Engine**
  - Create `src/validation/truth_triangle.py`.
  - Group observations by composite key: `[journey_date, origin, destination, carrier_code, departure_time, arrival_time]` (flight_number excluded — Google Flights uses synthetic IDs).
  - Evaluate parity: Compare `total_fare` between Ixigo and Google Flights.
  - Tie-breaker logic: If a disparity is detected (> 1% delta), prefer primary source (Ixigo) and flag in audit log.

- [x] **4.4 Sold-Out Flights & Missing Value Imputation (Jevons Cell-Relative Method)**
  - Create `src/cleaning/imputer.py`.
  - Identify missing or sold-out flight slots in the current day's matrix against the historical flight catalog.
  - Implement **Cell-Relative Imputation**:
    1. Define cell: `[route, advance_window]`.
    2. Compute cell price growth factor $R_{c, t} = \left(\prod_{i=1}^{n} \frac{p_{i, t}}{p_{i, t-1}}\right)^{1/n}$ using `scipy.stats.gmean` on matched available flights between yesterday ($t-1$) and today ($t$).
    3. Impute missing price: $p_{missing, t} = p_{missing, t-1} \times R_{c, t}$.
  - Implement hierarchical fallback: Cell-level growth $\rightarrow$ Route-level growth $\rightarrow$ National growth $\rightarrow$ Last known price (growth=1.0).
  - Add boolean flag `is_imputed = TRUE` to imputed rows.
  - Integration in `main.py`: runs after ingestion, before Truth Triangle + Index.

- [x] **4.5 Partitioned CSV Writer** (removed)
  - Originally planned `src/cleaning/storage_writer.py` to write daily CSVs.
  - **Superseded:** Supabase PostgreSQL is now the sole production storage layer
    (`supabase_sink.py`). Raw JSON lineage remains under `data/raw/YYYY-MM-DD/`.

---

## Phase 4S: Supabase Migration

Migrate from DuckDB local database to PostgreSQL on Supabase for production storage and index computation.

- [x] **4S.1 Settings & Dependencies**
  - Added `asyncpg>=0.29.0` to `requirements.txt`.
  - Added `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY` to `config/settings.py`.
  - Created `.env` with real credentials (gitignored).
  - Created `.env.example` with placeholder template.

- [x] **4S.2 Supabase Sink**
  - Created `src/storage/supabase_sink.py` with asyncpg connection pool.
  - Batch upsert methods for all 5 tables with `ON CONFLICT DO UPDATE`.
  - Generic `query()` and `execute()` methods for reads/writes.

- [x] **4S.3 MCP Server**
  - Created `opencode.json` with Supabase MCP server config.
  - Enables natural language database queries from opencode after restart.

- [x] **4S.4 DDL Deployment**
  - DDL deployed to Supabase (via MCP / SQL editor).
  - Creates: `flight_quotes`, `route_weights`, `advance_window_weights`, `base_period_prices`, `airfare_price_index` + 3 views.
  - DDL documented in `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` Section 8.

- [x] **4S.5 Schema Rewrite**
  - Rewrite `src/cleaning/schemas.py` `FlightRecord` to match `flight_quotes` columns.
  - Rename fields: `record_id`→`quote_id`, `source`→`source_portal`, `tax_total`→`taxes`, etc.
  - Add new fields: `tax_udf`, `tax_asf`, `tax_gst`, `fees`, `is_sold_out`, `booking_date`.
  - Change `departure_time`/`arrival_time` to `TIMESTAMPTZ` (`departure`/`arrival`).
  - Generated columns (`route`, `core_fare`, `booking_date`) computed by PostgreSQL, not Python.

- [x] **4S.6 Interceptor Updates**
  - Update `src/ingestion/interceptors/base.py` `FlightData` — add new fields, remove old ones, add `to_quote_dict()`.
  - Update `ixigo.py` — map `seatRemaining==0` → `is_sold_out=True`, parse timestamps.
  - Update `google_flights.py` — same mapping changes.

- [x] **4S.7 Pipeline Wiring**
  - Update `src/ingestion/async_fetcher.py` — replace DuckDB `insert_bronze()` with `SupabaseSink.upsert_flight_quotes()`.
  - Remove normalizer import — dedup now handled by `ON CONFLICT` in PostgreSQL.
  - Keep raw sink (`data/raw/`) for auditable lineage.

- [x] **4S.8 Index Construction**
  - Create `src/indexing/jevons.py` — daily geometric means per cell.
  - Create `src/indexing/base_period.py` — base period prices from first scrape date.
  - Create `src/indexing/laspeyres.py` — weighted index computation.
  - Create `src/indexing/pipeline.py` — orchestrator: jevons → base_period → laspeyres → upsert.
  - SQL: `EXP(AVG(LN(core_fare)))` for Jevons, `SUM(index × route_weight × window_weight)` for Laspeyres.

- [x] **4S.9 Test Rewrite**
  - Update `tests/test_schemas.py` — new field names, add new field tests.
  - Replace `tests/test_db.py` with `tests/test_supabase_sink.py` (mock asyncpg).
  - Remove `tests/test_normalizer.py` — dedup now in DB.
  - Update `tests/test_ixigo_parser.py` and `tests/test_google_flights.py` — new fields.
  - Add `tests/test_jevons.py`, `tests/test_laspeyres.py`, `tests/test_pipeline.py`.

- [x] **4S.10 Docs & Cleanup**
  - Remove `src/storage/db.py` (DuckDB manager).
  - Remove `data/apix.duckdb`.
  - Update `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` — replace medallion DDL with Supabase DDL.
  - Update `ROADMAP.md` — mark all 4S sub-phases.
  - Update `AGENTS.md` — new architecture.
---

## Phase 5: Pipeline Orchestration & Automation ✅ Completed

- [x] **5.1 GitHub Actions Workflow**
  - Create `.github/workflows/daily-pipeline.yml` — runs at `30 8,20 * * *` (2 AM / 2 PM IST).
  - Supabase secrets injected via `${{ secrets.* }}`.
  - Playwright chromium install, artifact upload, auto-issue on failure.
  - Document secrets in `SECRETS.md`.

- [x] **5.2 Pipeline Orchestration Modules**
  - `src/indexing/jevons.py` — pure functions: `geometric_mean`, `aggregate_jevons`, `compute_cell_indices`, `compute_overall_apix`.
  - `src/indexing/pipeline.py` — `IndexPipeline` orchestrator (calibrate → aggregate → index → upsert), `run_all_portals()`.
  - Refactor `laspeyres_engine.py` to delegate to `jevons.py`.
  - Tests: `test_jevons.py` (17), `test_pipeline.py` (7). Full suite: **159 passing**.

---

## Phase 6: Thin-Wrapper API ✅ Completed

- [x] **6.1 FastAPI Thin Wrapper over Supabase PostgREST**
  - `src/api/main.py` — app, CORS, slowapi rate limiting, lifespan-managed shared httpx client.
  - `src/api/config.py` — `ApiSettings` (API keys, rate limit, CORS, Supabase creds).
  - `src/api/dependencies.py` — PostgREST client + API key (`X-API-Key`) + admin scoping.
  - `src/api/models.py` — `Meta`, `ApixResponse`, `ErrorResponse`, `HealthResponse`.
  - `src/api/routes/apix.py` — `/apix/latest`, `/apix/weekly`, `/apix/monthly`, `/apix/by-route`, `/apix/heatmap`, `/apix/elasticity`, `/apix/airlines`.
  - `src/api/routes/health.py` — `/health`, `/admin/coverage`.

- [x] **6.2 Deployment**
  - `api.Dockerfile` (binds `$PORT`) + `.dockerignore` + `render.yaml` (Render Blueprint, free plan).
  - `.github/workflows/api-deploy.yml` — run API tests then trigger Render Deploy Hook on `src/api/**` change.
  - `SECRETS.md` updated with `RENDER_DEPLOY_HOOK`.
  - Render auto-deploy (`autoDeploy: true`) + manual Deploy Hook for CI control.

- [x] **6.3 Tests**
  - `test_api_models.py`, `test_api_auth.py`, `test_api_routes.py` (22 tests, mocked PostgREST).

---

## Phase 7: fareToken Investigation ✅ Concluded (dead end)

Investigated whether the Ixigo `fareToken` string encodes a recoverable base-fare
/ tax component, to enable tax decomposition in the index.

- [x] **7.1 Captured 197 real fareToken strings** across 2 routes (DEL-BOM, BLR-MAA) on 2026-08-31.
- [x] **7.2 Fully decoded the token structure**:
  - Dual-delimiter string: pipe (`|`) for semantic fields, tilde (`~`) for a trailing numeric cluster.
  - Pipe fields: `DEL|BOM|DDMMYY||1|0|0|e|INR|searchId$id|flightKeys|false|true|<tilde-cluster>`.
  - Tilde cluster (positions): `[offerId(9-digit), displayFare, offerId2, offerId3, sessionId(constant across search), uuid]`.
  - Position 1 == `displayFare` (the **total** fare). Verified on 195/197 tokens; the 2 mismatches are alternate
    fare buckets with `seatRemaining: 0`.
  - Positions 0/2/3 are large 9-digit internal offer IDs (~9.25M) — **NOT fares**.
  - Position 4 is a constant, session-wide ID.
- [x] **7.3 Conclusion:** The `fareToken` contains **no base fare / tax component**. Tax decomposition is not
  recoverable from either Ixigo (search SSE) or Google Flights (DOM). The index uses **total fare**;
  schema fields `tax_udf`, `tax_asf`, `tax_gst`, `fees`, `taxes`, `base_fare` remain `0.0` (rule N5).
- [x] **7.4 Docs:** Full structure documented in `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` §2.3 and
  `docs/portal-analysis/ixigo-response-structure.json`. One-off capture script removed after use.
