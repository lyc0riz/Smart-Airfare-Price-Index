# APIx Methodology — Index Construction

This document is the **single authoritative reference for the logical / mathematical**
architecture of the Real-Time Airfare Price Index (APIx). It consolidates the index
formulas, the cell/weight model, imputation, cross-source validation, and interpretation
that are otherwise scattered across `ROADMAP.md`, `docs/workflow.md`, and
`docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md`.

It describes **what is implemented** in the source tree (chiefly `src/indexing/*` and
`src/cleaning/imputer.py`). Design justifications are included only where they follow
directly from the code.

---

## 1. What the APIx Index Is

APIx is a price index for air tickets on a fixed basket of Indian domestic routes,
measured in near real time from live portal data. It is designed to augment the
Consumer Price Index (CPI) by capturing airfare dynamics that manual collection misses:

- Fares vary **200–400% within a single day** (dynamic pricing), so a manually sampled
  point-in-time price is not representative.
- Over **90% of tickets are sold online**, so portal-sourced fares are a representative
  sample of the transaction price.

APIx is constructed in four stages, matching the module layout:

1. **Calibrate** a base period (`BaseCalibrator`) from the first scrape date.
2. **Aggregate** raw fares into elementary cell prices (`Jevons` geometric mean).
3. **Index** each cell relative to its base period and weight it (`Laspeyres`).
4. **Upsert** the results into `airfare_price_index` for API consumption.

---

## 2. The Index Cell

The fundamental unit of the index is the **cell**:

```
CellKey = (origin, destination, advance_windows)
```

- `origin` / `destination`: IATA 3-letter airport codes.
- `advance_windows`: integer days between the scrape date (`booking_date`) and the
  scheduled departure date (`journey_date`).

Source: `CellKey = tuple[str, str, int]` in `src/indexing/jevons.py:16`.

Every quote in `flight_quotes` belongs to exactly one cell. All aggregation, imputation,
base-period calibration, and Laspeyres weighting operate on cells.

---

## 3. Route Basket (DGCA)

The route basket is a fixed set of 6 high-traffic domestic routes from
`config/routes_weights.json`, with weights summing to **1.0**:

| Route | Weight | Origin | Destination |
|-------|--------|--------|-------------|
| DEL-BOM | 0.28 | Delhi | Mumbai |
| DEL-BLR | 0.20 | Delhi | Bengaluru |
| BOM-BLR | 0.16 | Mumbai | Bengaluru |
| DEL-CCU | 0.14 | Delhi | Kolkata |
| BLR-HYD | 0.12 | Bengaluru | Hyderabad |
| MAA-DEL | 0.10 | Chennai | Delhi |

The weights are stored in the `route_weights` table (PK `(origin, destination)`) and loaded
by `BaseCalibrator.load_weights()`.

---

## 4. Advance Purchase Windows

Queries are generated for 5 discrete advance purchase windows:

```
advance_windows_days = [1, 7, 15, 30, 45]
```

Each window is an **advance window** — the number of days a ticket is bought before departure.
Weights for these windows live in `advance_window_weights` (PK `(source_portal, advance_window)`).

> **TODO:** The derivation of the advance window weights is **not yet documented**. They are
> loaded by the pipeline (`BaseCalibrator.load_weights()`) and used in the Laspeyres
> aggregation, but their values are not yet justified by booking-distribution data. This is a
> known open item (see §15).

---

## 5. The Query Matrix

`QueryBuilder.generate_search_matrix()` (in `src/ingestion/query_builder.py:96`) produces the
full search matrix for a scrape cycle:

```
6 routes × 5 advance windows = 30 parametric queries
```

Each query carries an Ixigo search payload: `origin`, `destination`, `leave` (departure date
`%d%m%Y`), `class: "e"` (economy), and `version: "2.0"`. The departure date per query is the
scrape base date + the advance window:

```
departure_date = D0 + advance_window
```

Source/count: AGENTS.md ("60 total fetches per cycle" across the two target portals).

---

## 6. Elementary Aggregates — Jevons (Geometric Mean)

Within each cell, the multiple observed fares are collapsed to a single elementary price using
the **Jevons geometric mean**:

```
G = exp( ( Σ ln(p_i) ) / n )
```

Implemented as `geometric_mean()` in `src/indexing/jevons.py:19-31`:

```python
def geometric_mean(prices):
    positive = [p for p in prices if p > 0]
    if not positive:
        return 0.0
    return exp(sum(log(p) for p in positive) / len(positive))
```

`BaseCalibrator.aggregate_jevons()` (in `src/indexing/base_calibrator.py:85`) groups quotes by
`(origin, destination, advance_windows)` and returns one Jevons value per cell for a given
`booking_date` (scrape date).

**Price basis:** The Jevons aggregate uses `total_fare`. Both configured sources currently
lack tax decomposition (rule **N5** / **N11**), so `base_fare = total_fare`, `taxes = 0`, and
`total_fare` is the only consistently populated price measure.

**What is excluded:** `fetch_daily_quotes()` filters out imputed rows, sold-out rows, and
non-positive fares before aggregation (see `base_calibrator.py:69-83`).

---

## 7. Base Period Calibration

The index is a **chain-base-100 price index**: the base period is set to the **first scrape
date** of the dataset, not a fixed calendar year.

`BaseCalibrator.ensure_base_period()` / `calibrate()` (in `src/indexing/base_calibrator.py:163`)
take the Jevons aggregates of the first scrape date and write them to `base_period_prices`
(PK `(source_portal, journey_date, origin, destination, advance_windows)`).

Consequence: on the first run the index is **100 by construction** for every cell:

```
relative_index_base = (P_0 / P_0) × 100 = 100
```

`ensure_base_period()` only calibrates if no base prices exist yet for that portal; subsequent
runs reuse the stored base period. This prevents base-period drift after the first scrape.

---

## 8. Weighted Index — Laspeyres

The per-cell **relative index** and the **overall APIx** are computed in
`compute_cell_indices()` (`src/indexing/jevons.py:73-130`) and exposed via
`LaspeyresEngine` (`src/indexing/laspeyres_engine.py`).

### 8.1 Per-cell relative index

```
relative_index_c,t = (P_c,t / P_c,0) × 100
contribution_c,t = route_weight_c × advance_window_weight_c × relative_index_c,t
```

- `P_c,t` = current Jevons aggregate (today).
- `P_c,0` = base period fare (from `base_period_prices`).
- Cells missing a base price or a weight are skipped.

### 8.2 Overall APIx

The overall index is the **weight-normalized** sum of cell contributions:

```
APIx_t = Σ(contribution_c,t) / Σ(route_weight_c × advance_window_weight_c)
```

implemented in `compute_cell_indices()` (`jevons.py:127-129`) and
`compute_overall_apix()` (`jevons.py:133-141`).

Normalizing by `Σ(cell_weight)` (rather than the fixed sum of all weights = 1.0) means the
denominator reflects **only the cells that are actually present on a given day**, so days with
sparse cell coverage are not penalized for missing cells.

### 8.3 Per-portal indices

The index is computed **separately per source portal**. `run_all_portals()` in
`src/indexing/pipeline.py:190` iterates `['Ixigo', 'Google Flights']`, and each result row in
`airfare_price_index` is keyed by `(date, origin, destination, advance_windows,
source_portal)`. There is **no cross-source blending** — Ixigo and Google Flights each yield a
distinct APIx series.

---

## 9. Weekly / Monthly Aggregation

The `view_apix_weekly` and `view_apix_monthly` views aggregate the **per-cell index_value**
to a portal-level period number, normalized by total cell weight so the result is on the same
scale as the daily APIx:

```
apix_period = Σ(index_value × cell_weight) / Σ(cell_weight)
```

where `cell_weight = route_weight × advance_window_weight` (a stored generated column on
`airfare_price_index`).

> **Note:** These views are defined with the `SECURITY DEFINER` property (pre-existing). See
> §15 for implications.

---

## 10. Imputation — Jevons Cell-Relative Method

When a cell has no available quotes or all quotes are sold out on the observation date, the
price is **imputed** rather than dropped, so the cell still contributes to the index.
Implemented in `src/cleaning/imputer.py`.

### 10.1 Growth factor

For flights present on **both** the prior day and the current day (matched on a flight key:
carrier, flight number, journey date, departure time, arrival time), the cell-relative
**growth factor** is the ratio of Jevons geometric means:

```
R_c,t = G(p_t) / G(p_t-1)
```

implemented as `compute_growth_factor()` (`imputer.py:46-74`). Only matched flights are used,
so the ratio isolates price movement of the same flights rather than a change in flight mix.

### 10.2 Imputation

The missing price is the prior-day cell price scaled by the growth factor:

```
p_missing,t = base_price × R_c,t
```

where `base_price` is the geometric mean of the prior day's fares in that cell
(`imputer.py:287`). Imputed rows are written back to `flight_quotes` with `is_imputed = TRUE`
and a synthetic `IMP-{origin}-{destination}-{window}` flight number (`imputer.py:300-327`).
They are **excluded** from later Jevons aggregation (`base_calibrator.py:76`).

### 10.3 Hierarchical fallback

If a cell has no matched flights, the growth factor falls back through:

```
cell-level → route-level → national-level → last known price (growth = 1.0)
```

- **route-level:** geometric mean of all fares on the route across windows
  (`_get_route_growth`, `imputer.py:184`).
- **national-level:** geometric mean of all fares across all routes
  (`_get_national_growth`, `imputer.py:211`).
- **none:** growth = 1.0 (price carried forward).

---

## 11. Cross-Source Validation — Truth Triangle

`src/validation/truth_triangle.py` validates fares between the two sources
(Ixigo = primary, Google Flights = secondary).

**Match key** (6 fields, `flight_number` deliberately excluded because Google Flights uses
synthetic `GF-*` IDs):

```
(journey_date, origin, destination, carrier_code, departure_time, arrival_time)
```

**Parity rule** (default tolerance 1%):

- `|primary − secondary| / min(primary, secondary) ≤ 1%` → accept both.
- `> 1%` → flag in the audit log and prefer the **primary** (Ixigo) value.

Per-flight representative price = the **minimum** `total_fare` per match key (multiple fare
buckets may exist per flight). Imputed and sold-out rows are excluded
(`truth_triangle.py:186-190`).

---

## 12. Data Normalization (Summary)

The 11 normalization rules (full detail in
`docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` §3) govern how raw portal data becomes clean quotes:

| Rule | Effect on index logic |
|------|-----------------------|
| **N5/N11** | No tax decomposition → index uses **total fare** (not core fare). |
| **N7** | Google Flights round-trip totals treated as one-way (search is one-way). |
| **N10** | Synthetic `GF-{code}-{dep}-{arr}` flight numbers to disambiguate quotes. |
| **N9** | `data_hash` = SHA-256 composite key for dedup. |

---

## 13. Interpreting the Index

- **APIx = 100** means the average fare level on the observation date equals the base-period
  fare level (first scrape date).
- **APIx > 100**: fares are above the base period (e.g., 105 means +5% from base).
- **APIx < 100**: fares are below the base period.
- **Period-over-period change**: `(APIx_t / APIx_{t-1} − 1) × 100`.

Daily values come directly from `airfare_price_index.index_value` (per cell) and the overall
daily APIx. Weekly / monthly values come from the normalized views (§9).

---

## 14. Data Flow (End-to-End)

```
QueryBuilder ──30 queries×2 portals──► AsyncFetcher
        ──► Ixigo interceptor (SSE) ─┐
        ──► Google Flights interceptor┘
        ──► flight_quotes (upsert)
        ──► Imputation (sold-out/missing cells, is_imputed=TRUE)
        ──► Truth Triangle (parity check, audit log)
        ──► BaseCalibrator.ensure_base_period()  [first run only]
        ──► Jevons aggregates  per cell
        ──► Laspeyres compute_cell_indices → overall APIx
        ──► airfare_price_index (upsert)
```

See `docs/workflow.md` §2 for the ASCII flow diagram.

---

## 15. Known Limitations & Open Items

1. **No tax decomposition (N5/N11).** Both sources expose only `total_fare`; `base_fare`,
   `fees`, `tax_udf/asf/gst`, and the generated `core_fare` are effectively 0. The index runs
   on **total fare**.
2. **Advance window weights are TODO.** Their values exist in `advance_window_weights` but their
   derivation is not yet documented (no booking-distribution calibration yet).
3. **`SECURITY DEFINER` views.** `view_apix_weekly`, `view_apix_monthly`, and
   `view_route_leadtime_elasticity` run with the owner's privileges rather than the querying
   user's. Independent of RLS on the base tables.
4. **No seasonal adjustment.** The index is not deseasonalized; travel-demand seasonality
   (festivals, holidays) will show as level shifts.
5. **Per-portal series.** There is no single combined APIx across portals — each portal has its
   own series; no reconciliation/averaging step is implemented beyond the Truth Triangle audit.
6. **Base period is fixed to the first scrape date.** It is not rebased periodically and has no
   scheduled recalibration policy.

---

## Cross-References

- Index code: `src/indexing/jevons.py`, `base_calibrator.py`, `laspeyres_engine.py`, `pipeline.py`
- Imputation: `src/cleaning/imputer.py`
- Validation: `src/validation/truth_triangle.py`
- Schema/DDL: `docs/DATA_SCHEMA_AND_EXTRACTION_SPEC.md` (§2.3, §3, §8)
- Pipeline overview: `docs/workflow.md`
- Implementation phases: `ROADMAP.md`
- API access: `API_Design.md`
