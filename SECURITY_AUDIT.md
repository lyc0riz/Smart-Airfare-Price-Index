# Engineering, Mathematical & Security Audit Report

**Project:** Real-Time Airfare Price Index (APIx) / FlyIndex India  
**Auditor:** Principal Systems & Reliability Review  
**Date:** September 12, 2026  
**Status:** Complete — Ready for Remediation  

---

## 1. Executive Summary & Vulnerability Matrix

This audit represents an exhaustive review of the end-to-end APIx system across data ingestion (Playwright/SSE), data cleaning & imputation, PostgreSQL/Supabase storage & views, the FastAPI PostgREST wrapper, the React 18 frontend dashboard, and containerized deployment configuration.

A total of **34 vulnerabilities, mathematical bugs, architectural risks, and silent failure modes** were identified and categorized:

| ID | Category | Severity | Title | Affected Component |
|---|---|---|---|---|
| **SEC-01** | Statistical / Imputation | **Critical** | Impossible cross-day match key breaking Jevons imputation | `src/cleaning/imputer.py:122` |
| **SEC-02** | API / Mathematics | **Critical** | Truncation & unweighted sum in `/apix/latest` | `src/api/routes/apix.py:48` |
| **SEC-03** | Timezone / Ingestion | **Critical** | UTC/IST date mismatch breaking scheduled runs | `src/ingestion/interceptors/base.py:108` |
| **SEC-04** | Ingestion / Drift | **High** | `base_date` bypass & midnight drift across interceptors | `src/ingestion/interceptors/ixigo.py:530` |
| **SEC-05** | Database / Views | **High** | `view_route_leadtime_elasticity` missing `source_portal` | `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md:413` |
| **SEC-06** | Database / Schema | **High** | Flawed primary key in `base_period_prices` | `src/storage/supabase_sink.py:209` |
| **SEC-07** | Database / Deduplication | **High** | PostgreSQL `NULL != NULL` unique index quote leak | `src/storage/supabase_sink.py:89` |
| **SEC-08** | Calibration / Index | **High** | Permanent partial base-period calibration lockout | `src/indexing/base_calibrator.py:209` |
| **SEC-09** | Frontend / State | **High** | Dropdown "All India" & "All Airlines" disappearing bug | `src/api/routes/health.py:96` |
| **SEC-10** | Frontend / Mathematics | **High** | 100× route contribution scale error in live mode | `frontend/src/lib/build/provider.ts:222` |
| **SEC-11** | Frontend / Data Display | **Medium** | Route table 30-row duplication explosion | `frontend/src/lib/build/provider.ts:190` |
| **SEC-12** | API / Performance | **Medium** | PostgREST 1,000-row default truncation in `/apix/series` | `src/api/routes/apix.py:230` |
| **SEC-13** | API / Performance | **Medium** | Heavy 4,000-row unindexed query in `/admin/metadata` | `src/api/routes/health.py:75` |
| **SEC-14** | Deployment / CI/CD | **High** | Render Blueprint Dockerfile path mismatch | `render.yaml:7` |
| **SEC-15** | Ingestion / Reliability | **Medium** | Memory accumulation & delayed batch persistence | `src/ingestion/async_fetcher.py:350` |
| **SEC-16** | Frontend / UX | **Medium** | Negative index offset underflow on short histories | `frontend/src/pages/AirfareIndex.tsx:116` |
| **SEC-17** | Frontend / Components | **Low** | Orphaned Heatmap & `NaN` color scale division | `frontend/src/components/charts/Heatmap.tsx:27` |
| **SEC-18** | Compliance / Scraping | **Low** | Compliance Guard unconditional research override | `src/ingestion/compliance.py:158` |
| **SEC-19** | Pipeline / Status | **Low** | `newly_calibrated` boolean inversion in pipeline result | `src/indexing/pipeline.py:82` |
| **SEC-20** | Methodology / Weights | **Medium** | Unvalidated advance-window weight derivation | `METHODOLOGY.md:102` |
| **SEC-21** | Index / Robustness | **Medium** | Sparse-day route weight inflation trap | `src/indexing/jevons.py:127` |
| **SEC-22** | Ingestion / Parser | **Medium** | Google Flights regex strictly requiring "round trip" | `src/ingestion/interceptors/google_flights.py:38` |
| **SEC-23** | Ingestion / Parser | **Medium** | Unhandled time format fallback in `FlightData` | `src/ingestion/interceptors/google_flights.py:377` |
| **SEC-24** | Storage / Concurrency | **Low** | Non-atomic `SessionStore` JSON file writes | `src/ingestion/session_store.py:108` |
| **SEC-25** | Database / Views | **Medium** | `view_apix_weekly` meaningless raw fare summation | `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md:394` |
| **SEC-26** | Storage / SQL | **Low** | `upsert_flight_quotes` omits `is_imputed` in update clause | `src/storage/supabase_sink.py:92` |
| **SEC-27** | API / Serialization | **Medium** | `/apix/by-route` returns unaggregated 30-cell payload | `src/api/routes/apix.py:128` |
| **SEC-28** | API / Business Logic | **Medium** | `/apix/airlines` dumps raw quotes without carrier average | `src/api/routes/apix.py:184` |
| **SEC-29** | API / Data Hygiene | **Low** | `/apix/leadtime` includes sold-out and imputed rows | `src/api/routes/apix.py:273` |
| **SEC-30** | API / Consistency | **Low** | `APEx` typo across route tags and docstrings | `src/api/routes/apix.py:1` |
| **SEC-31** | Frontend / Schema | **Low** | 12-route prototype basket vs 6-route production basket | `frontend/src/lib/constants.ts:1` |
| **SEC-32** | Frontend / Architecture | **Low** | UI chart wrappers bypassed in multiple pages | `frontend/src/pages/PriceTrends.tsx:2` |
| **SEC-33** | Deployment / Image Size | **Low** | Bloated API Docker container image (>1.4 GB) | `Dockerfile:10` |
| **SEC-34** | Repository / Hygiene | **Low** | Duplicate unlinked `frontend1` workspace clutter | `frontend1/` |

---

## 2. Detailed Vulnerability Analyses by Subsystem

### 2.1 Mathematical & Statistical Index Construction

#### SEC-01: Impossible Cross-Day Match Key in Imputation
* **File Reference:** `src/cleaning/imputer.py:122-130`
* **Severity:** **Critical**
* **Description:**  
  The Jevons cell-relative imputation algorithm calculates price growth by matching the exact same flight between Day $T-1$ and Day $T$. The match key builder is implemented as:
  ```python
  def _build_flight_match_key(self, quote: dict[str, Any]) -> FlightMatchKey:
      return (
          quote["carrier_code"] or "",
          quote["flight_number"] or "",
          quote["journey_date"],
          quote["dep_time"].strftime("%H:%M") if quote["dep_time"] else "",
          quote["arr_time"].strftime("%H:%M") if quote["arr_time"] else "",
      )
  ```
* **Root Cause & Impact:**  
  For any fixed advance purchase window $W$ (e.g., $T+7$):
  - On observation date $T$, the scheduled departure is $T+7$.
  - On observation date $T-1$, the scheduled departure was $(T-1)+7 = T+6$.
  
  Because calendar departure dates across consecutive scrape dates **never match** for the same advance window, `set(current_prices) & set(prior_prices)` is **always empty ($\emptyset$)**. Cell-relative Jevons growth factor calculation fails on $100\%$ of runs, silently falling back to route-level or national-level averages.  
  *(Additionally, the `FlightMatchKey` type annotation specifies a 6-element tuple, but the function returns a 5-element tuple).*
* **Remediation:**  
  Remove `quote["journey_date"]` from `_build_flight_match_key()` and match flight schedules on `(carrier_code, flight_number, dep_time, arr_time)`.

---

#### SEC-02: 8-Row Truncation & Unweighted Headline Index in `/apix/latest`
* **File Reference:** `src/api/routes/apix.py:48-71`
* **Severity:** **Critical**
* **Description:**  
  The headline indicator endpoint queries Supabase PostgREST:
  ```python
  data = await _proxy_get(
      client,
      "airfare_price_index",
      {
          "select": "date,index_value,route_weight,advance_window_weight",
          "source_portal": f"eq.{portal}",
          "order": "date.desc",
          "limit": 8,
      },
  )
  current = sum(
      row["index_value"] * row["route_weight"] * row["advance_window_weight"]
      for row in data
      if row["index_value"] is not None ...
  )
  ```
* **Root Cause & Impact:**  
  Each observation date consists of $6 \text{ routes} \times 5 \text{ windows} = 30\text{ cell records}$. Querying with `limit: 8` returns only 8 arbitrary cell rows out of the 30. The summation sums only 8 cell contributions without dividing by the sum of weights ($\sum w_i < 0.3$). The calculated `current_index` returns $\sim 25\text{--}30$ instead of the true index value ($\sim 100.0$), severely corrupting the headline figure across the dashboard.
* **Remediation:**  
  Query the single latest date first, fetch all 30 cell records for that date, and compute the normalized weighted Laspeyres aggregate:
  $$\text{APIx}_t = \frac{\sum (\text{index\_value} \times \text{cell\_weight})}{\sum \text{cell\_weight}}$$

---

#### SEC-08: Permanent Partial Base-Period Calibration Lockout
* **File Reference:** `src/indexing/base_calibrator.py:209-231`
* **Severity:** **High**
* **Description:**  
  `ensure_base_period()` tests:
  ```python
  SELECT 1 FROM base_period_prices WHERE source_portal = $1 LIMIT 1
  ```
* **Root Cause & Impact:**  
  If the very first ingestion run captures only 20 of the 30 cells due to network throttling, only 20 rows are calibrated. On subsequent runs, `has_base_period` returns `True`. The missing 10 cells are never calibrated and are skipped by `compute_cell_indices()` indefinitely.
* **Remediation:**  
  Check base period completeness against expected cells, or upsert missing cells dynamically with `ON CONFLICT DO NOTHING`.

---

#### SEC-20: Unvalidated Advance-Window Weight Model
* **File Reference:** `METHODOLOGY.md:102-106`, `config/routes_weights.json:46`
* **Severity:** **Medium**
* **Description:**  
  Equal weights ($0.20$ for each window $T+1, T+7, T+15, T+30, T+45$) are applied in the database without empirical passenger booking distribution justification.
* **Root Cause & Impact:**  
  While computationally functional, the lack of empirical calibration for lead-time weights leaves the CPI augmentation methodology vulnerable to methodological critique by NSO/RBI economists.
* **Remediation:**  
  Document the booking curve weight justification in `METHODOLOGY.md` and support dynamic weight recalibration.

---

#### SEC-21: Sparse-Day Route Weight Inflation Trap
* **Location:** `src/indexing/jevons.py:127-129`
* **Severity:** **Medium**
* **Description:**  
  `compute_cell_indices()` normalizes by `total_weight` of present cells:
  ```python
  overall = weighted_sum / total_weight if total_weight > 0 else 0.0
  ```
* **Root Cause & Impact:**  
  If 5 routes fail and only 1 route ($w=0.10$) is scraped, dividing by $0.10$ inflates that single route to $100\%$ of the national index without emitting a data-quality coverage warning.
* **Remediation:**  
  Flag an `insufficient_coverage` warning if $\sum \text{weight} < 0.70$.

---

### 2.2 Ingestion Engine, Concurrency & Date-Drift

#### SEC-03: UTC vs. IST Date Truncation Breaking Scheduled Runs
* **File Reference:** `src/ingestion/interceptors/base.py:108` vs `main.py:112`
* **Severity:** **Critical**
* **Description:**  
  `FlightData.to_quote_dict()` converts capture timestamps to UTC:
  ```python
  scraping_dt = datetime.fromtimestamp(self.capture_timestamp, tz=UTC)
  ```
  In PostgreSQL DDL, `booking_date` is a stored generated column:
  ```sql
  booking_date DATE GENERATED ALWAYS AS (scraping_date_time::date) STORED
  ```
* **Root Cause & Impact:**  
  Supabase cloud poolers evaluate `::date` in UTC. For pipeline runs scheduled between **00:00 IST and 05:30 IST** (e.g., the 02:00 AM IST daily cron), UTC time is $20:30$ of the previous calendar day. PostgreSQL stores `booking_date` as $D-1$.  
  Downstream, `main.py` evaluates `observation_date = datetime.now(IST).date()` ($D$) and runs:
  `WHERE booking_date = $1` with date $D$.  
  The query finds **0 records**. Imputation, Truth Triangle, and Laspeyres Index computation are silently skipped for that day.
* **Remediation:**  
  Generate `scraping_date_time` using `ZoneInfo("Asia/Kolkata")` and update PostgreSQL DDL to `(scraping_date_time AT TIME ZONE 'Asia/Kolkata')::date`.

---

#### SEC-04: `base_date` Bypass & Midnight Race Drift
* **File Reference:** `src/ingestion/interceptors/ixigo.py:530-534, 692-696`, `src/ingestion/interceptors/google_flights.py:392`
* **Severity:** **High**
* **Description:**  
  `QueryBuilder.generate_search_matrix(base_date)` generates parametric departure dates based on the passed `base_date`. However, both interceptors override this:
  ```python
  if advance_window > 0:
      dep_date = datetime.now() + timedelta(days=advance_window)
      leave = dep_date.strftime("%d%m%Y")
  else:
      leave = departure_date
  ```
* **Root Cause & Impact:**  
  1. Passing `base_date` to `run_fetch()` for backtesting has no effect because interceptors re-calculate dates from wall-clock time.
  2. If an ingestion cycle begins at `23:55` and crosses midnight, queries before midnight search for day $D+W$, while queries after midnight search for $(D+1)+W$, creating an inconsistent multi-date matrix.
* **Remediation:**  
  Consume `query["departure_date"]` directly and format it for the portal without re-calling `datetime.now()`.

---

#### SEC-15: Monolithic In-Memory Fetch Buffer
* **File Reference:** `src/ingestion/async_fetcher.py:350-368`
* **Severity:** **Medium**
* **Description:**  
  `AsyncFetcher` buffers quote records in memory across both sources and only executes `_flush_quotes()` after all 60 searches complete.
* **Root Cause & Impact:**  
  If Google Flights crashes in loop 2, all flights collected from Ixigo in loop 1 are lost.
* **Remediation:**  
  Flush quotes to `SupabaseSink` immediately after each source finishes its matrix.

---

#### SEC-22: `ARIA_LABEL_PATTERN` Regex Fragility
* **File Reference:** `src/ingestion/interceptors/google_flights.py:38-43`
* **Severity:** **Medium**
* **Description:**  
  Regex strictly requires `round trip total\.`:
  ```python
  ARIA_LABEL_PATTERN = re.compile(
      r"From ([\d,]+) Indian rupees round trip total\. "
      r"(.+?) flight with (.+?)\. " ...
  )
  ```
* **Root Cause & Impact:**  
  When Google Flights renders one-way searches as `"one way total."` or omits the phrase, the regex fails to match, extracting 0 flights.
* **Remediation:**  
  Update regex to `r"From ([\d,]+) Indian rupees (?:round trip total|one way total)?\.?"`.

---

#### SEC-23: Unhandled Time String Crash in `FlightData.to_quote_dict`
* **File Reference:** `src/ingestion/interceptors/google_flights.py:377` vs `base.py:96`
* **Severity:** **Medium**
* **Description:**  
  If `_parse_time_str()` fails to parse a time format, it returns the raw string. `FlightData.to_quote_dict()` calls `dtime.fromisoformat()`, which throws `ValueError` on 12-hour strings like `'1:00 PM'`.
* **Remediation:**  
  Wrap `dtime.fromisoformat()` in a try/except with 12-hour/24-hour fallback parsing.

---

#### SEC-24: Non-Atomic SessionStore JSON File Writes
* **File Reference:** `src/ingestion/session_store.py:108-111`
* **Severity:** **Low**
* **Description:**  
  `SessionStore._save()` writes directly to `storage/tokens.json`. Concurrent async tasks or process interruptions can leave the file truncated or corrupted.
* **Remediation:**  
  Use atomic write-and-rename (`tempfile` $\to$ `os.replace`).

---

#### SEC-18: Compliance Guard Unconditional Research Exemption
* **File Reference:** `src/ingestion/compliance.py:158-165`
* **Severity:** **Low**
* **Description:**  
  `ComplianceGuard.can_fetch()` logs a warning if blocked by `robots.txt`, but unconditionally returns `True`.
* **Remediation:**  
  Make research exemption configurable via an explicit environment flag (`ENABLE_RESEARCH_EXEMPTION=true`).

---

#### SEC-19: `newly_calibrated` Boolean Inversion in Pipeline Result
* **File Reference:** `src/indexing/pipeline.py:79-83`
* **Severity:** **Low**
* **Description:**  
  `ensure_base_period()` returns `True` whether the base period was pre-existing or freshly calibrated. In `pipeline.py`:
  ```python
  calibration_result = await self.calibrator.ensure_base_period(source_portal, observation_date)
  calibrated = not calibration_result  # Evaluates to: not True => False
  ```
* **Root Cause & Impact:**  
  `PipelineResult.calibration["newly_calibrated"]` is permanently reported as `False` even on Day 0 base calibration.
* **Remediation:**  
  Have `ensure_base_period()` return a tuple `(has_base: bool, was_created: bool)`.

---

### 2.3 Database Schema, DDL & PostgreSQL Views

#### SEC-05: `view_route_leadtime_elasticity` Omits `source_portal`
* **File Reference:** `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md:413-432`, `src/api/routes/apix.py:168-179`
* **Severity:** **High**
* **Description:**  
  The PostgreSQL view definition joins on `a.source_portal = b.source_portal` but omits `a.source_portal` from the `SELECT` list:
  ```sql
  CREATE OR REPLACE VIEW view_route_leadtime_elasticity AS
  SELECT
    a.origin, a.destination, a.advance_windows, a.date,
    a.index_value AS current_index, b.index_value AS previous_index,
    ...
  FROM airfare_price_index a LEFT JOIN airfare_price_index b ...
  ```
* **Root Cause & Impact:**  
  PostgREST cannot filter by `source_portal`. `/api/v1/apix/elasticity` omits the filter, returning interleaved duplicate records from both Ixigo and Google Flights.
* **Remediation:**  
  Add `a.source_portal` to the view `SELECT` list and add `"source_portal": f"eq.{portal}"` in `src/api/routes/apix.py`.

---

#### SEC-06: Flawed Primary Key in `base_period_prices`
* **File Reference:** `src/storage/supabase_sink.py:209`, `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md:356`
* **Severity:** **High**
* **Description:**  
  The primary key is defined as:
  ```sql
  PRIMARY KEY (source_portal, journey_date, origin, destination, advance_windows)
  ```
* **Root Cause & Impact:**  
  Base period prices represent reference costs per cell `(origin, dest, window)`. If base calibration is ever re-run on a different date, `journey_date` changes ($D_1 + W \neq D_0 + W$), causing `ON CONFLICT` not to match. Duplicate rows accumulate, leading to non-deterministic pricing when loaded by `BaseCalibrator.load_base_prices()`.
* **Remediation:**  
  Change the primary key constraint to `(source_portal, origin, destination, advance_windows)`.

---

#### SEC-07: PostgreSQL `NULL != NULL` Unique Index Quote Leak
* **File Reference:** `src/storage/supabase_sink.py:89-92`
* **Severity:** **High**
* **Description:**  
  The `flight_quotes` unique constraint is defined across:
  ```sql
  CONSTRAINT unique_flight_quote UNIQUE (
    journey_date, origin, destination, carrier_code, flight_number,
    journey_class, total_fare, source_portal, advance_windows, is_sold_out
  )
  ```
* **Root Cause & Impact:**  
  Under standard SQL and PostgreSQL semantics, `NULL != NULL`. When Google Flights encounters unknown airlines (`carrier_code = NULL`), `ON CONFLICT DO UPDATE` will not match existing rows. Duplicate quotes accumulate on every run.
* **Remediation:**  
  Enforce `COALESCE(carrier_code, 'UNKNOWN')` on ingestion or deploy the PostgreSQL 15+ `UNIQUE NULLS NOT DISTINCT` constraint clause.

---

#### SEC-25: `view_apix_weekly` & `view_apix_monthly` Meaningless Raw Fare Sum
* **File Reference:** `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md:394-408`
* **Severity:** **Medium**
* **Description:**  
  `SUM(fare) AS total_fare` sums 210 cell prices ($\approx 1,260,000\text{ INR}$), which is mathematically meaningless.
* **Remediation:**  
  Replace with `AVG(fare) AS avg_fare` or weighted average fare.

---

#### SEC-26: `upsert_flight_quotes` Omits `is_imputed` in Update Clause
* **File Reference:** `src/storage/supabase_sink.py:92-103`
* **Severity:** **Low**
* **Description:**  
  The `DO UPDATE SET` clause does not update `is_imputed = EXCLUDED.is_imputed`. If an imputed row is superseded by an observed quote, `is_imputed` remains `TRUE`.
* **Remediation:**  
  Add `is_imputed = EXCLUDED.is_imputed` to `DO UPDATE SET`.

---

### 2.4 FastAPI Proxy Layer & Data Contracts

#### SEC-12: PostgREST 1,000-Row Default Limit Truncation in `/apix/series`
* **File Reference:** `src/api/routes/apix.py:230`
* **Severity:** **Medium**
* **Description:**  
  `GET /airfare_price_index` requests without an explicit `limit` parameter are capped at PostgREST's default max rows (1,000).
* **Root Cause & Impact:**  
  A 60-day historical query produces $30\text{ cells/day} \times 60\text{ days} = 1,800\text{ rows}$. PostgREST returns only the first 1,000 rows, silently truncating the historical time series in charts.
* **Remediation:**  
  Pass `limit=10000` to the upstream PostgREST request.

---

#### SEC-13: Heavy 4,000-Row Unindexed Query in `/admin/metadata`
* **File Reference:** `src/api/routes/health.py:75-79`
* **Severity:** **Medium**
* **Description:**  
  `/admin/metadata` fetches 4,000 raw quote rows over HTTP on every request to extract carrier codes.
* **Root Cause & Impact:**  
  Transfers hundreds of kilobytes of unindexed quote data on every page load, introducing $500\text{ms--}1500\text{ms}$ latency to frontend initialization.
* **Remediation:**  
  Query distinct carrier codes via a database view or serve from the curated `routes_weights.json` registry.

---

#### SEC-27: `/apix/by-route` Returns Unaggregated 30-Row Payload
* **File Reference:** `src/api/routes/apix.py:128`
* **Severity:** **Medium**
* **Description:**  
  Returns 30 cell records for a date without indicating `advance_windows` or aggregating across windows per route.
* **Remediation:**  
  Group by `origin, destination` and return average route fare and index.

---

#### SEC-28: `/apix/airlines` Missing Average Aggregation
* **File Reference:** `src/api/routes/apix.py:184-203`
* **Severity:** **Medium**
* **Description:**  
  Documented as "Average fare per airline", but performs no `GROUP BY` or average aggregation—it dumps raw individual `flight_quotes` rows.
* **Remediation:**  
  Compute average fare per carrier in Python or via database aggregation.

---

#### SEC-29: `/apix/leadtime` Includes Sold-Out and Imputed Quotes
* **File Reference:** `src/api/routes/apix.py:273-282`
* **Severity:** **Low**
* **Description:**  
  Does not filter out `is_sold_out` or `is_imputed` quotes, skewing lead-time elasticity statistics with synthetic prices.
* **Remediation:**  
  Add `is_sold_out=eq.false&is_imputed=eq.false` to PostgREST parameters.

---

#### SEC-30: `APEx` Typo Across API Route Tags and Docstrings
* **File Reference:** `src/api/routes/apix.py:1`, `frontend/src/pages/ApiDocs.tsx:30`
* **Severity:** **Low**
* **Description:**  
  Several docstrings and UI tags label endpoints as `APEx` instead of the canonical `APIx`.
* **Remediation:**  
  Standardize naming to `APIx`.

---

### 2.5 Frontend State Management & Visualizations

#### SEC-09: Dropdown "All India" & "All Airlines" Disappearing Bug
* **File Reference:** `src/api/routes/health.py:96-107`, `frontend/src/hooks/useMetadata.ts:27-28`
* **Severity:** **High**
* **Description:**  
  The frontend initializes with static lists containing `{ code: 'ALL', label: 'All India' }` and `{ code: 'ALL', label: 'All Airlines' }`. When `useMetadata()` calls `/admin/metadata`, the backend returns only the specific 6 routes and active airlines from the database (without `'ALL'`).  
* **Root Cause & Impact:**  
  `setRoutes(res.data.routes)` overwrites the options. As soon as metadata loads, the "All India" and "All Airlines" options **vanish from all dropdowns**, locking users into specific filters.
* **Remediation:**  
  Ensure `/admin/metadata` or `useMetadata.ts` prepends `{ code: 'ALL', label: 'All India' }` and `{ code: 'ALL', label: 'All Airlines' }`.

---

#### SEC-10: 100× Route Contribution Scale Error in Live Mode
* **File Reference:** `frontend/src/lib/build/provider.ts:222`
* **Severity:** **High**
* **Description:**  
  In `getRouteIntel()`, route contribution is calculated as:
  ```typescript
  contribution: Math.round(r.index * (r.weight / 100) * 100) / 100
  ```
* **Root Cause & Impact:**  
  In the database, `route_weight` is already stored as a decimal fraction (e.g. `0.28` for $28\%$). Dividing by 100 makes it `0.0028`, producing a contribution of $0.28$ instead of $28.0$.
* **Remediation:**  
  Change formula to:
  ```typescript
  contribution: Math.round(r.index * r.weight * 100) / 100
  ```

---

#### SEC-11: Route Table 30-Row Duplication Explosion
* **File Reference:** `frontend/src/lib/build/provider.ts:190-203`
* **Severity:** **Medium**
* **Description:**  
  `getRouteTable()` maps rows from `/apix/by-route` directly to table rows.
* **Root Cause & Impact:**  
  `/apix/by-route` returns all 30 cell rows for a date (6 routes $\times$ 5 windows). Because no grouping is performed, the table displays 30 rows (5 duplicate entries per route) with identical route names.
* **Remediation:**  
  Aggregate cell records by route (`origin–destination`), averaging fares and index values across advance purchase windows.

---

#### SEC-16: Negative Array Index Underflow on Short Histories
* **File Reference:** `frontend/src/pages/AirfareIndex.tsx:116-118`, `Home.tsx:77-79`
* **Severity:** **Medium**
* **Description:**  
  `daily[daily.length - 8]` evaluates to `undefined` when data has fewer than 8 observations, falling back to `latest` and falsely reporting `0.0%` price change instead of `"N/A"`.
* **Remediation:**  
  Add array length bounds checking and render `"N/A"` if history is insufficient.

---

#### SEC-17: Orphaned Heatmap & `NaN` Color Scale Divide
* **File Reference:** `frontend/src/components/charts/Heatmap.tsx:27-36`
* **Severity:** **Low**
* **Description:**  
  `Heatmap.tsx` is implemented but unmounted on all dashboard pages. When `data` is empty or all values are equal ($100.0$), `(maxValue - minValue) = 0`, producing `NaN` in `getColor()`.
* **Remediation:**  
  Add `(maxValue === minValue) ? 0.5 : ratio` guard and wire `Heatmap` into `AirfareIndex.tsx`.

---

#### SEC-31: 12-Route Prototype vs 6-Route Production Basket Mismatch
* **File Reference:** `frontend/src/lib/constants.ts:1-15` vs `config/routes_weights.json`
* **Severity:** **Low**
* **Description:**  
  `constants.ts` defines 12 routes with non-DGCA prototype weights (e.g. `DEL-BOM: 18.4`, `BOM-DEL: 8.2`), whereas the production basket and database schema strictly track 6 directional sectors (`DEL-BOM: 0.28`, `DEL-BLR: 0.20`, etc.).
* **Remediation:**  
  Align `constants.ts` baseline route list with the 6 DGCA production sectors.

---

#### SEC-32: Unused UI Chart Wrappers Bypassed in Pages
* **File Reference:** `frontend/src/components/charts/BarChart.tsx`, `ComposedChart.tsx`, `LineChart.tsx`
* **Severity:** **Low**
* **Description:**  
  Dashboard pages bypass custom chart primitives and import raw Recharts components directly, causing code duplication.
* **Remediation:**  
  Refactor pages to use the design system chart wrappers.

---

### 2.6 Infrastructure, Docker & Deployment

#### SEC-14: Render Blueprint Dockerfile Path Mismatch
* **File Reference:** `render.yaml:7` vs Root Directory
* **Severity:** **High**
* **Description:**  
  `render.yaml` specifies `dockerfilePath: ./api.Dockerfile`, but the file is named `Dockerfile`. Deployments on Render fail with `File not found: ./api.Dockerfile`.
* **Remediation:**  
  Rename `Dockerfile` to `api.Dockerfile` (or update `render.yaml`).

---

#### SEC-33: Bloated 1.5 GB API Container Image
* **File Reference:** `Dockerfile:10-11`
* **Severity:** **Low**
* **Description:**  
  Installs full `requirements.txt` (Playwright, PyData stack) for a lightweight FastAPI PostgREST wrapper.
* **Remediation:**  
  Create a dedicated `requirements-api.txt` containing only `fastapi`, `uvicorn`, `httpx`, `pydantic-settings`, and `slowapi`.

---

#### SEC-34: Duplicate `frontend1` Workspace Clutter
* **File Reference:** `frontend1/`
* **Severity:** **Low**
* **Description:**  
  An unlinked TanStack Start / Lovable workspace exists alongside `frontend/`, causing maintenance confusion.
* **Remediation:**  
  Archive or document `frontend1/` as an experimental prototype.

---

## 3. Step-by-Step Remediation Plan & Execution Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            REMEDIATION ROADMAP                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Statistical & Core Ingestion Fixes (SEC-01, SEC-03, SEC-04)       │
│  - Fix imputer match key (remove journey_date)                              │
│  - Enforce Asia/Kolkata timezone in FlightData & booking_date DDL           │
│  - Use departure_date directly from query matrix in interceptors            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 2: Database & Calibration Integrity (SEC-05, SEC-06, SEC-07, SEC-08) │
│  - Add source_portal to view_route_leadtime_elasticity                      │
│  - Fix base_period_prices primary key (remove journey_date)                 │
│  - Fix base period calibration per-cell completeness                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 3: API Proxy & Performance Fixes (SEC-02, SEC-12, SEC-13)            │
│  - Rewrite /apix/latest with single-date query & normalized Laspeyres sum   │
│  - Add limit=10000 to /apix/series PostgREST proxy                          │
│  - Optimize /admin/metadata carrier resolution                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 4: Frontend State & Cartography Polish (SEC-09, SEC-10, SEC-11, 16) │
│  - Retain 'ALL' options in useMetadata hook                                 │
│  - Fix route contribution scale and group /apix/by-route rows               │
│  - Add bounds checking for short historical series                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 5: Infrastructure & Deployment Sync (SEC-14, SEC-15)                 │
│  - Sync Dockerfile naming with render.yaml                                  │
│  - Implement per-source batch flushes in async_fetcher                      │
└─────────────────────────────────────────────────────────────────────────────┘
```
