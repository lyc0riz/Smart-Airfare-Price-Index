# AGENTS.md: Real-Time Airfare Price Index (APIx) System

## Project Overview

Build a real-time airfare price index for India that augments the Consumer Price Index (CPI) used by NSO and RBI. The system scrapes airfare data from airline portals and OTAs, cleans it, and computes a daily/weekly/monthly index.

**Core Problem:** Manual airfare collection can't capture dynamic pricing (200-400% variation within a day). Over 90% of tickets are sold online.

**Solution:** Automated hybrid parametric extraction pipeline.

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
│   │   └── schemas.py         # Pydantic V2 models (FlightRecord, enums)
│   ├── storage/
│   │   ├── db.py              # DuckDB (legacy — local dev/testing only)
│   │   └── supabase_sink.py   # PostgreSQL async sink (primary storage)
│   ├── validation/            # Truth triangle parity checks
│   ├── indexing/              # PSD index construction
│   ├── api/                   # FastAPI endpoints
│   └── dashboard/             # Streamlit dashboard
├── tests/                     # pytest test suite
├── storage/                   # Token cache (JSON)
├── opencode.json              # MCP server config (Supabase)
├── .env                       # Secrets (gitignored)
├── requirements.txt
├── main.py
├── ROADMAP.md                 # Detailed phase plan
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

1. **Ixigo (Primary):** Playwright harvests tokens → aiohttp makes direct API calls to SSE endpoint → 129 flights/search with flight numbers, seat inventory, cabin class
2. **Google Flights (Secondary):** Playwright renders page → DOM extraction from `div.JMc5Xc` aria-labels → 114 flights/search, no flight numbers
3. **Session Store:** Tokens cached in JSON with 4-hour TTL
4. **Async Fetcher:** Runs 30 queries × 2 sources = 60 total fetches per cycle
5. **Rate Limiting:** 1 req/sec/domain, exponential backoff on 429/5xx
6. **Supabase PostgreSQL:** 5 tables + 3 views for persistent storage and index computation

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
| 4S.4 | DDL Deployment | Pending (user action) |
| 4S.5 | Schema Rewrite (new flight_quotes columns) | Planned |
| 4S.6 | Interceptor Updates (ixigo.py, google_flights.py) | Planned |
| 4S.7 | Pipeline Wiring (async_fetcher → SupabaseSink) | Planned |
| 4S.8 | Index Construction (src/indexing/) | Planned |
| 4S.9 | Test Rewrite | Planned |
| 4S.10 | Docs & Cleanup (remove DuckDB) | Planned |
| 5 | Index Construction (Jevons → Laspeyres) | Planned |
| 6 | Dashboard & API | Planned |

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
