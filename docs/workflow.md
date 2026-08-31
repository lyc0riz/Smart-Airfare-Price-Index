# APIx Workflow & Pipeline Documentation

## 1. Architecture Overview

The Real-Time Airfare Price Index (APIx) system implements a **hybrid parametric extraction** pipeline that augments India's Consumer Price Index (CPI) by automatically collecting, validating, and indexing daily airfare data from online portals.

### Core Design Principles

- **Ethical scraping**: robots.txt compliance, 1 req/sec/domain, custom User-Agent (`MoSPI-APIx-Research-Bot/1.0`), research exemption logging
- **Dual-source ingestion**: Ixigo (SSE API via FlareSolverr Cloudflare clearance cookies, Playwright fallback) + Google Flights (DOM extraction via Playwright)
- **Batch Supabase upsert**: Async PostgreSQL with `ON CONFLICT DO UPDATE` for idempotent deduplication
- **Jevons → Laspeyres index**: Geometric mean elementary aggregates → weighted Laspeyres price index
- **Truth Triangle validation**: Cross-source fare parity check (1% tolerance, Ixigo-preferred)

### Technology Stack

| Layer | Technologies |
|-------|--------------|
| Runtime | Python 3.11+, `asyncio`, `pydantic` v2 |
| Browser Automation | `playwright`, `playwright-stealth` |
| HTTP | `aiohttp` + `curl-cffi` (Chrome-fingerprint replay for Ixigo), exponential backoff retry |
| Database | `asyncpg` (Supabase PostgreSQL), PgBouncer-compatible pool |
| Computation | `pandas`, `numpy`, `scipy.stats.gmean` |
| API/Dashboard | `fastapi`, `uvicorn`, `streamlit`, `plotly` |

---

## 2. Phase-by-Phase Implementation Status

| Phase | Component | Status | Key Files |
|-------|-----------|--------|-----------|
| **1** | Config & Setup | ✅ Complete | `config/settings.py`, `config/routes_weights.json`, `src/ingestion/compliance.py` |
| **2** | Token Harvesting | ✅ Complete | `src/ingestion/token_harvester.py`, `src/ingestion/session_store.py` |
| **3** | Query Matrix & Ingestion | ✅ Complete | `src/ingestion/query_builder.py`, `src/ingestion/async_fetcher.py`, `src/ingestion/raw_sink.py` |
| **4.1** | Canonical Schema | ✅ Complete | `src/cleaning/schemas.py` |
| **4.2** | Interceptors | ✅ Complete | `src/ingestion/interceptors/base.py`, `ixigo.py`, `google_flights.py` |
| **4.3** | Truth Triangle | ✅ Complete | `src/validation/truth_triangle.py` |
| **4S.1–4S.3** | Supabase Setup | ✅ Complete | `config/settings.py` (Supabase), `opencode.json`, `supabase_sink.py` |
| **4S.4** | DDL Deployment | ✅ Complete | 5 tables + 3 views via MCP |
| **4S.5** | Schema Rewrite | ✅ Complete | `schemas.py` → `flight_quotes` columns |
| **4S.6** | Interceptor Updates | ✅ Complete | `FlightData.to_quote_dict()`, synthetic `GF-*` flight numbers |
| **4S.7** | Pipeline Wiring | ✅ Complete | `async_fetcher.py` batch upsert |
| **4S.8** | Index Engine | ✅ Complete | `base_calibrator.py`, `laspeyres_engine.py` |
| **4S.9** | Test Rewrite | ✅ Complete | 74 tests passing |
| **4S.10** | Docs & Cleanup | ✅ Complete | DuckDB removed, docs updated |
| **4.4** | Sold-Out Imputation | ✅ Complete | `src/cleaning/imputer.py` |
| **4.5** | Partitioned CSV Writer | 🗑️ Removed | — |
| **4S.8** | Index Construction | ✅ Complete | `src/indexing/jevons.py`, `base_calibrator.py`, `laspeyres_engine.py`, `pipeline.py` |
| **4S.9** | Test Rewrite | ✅ Complete | `test_jevons.py`, `test_laspeyres.py`, `test_pipeline.py` |
| **5** | Pipeline Orchestration | ✅ Complete | `src/indexing/pipeline.py` + GitHub Actions |
| **6** | Thin-Wrapper API | ✅ Complete | `src/api/` (FastAPI + PostgREST), `render.yaml`, `api-deploy.yml` |
| **6** | Dashboard | 📋 Deferred | — |

---

## 3. End-to-End Pipeline Flow

```
main.py:run_daily_pipeline()
    │
    ├─► QueryBuilder.generate_search_matrix()
    │       └─► 6 routes × 5 windows = 30 parametric queries
    │
    ├─► AsyncFetcher.run()  (rate limit: 1 req/sec/domain)
    │       │
    │       ├─► IxigoInterceptor
    │       │       ├─► Playwright stealth browser
    │       │       ├─► TokenHarvester → SessionStore (4h TTL)
    │       │       └─► page.evaluate(fetch()) to SSE endpoint
    │       │
    │       ├─► GoogleFlightsInterceptor
    │       │       ├─► Playwright stealth browser
    │       │       └─► DOM extraction: div.JMc5Xc[aria-label] + regex
    │       │
    │       ├─► FlightData.to_quote_dict()  → IST-aware TIMESTAMPTZ
    │       │       └─► Google Flights: synthetic flight_number = GF-{carrier}-{dep}-{arr}
    │       │
    │       ├─► RawSink.save()  [data/raw/YYYY-MM-DD/ixigo_DEL-BOM_T+7.json]
    │       │
    │       └─► SupabaseSink.upsert_flight_quotes()  [flight_quotes table]
    │               └─► ON CONFLICT DO UPDATE (dedup by composite key)
    │
    ├─► run_imputation()  (Phase 4.4)
    │       └─► Jevons cell-relative imputation for sold-out/missing cells
    │
    ├─► TruthTriangle.run()
    │       ├─► Fetch min fare per match key from both sources
    │       │       Match key = (journey_date, origin, dest, carrier_code, dep_time, arr_time)
    │       │       (flight_number excluded — Google Flights uses synthetic IDs)
    │       ├─► Compare total_fare with 1% tolerance
    │       ├─► Agreed pairs / disparities logged (Ixigo preferred)
    │       └─► Unmatched: GF NULL carrier, Ixigo-only flights
    │
    └─► IndexPipeline.run_all_portals()  (Phase 4S.8 / 5)
            │
            ├─► BaseCalibrator.ensure_base_period()
            │       └─► First run → calibrate base_period_prices from today's Jevons
            │
            ├─► Jevons elementary aggregates per cell (src/indexing/jevons.py)
            │       Cell = (origin, destination, advance_windows)
            │       Jevons = exp(mean(log(total_fare)))  [geometric mean]
            │
            ├─► Load weights: route_weights + advance_window_weights
            │
            ├─► Laspeyres weighted indices (src/indexing/jevons.compute_cell_indices)
            │       relative_index = (P_t / P_0) × 100
            │       contribution = route_weight × window_weight × relative_index
            │
            ├─► Overall APIx = Σ(contribution) / Σ(route_weight × window_weight)
            │
            └─► SupabaseSink.upsert_airfare_price_index()  [airfare_price_index table]

GitHub Actions (schedule: 30 8,20 * * *) → 2×/day at 2 AM & 2 PM IST
```

---

## 4. Key Data Models

### FlightRecord (`src/cleaning/schemas.py`) → `flight_quotes` table
```python
quote_id: UUID
source_portal: Enum[Ixigo, Google Flights]
scraping_date_time: TIMESTAMPTZ (UTC)
journey_date: DATE
origin: CHAR(3)          # IATA
destination: CHAR(3)
advance_windows: INT     # 1,7,15,30,45
carrier_code: VARCHAR(10) # nullable
carrier: VARCHAR(50)
flight_number: VARCHAR(50) # synthetic for GF: GF-{code}-{dep}-{arr}
journey_class: Enum[ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST]
fare: DECIMAL(10,2)      # display fare
base_fare: DECIMAL(10,2)
fees: DECIMAL(10,2)      # default 0
tax_udf, tax_asf, tax_gst: DECIMAL(10,2)  # default 0
taxes: DECIMAL(10,2)     # default 0
total_fare: DECIMAL(10,2)
departure: TIMESTAMPTZ   # IST-aware
arrival: TIMESTAMPTZ
duration_min: INT        # nullable
stops: INT
is_sold_out: BOOL        # seatRemaining == 0
is_imputed: BOOL
data_hash: CHAR(64)      # SHA-256 composite key
```

### Generated Columns (PostgreSQL)
- `route` = `origin || '-' || destination`
- `core_fare` = `total_fare - base_fare - fees`
- `booking_date` = `scraping_date_time::date`

### Index Cell Key
```python
CellKey = tuple[origin, destination, advance_windows]
```

### Truth Triangle Match Key
```python
MatchKey = tuple[journey_date, origin, destination, carrier_code, departure_time, arrival_time]
```

---

## 5. Supabase Schema Summary

### Tables (5)

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `flight_quotes` | Raw cleaned quotes | 26 columns, composite unique constraint, generated columns |
| `route_weights` | DGCA traffic weights | 6 routes, `(origin, destination)` PK |
| `advance_window_weights` | Per-portal window weights | `(source_portal, advance_window)` PK |
| `base_period_prices` | Base period Jevons fares | `(source_portal, journey_date, origin, destination, advance_windows)` PK |
| `airfare_price_index` | Daily computed index | `(date, origin, destination, advance_windows, source_portal)` PK |

### Views (3)

| View | Description |
|------|-------------|
| `view_apix_weekly` | `date_trunc('week', date)` → weighted APIx sum |
| `view_apix_monthly` | `date_trunc('month', date)` → weighted APIx sum |
| `view_route_leadtime_elasticity` | Day-over-day % change per route/window/portal |

### Connection Notes
- **Pooler**: `aws-0-[region].pooler.supabase.com:6543` (PgBouncer transaction mode)
- **asyncpg**: `statement_cache_size=0` required (prepared statements unsupported)
- **Credentials**: `.env` (gitignored) with `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`

---

## 6. Operational Commands

```bash
# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Run full daily pipeline (ingest → validate → index)
python main.py

# Run tests
pytest tests/ -v                    # All 74 tests
pytest tests/test_laspeyres.py -v   # Index engine tests
pytest tests/test_truth_triangle.py -v  # Parity validation tests

# Verify Supabase connectivity
python -c "
import asyncio, os
from dotenv import dotenv_values
os.environ['SUPABASE_DB_URL'] = dotenv_values('.env')['SUPABASE_DB_URL']
from src.storage.supabase_sink import SupabaseSink
async def t():
    s = SupabaseSink(); await s.connect()
    print(await s.query('SELECT count(*) FROM flight_quotes'))
    await s.close()
asyncio.run(t())
"
```

---

## 7. Configuration Reference

### `config/routes_weights.json`
```json
{
  "routes": {
    "DEL-BOM": {"weight": 0.28, "origin": "DEL", "destination": "BOM"},
    "DEL-BLR": {"weight": 0.20, "origin": "DEL", "destination": "BLR"},
    "BOM-BLR": {"weight": 0.16, "origin": "BOM", "destination": "BLR"},
    "DEL-CCU": {"weight": 0.14, "origin": "DEL", "destination": "CCU"},
    "BLR-HYD": {"weight": 0.12, "origin": "BLR", "destination": "HYD"},
    "MAA-DEL": {"weight": 0.10, "origin": "MAA", "destination": "DEL"}
  },
  "advance_windows_days": [1, 7, 15, 30, 45],
  "airlines": {"6E": "IndiGo", "AI": "Air India", "IX": "Air India Express", "QP": "Akasa Air", "SG": "SpiceJet"},
  "target_portals": ["Ixigo", "Google Flights"]
}
```

### `config/settings.py` (Key Settings)
| Setting | Default | Description |
|---------|---------|-------------|
| `RATE_LIMIT_PER_SECOND` | 1 | Requests per second per domain |
| `TOKEN_TTL_HOURS` | 4 | Session cache TTL |
| `USER_AGENT` | `MoSPI-APIx-Research-Bot/1.0` | Custom UA for all requests |
| `REQUEST_TIMEOUT` | 30 | HTTP timeout seconds |
| `LOG_LEVEL` | `INFO` | Logging level |

---

## 8. Next Steps (Planned Work)

### Phase 4.4 — Sold-Out Imputation (`src/cleaning/imputer.py`)
- **Cell-relative Jevons imputation**: For missing/sold-out slots in current day's matrix
- **Growth factor**: $R_{c,t} = \left(\prod_{i=1}^{n} \frac{p_{i,t}}{p_{i,t-1}}\right)^{1/n}$ on matched available flights
- **Hierarchical fallback**: Cell → Route → National → Last known price
- **Flag**: `is_imputed = True`

### Phase 5 — Index Pipeline Hardening (`src/indexing/`)
- `jevons.py`: Standalone Jevons computation module
- `pipeline.py`: Orchestrator (calibrate → aggregate → index → upsert)
- Scheduling/cron integration

### Phase 6 — Dashboard & API
- **FastAPI** (`src/api/`): `/index`, `/quotes`, `/parity` endpoints
- **Streamlit** (`src/dashboard/`): Time-series charts, route drill-down, elasticity heatmap
- Consumes `view_apix_weekly`, `view_apix_monthly`, `view_route_leadtime_elasticity`

---

## 9. File Reference Map

```
Airfare Price Fetcher/
├── config/
│   ├── routes_weights.json      # DGCA basket + advance windows
│   └── settings.py              # Pydantic Settings + env loading
├── data/
│   ├── raw/                     # Raw JSON responses (YYYY-MM-DD/)
│   ├── processed/               # Cleaned CSVs (future)
│   └── indices/                 # Computed index exports (future)
├── docs/
│   ├── DATA_SCHEMA_AND_EXTRACTION_SPEC.md  # Canonical schema + Supabase DDL
│   └── workflow.md               # THIS FILE
├── src/
│   ├── ingestion/
│   │   ├── interceptors/
│   │   │   ├── base.py          # FlightData, BaseInterceptor, to_quote_dict()
│   │   │   ├── ixigo.py         # SSE parser (flightJourneys.flightFare[])
│   │   │   └── google_flights.py # DOM parser (aria-label regex)
│   │   ├── async_fetcher.py     # Dual-source runner + batch upsert
│   │   ├── query_builder.py     # 30-query matrix generator
│   │   ├── raw_sink.py          # Audit lineage (data/raw/)
│   │   ├── session_store.py     # Token cache (JSON, 4h TTL)
│   │   ├── token_harvester.py   # Playwright stealth harvester
│   │   └── compliance.py        # robots.txt + rate limiting
│   ├── cleaning/
│   │   ├── schemas.py           # FlightRecord (Pydantic V2)
│   │   └── imputer.py           # Jevons cell-relative imputation
│   ├── storage/
│   │   └── supabase_sink.py     # asyncpg pool + 5 table upserts
│   ├── validation/
│   │   └── truth_triangle.py    # Cross-source parity (1% tolerance)
│   ├── indexing/
│   │   ├── base_calibrator.py   # Jevons aggregates + base period
│   │   ├── laspeyres_engine.py  # Weighted Laspeyres index
│   │   └── pipeline.py          # Orchestrator + run_all_portals()
│   ├── api/                     # FastAPI thin wrapper over Supabase PostgREST
│   │   ├── main.py              # App, CORS, rate limit, lifespan
│   │   ├── config.py            # ApiSettings
│   │   ├── dependencies.py      # PostgREST client + API key auth
│   │   ├── models.py            # Response models
│   │   └── routes/
│   │       ├── apix.py          # /apix/* endpoints
│   │       └── health.py        # /health + /admin/coverage
│   └── dashboard/               # Streamlit app (deferred)
├── tests/                       # 144 passing tests (122 + 22 API)
├── storage/                     # Token cache (tokens.json)
├── main.py                      # Entry point + run_daily_pipeline()
├── requirements.txt
├── ROADMAP.md
└── AGENTS.md
```

---

## 7. Thin-Wrapper API (Phase 6)

The API is a **FastAPI thin wrapper** over Supabase PostgREST. It adds API-key auth, rate limiting, CORS, and standard response shaping on top of the auto-generated REST endpoints.

### Endpoints

| # | Method | Endpoint | Source | Auth Scope |
|---|--------|----------|--------|-----------|
| 1 | `GET` | `/api/v1/apix/latest` | `airfare_price_index` | any |
| 2 | `GET` | `/api/v1/apix/weekly` | `view_apix_weekly` | any |
| 3 | `GET` | `/api/v1/apix/monthly` | `view_apix_monthly` | any |
| 4 | `GET` | `/api/v1/apix/by-route` | `airfare_price_index` | any |
| 5 | `GET` | `/api/v1/apix/heatmap` | `airfare_price_index` | any |
| 6 | `GET` | `/api/v1/apix/elasticity` | `view_route_leadtime_elasticity` | any |
| 7 | `GET` | `/api/v1/apix/airlines` | `flight_quotes` | any |
| 8 | `GET` | `/api/v1/health` | ping `view_apix_weekly` | any |
| 9 | `GET` | `/api/v1/admin/coverage` | `flight_quotes` | admin |

### Auth

- Header: `X-API-Key: <key>` (or `Authorization` via API proxy)
- Keys map to scopes via `API_KEYS` JSON (e.g. `{"web-key":"web","admin-key":"admin"}`)
- `/admin/*` requires the `admin` scope (`require_admin` dependency)
- 401 on missing/invalid key, 403 on wrong scope

### Rate Limiting

- `slowapi` limit: `RATE_LIMIT_PER_MINUTE` (default `100/minute`) per client IP
- Configurable in `src/api/config.py` / env

### Response Envelope

```json
{
  "data": [...],
  "meta": { "portal": "Ixigo", "count": 52, "generated_at": "2026-08-30T14:30:00Z" }
}
```

Errors:
```json
{
  "error": { "code": 404, "message": "Not found", "type": "not_found" }
}
```

### Deployment

- `api.Dockerfile` (binds to `$PORT`) + `render.yaml` (Render Blueprint, region + free plan)
- Deploy via **Render Web Service** — auto-deploy on push, plus GitHub Actions `api-deploy.yml`
- Render env vars set once: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `API_KEYS`
- OpenAPI docs auto-served at `/docs` after deploy

### Run Locally

```bash
uvicorn src.api.main:app --reload
curl -H "X-API-Key: apix-web-dev-key" http://localhost:8000/api/v1/health
```

---

*Last updated: 2026-08-30 | Pipeline status: Phases 1–5 complete | API: Phase 6 complete (thin wrapper, API-key auth, Render deployment)*