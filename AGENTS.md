# AGENTS.md: Real-Time Airfare Price Index (APIx) System

## Problem Statement

> **Title:** Development of a Real-time Airfare Price Index for India through
> Automated Web Scraping of Airline and Online Travel Aggregator Portals for
> Augmentation of the Consumer Price Index (CPI)

### Background

The Consumer Price Index (CPI) released by the National Statistical Office (NSO),
Ministry of Statistics and Programme Implementation (MoSPI), is the primary measure
of retail inflation in India and is used by the Reserve Bank of India (RBI) for
setting monetary policy under the flexible inflation-targeting framework. The current
CPI framework, however, collects 'Transport and Communication' sub-group prices,
including air travel fares, primarily through manual price-collection from a limited
set of outlets and ticketing offices. With over 90% of domestic air tickets in India
now sold online through airline websites and Online Travel Aggregators (OTAs) such as
MakeMyTrip, Yatra, EaseMyTrip, Cleartrip, Ixigo and Goibibo, manual collection no
longer captures the highly dynamic, route-specific, and time-sensitive pricing that
Indian consumers actually face. Airfares in India follow dynamic pricing where the
same sector can vary by 200-400% within a single day depending on advance-booking
window, day-of-week, demand surges, festival seasons and fuel-price-linked surcharges.
There is therefore an urgent need for an automated, scalable and high-frequency
data-collection system that mirrors what a real Indian traveller pays.

### Detailed Description

The problem statement envisages development of an end-to-end software platform that
automatically web-scrapes airfare data from major Indian airline websites (IndiGo,
Air India, Air India Express, Akasa Air, SpiceJet) and leading OTAs, cleans and
normalises the collected price quotes, and computes a Real-time Airfare Price Index
(APIx) at daily, weekly and monthly frequencies. The system shall maintain a basket of
representative city-pairs (such as DEL-BOM, DEL-BLR, BOM-BLR, DEL-CCU, BLR-HYD,
MAA-DEL, etc.) selected on the basis of DGCA passenger-traffic data, and shall capture
fares for multiple advance-purchase windows (T+1, T+7, T+15, T+30, T+45 days).
Scraping must handle JavaScript-rendered pages, dynamic CAPTCHAs, anti-bot measures,
IP rotation, and session management while remaining compliant with the robots.txt and
terms of service of source websites, with appropriate rate-limiting and ethical-scraping
safeguards. The collected raw quotes shall be passed through a data-cleaning pipeline
that removes outliers, handles missing values, accounts for cancellations/sold-out
flights, and separates base fare from taxes, user-development fee and convenience
charges. The dashboard must visualise price trends, sector-wise heatmaps, lead-time
elasticity curves, and provide an API that the NSO and RBI can consume.

### Expected Solution

A working software prototype consisting of:

1. A robust, ethically-designed multi-source web-scraping engine using Python
   (Scrapy/Selenium/Playwright) capable of scheduled daily extraction from airline
   portals.
2. A cleaned and de-duplicated airfare database with metadata such as origin,
   destination, carrier, advance-purchase window, fare-class, base fare, taxes and
   total fare.
3. An index-construction module based on PSD given routes and weights.
4. A web-based interactive dashboard showing the daily Airfare Price Index.

The solution must include documentation, automated testing, and demonstrate at least
30 days of back-tested results against publicly available DGCA monthly average-fare
data.

---

## Current Status (What We've Built)

A real-time airfare price index system that scrapes airfare data from Ixigo and Google
Flights (dual-source), cleans/normalises it, and computes a daily/weekly/monthly index
using the Jevons → weighted Laspeyres methodology. See `METHODOLOGY.md` for the index
mathematics and `ROADMAP.md` for the implementation status.

## Tech Stack

- **Language:** Python 3.11+
- **Core Libraries:**
  - `pydantic` v2 — data validation and settings
  - `asyncio` + `aiohttp` — async HTTP
  - `playwright` + `playwright-stealth` — token harvesting
  - `asyncpg` — async PostgreSQL driver (Supabase)
  - `pandas`, `numpy`, `scipy` — data processing
  - `fastapi` + `uvicorn` — API server
  - `streamlit` + `plotly` — dashboard

## Build & Test Commands

```bash
# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Run the system
python main.py

# Run tests
pytest tests/ -v

# Run specific test
pytest tests/test_compliance.py -v
```

## Repository Structure

```
Airfare Price Fetcher/
├── config/
│   ├── routes_weights.json    # DGCA route basket & weights, target portals
│   └── settings.py            # Pydantic settings (Ixigo + Google Flights + Supabase)
├── data/
│   ├── raw/                   # Raw API responses (YYYY-MM-DD/)
│   ├── processed/             # Cleaned CSVs
│   └── indices/               # Computed indices
├── docs/
│   ├── portal-analysis/       # Portal research & response structures
│   └── DATA_SCHEMA_AND_EXTRACTION_SPEC.md  # Canonical schema + Supabase DDL
├── src/
│   ├── ingestion/
│   │   ├── interceptors/
│   │   │   ├── base.py        # FlightData dataclass, BaseInterceptor ABC
│   │   │   ├── ixigo.py       # Ixigo SSE API interceptor
│   │   │   └── google_flights.py  # Google Flights DOM scraper
│   │   ├── async_fetcher.py   # Dual-source async ingestion worker
│   │   ├── query_builder.py   # 30-query search matrix generator
│   │   ├── raw_sink.py        # Raw response storage
│   │   ├── session_store.py   # Token cache (4h TTL)
│   │   ├── token_harvester.py # Playwright token harvester
│   │   └── compliance.py      # robots.txt, User-Agent
│   ├── cleaning/
│   │   ├── schemas.py         # Pydantic V2 models (FlightRecord, enums)
│   │   └── imputer.py         # Jevons cell-relative imputation
│   ├── storage/
│   │   └── supabase_sink.py   # PostgreSQL async sink (primary storage)
│   ├── validation/            # Truth triangle parity checks
│   │   └── truth_triangle.py  # Cross-source fare parity engine
│   ├── indexing/              # APIx index construction
│   │   ├── base_calibrator.py # Jevons aggregates + base period
│   │   ├── laspeyres_engine.py# Weighted Laspeyres index engine
│   │   ├── jevons.py          # Pure Jevons + Laspeyres computation (geometric mean)
│   │   └── pipeline.py        # Orchestrator (calibrate → aggregate → index → upsert)
│   ├── api/                   # FastAPI thin wrapper over Supabase PostgREST
│   │   ├── main.py            # FastAPI app, CORS, rate limit, lifespan
│   │   ├── config.py          # ApiSettings (API keys, rate limit, CORS)
│   │   ├── dependencies.py    # Supabase httpx client + API key auth
│   │   ├── models.py          # Pydantic response models
│   │   └── routes/
│   │       ├── apix.py        # /apix/* endpoints (latest, weekly, monthly, ...)
│   │       └── health.py      # /health + /admin/coverage
│   └── dashboard/             # Streamlit dashboard (deferred - not built)
├── tests/                     # pytest test suite
├── storage/                   # Token cache (JSON)
├── opencode.json              # MCP server config (Supabase)
├── .env                       # Secrets (gitignored)
├── requirements.txt
├── main.py
├── api.Dockerfile             # API container image (binds $PORT)
├── render.yaml                # Render Blueprint (API Web Service)
├── ROADMAP.md                 # Detailed phase plan
├── API_Design.md             # Full API reference + abundant curl examples
└── AGENTS.md                  # This file
```

## Code Style

- **Python:** PEP 8 compliant
- **Type hints:** Required on all functions
- **Docstrings:** Google-style for public functions
- **Imports:** stdlib → third-party → local (separated by blank lines)
- **Naming:** `snake_case` for functions/variables, `PascalCase` for classes, `UPPER_SNAKE` for constants

```python
# GOOD
async def fetch_fares(route: str, advance_window: int) -> list[FareRecord]:
    """Fetch fares for a given route and advance window."""
    ...

# BAD
async def f(r, w):
    ...
```

## Architecture: Hybrid Parametric Extraction

**Why not direct scraping?** Robots.txt and TOS restrictions make direct HTML scraping impossible.

**How it works (Dual-Source):**

1. **Ixigo (Primary):** Playwright browser context is launched once; the SSE endpoint `GET /flights/v2/search/stream` is called via an in-browser `fetch()` (which carries the browser's cookies automatically). ~100-230 flights/search with flight numbers, seat inventory, cabin class. Cloudflare is handled by the real browser fingerprint.
2. **Google Flights (Secondary):** Playwright renders the results page → DOM extraction from `div.JMc5Xc` aria-labels → ~50-120 flights/search, no flight numbers (synthetic `GF-*` IDs generated).
3. **Session Store:** Tokens/device IDs cached in JSON with 4-hour TTL (Ixigo uses a static API key + generated device ID).
4. **Async Fetcher:** Runs 30 queries × 2 sources = 60 total fetches per cycle.
5. **Rate Limiting:** Ixigo is throttled to 0.2 req/sec (5s spacing) — its API returns HTTP 429 after ~12 requests/15s; Google Flights runs at 1 req/sec. Exponential backoff (5s→10s→20s→40s) on 429.
6. **Supabase PostgreSQL:** 5 tables + 3 views for persistent storage and index computation.

### Ixigo dual-path (curl_cffi vs Playwright)

The interceptor supports **two** fetch paths for Ixigo:

- **curl_cffi path (optimization):** Only used when the Playwright launch actually obtains a `cf_clearance` cookie from Cloudflare (`has_cf_clearance` is True). `cf_clearance` is bound to the resolving client's TLS/HTTP2 fingerprint, so the cookie is replayed with `curl_cffi` using `impersonate="chrome120"` and the same Chrome User-Agent.
- **Playwright path (primary, and the one used in CI):** In GitHub Actions, headless Chromium on a cloud runner almost never gets a `cf_clearance` cookie, so `has_cf_clearance` is False and every query goes through `page.evaluate(fetch(...))` against the SSE endpoint from within the browser context. This is the path that produced the working pipeline runs.

**Verified fact (2026-08-31):** The Ixigo SSE endpoint returns real `text/event-stream` data when the browser context carries Cloudflare cookies. The `displayFare` returned is the **total** fare (base + taxes); there is no tax breakdown in the search payload.

### fareToken investigation (concluded — dead end)

The Ixigo `fareToken` string was fully decoded from 197 real tokens across 2 routes (2026-08-31). It is a dual-delimiter string — pipe (`|`) for semantic fields and tilde (`~`) for a trailing numeric cluster — and contains **no base fare / tax component**. See `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` §2.3 for the full structure. The index therefore uses total fare; tax decomposition is not recoverable from either source.

**Schema:** See `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` for canonical schema and Supabase DDL.

See `ROADMAP.md` for mathematical details on index construction.

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Environment Setup & Configuration | Completed |
| 2 | Token Harvester & Session Manager | Completed |
| 3 | Async Ingestion Engine | Completed |
| 4.1 | Unified Schema Data Extractor | Completed |
| 4.2 | Bronze → Silver Cleaning Pipeline | Completed |
| 4S.1 | Settings & Dependencies (asyncpg, .env) | Completed |
| 4S.2 | Supabase Sink (src/storage/supabase_sink.py) | Completed |
| 4S.3 | MCP Server (opencode.json) | Completed |
| 4S.4 | DDL Deployment | Completed |
| 4S.5 | Schema Rewrite (flight_quotes columns) | Completed |
| 4S.6 | Interceptor Updates (ixigo.py, google_flights.py) | Completed |
| 4S.7 | Pipeline Wiring (async_fetcher → SupabaseSink) | Completed |
| 4S.8 | Index Construction (base_calibrator, laspeyres_engine) | Completed |
| 4S.9 | Test Rewrite | Completed |
| 4S.10 | Docs & Cleanup (DuckDB removed) | Completed |
| 4.3 | Truth Triangle Validation | Completed |
| 4.4 | Sold-Out Imputation (Jevons Cell-Relative) | Completed |
| 4.5 | Partitioned CSV Writer | Removed (Supabase is sole storage) |
| 5 | Index Construction (Jevons → Laspeyres) | Completed |
| 6 | API (thin wrapper over Supabase PostgREST) | Completed |
| 6 | Dashboard | Planned (deferred) |
| 7 | fareToken Investigation (no base fare) | Completed (dead end) |

## Supabase Connection

**Environment variables** (in `.env`, gitignored):
```bash
SUPABASE_DB_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_KEY=[anon_key]
SUPABASE_SERVICE_KEY=[service_role_key]
```

**MCP Server:** Configured in `opencode.json` — opencode can query the database directly via natural language after restart.

**5 Tables:** `flight_quotes`, `route_weights`, `advance_window_weights`, `base_period_prices`, `airfare_price_index`

**3 Views:** `view_apix_weekly`, `view_apix_monthly`, `view_route_leadtime_elasticity`

**Base Period:** First scrape date (not fixed year-2015). Set in `base_period_prices` table.

**Row Level Security (RLS):** Enabled on all 5 tables (2026-08-31). The `anon` key is **read-only** via
SELECT policies; all writes require the `service_role` key. Pipeline (asyncpg) and API (PostgREST) use
`service_role`, so RLS does not affect them. Policy DDL: see `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` §8.8.

## Future Phase Config (Preview)

**CAPTCHA Handling (Tier 1 & 2):**
- Tier 1: Hybrid approach avoids most CAPTCHAs
- Tier 2: Playwright-stealth + residential proxies

## Boundaries

**Always do:**
- Run `pytest tests/ -v` before commits
- Use type hints on all functions
- Check `robots.txt` before adding new domains
- Log all scraping decisions

**Ask first:**
- Adding new source portals
- Changing rate limit configuration
- Modifying the route basket
- Adding new dependencies

**Never do:**
- Commit API keys or tokens
- Exceed rate limits
- Ignore `robots.txt` restrictions
- Scrape without logging

## Ethical Scraping Rules

1. **User-Agent:** Always use `MoSPI-APIx-Research-Bot/1.0`
2. **Rate Limit:** Max 1 request/second/domain
3. **robots.txt:** Check before adding domains; respect crawl-delay
4. **Tokens:** TTL = 4 hours; refresh only on 401/403
5. **Logging:** All requests must be logged with timestamp, domain, status

## Testing

- **Framework:** pytest
- **Location:** `tests/`
- **Run all:** `pytest tests/ -v`
- **Run one:** `pytest tests/test_compliance.py::test_robots_check -v`
- **Coverage:** Aim for >80% on core modules
