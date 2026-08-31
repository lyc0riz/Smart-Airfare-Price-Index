# APIx Real-Time Airfare Price Index — API Design & Reference

The APIx API is a **thin FastAPI wrapper** over Supabase **PostgREST**. It adds:
authentication (API-key → scope), rate limiting, CORS, and a consistent response
envelope on top of the auto-generated PostgreSQL REST endpoints.

**Live base URL:** `https://smart-airfare-price-index.onrender.com`
**Interactive docs (Swagger UI):** `https://smart-airfare-price-index.onrender.com/docs`
**OpenAPI JSON:** `https://smart-airfare-price-index.onrender.com/openapi.json`

All routes are prefixed with `/api/v1`.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Rate Limiting](#2-rate-limiting)
3. [Response Envelope](#3-response-envelope)
4. [Error Handling](#4-error-handling)
5. [Query Parameters & Filters](#5-query-parameters--filters)
6. [Endpoints](#6-endpoints)
   - [`GET /api/v1/health`](#61-health)
   - [`GET /api/v1/admin/coverage`](#62-admin-coverage)
   - [`GET /api/v1/apix/latest`](#63-apixlatest)
   - [`GET /api/v1/apix/weekly`](#64-apixweekly)
   - [`GET /api/v1/apix/monthly`](#65-apixmonthly)
   - [`GET /api/v1/apix/by-route`](#66-apixby-route)
   - [`GET /api/v1/apix/heatmap`](#67-apixheatmap)
   - [`GET /api/v1/apix/elasticity`](#68-apixelasticity)
   - [`GET /api/v1/apix/airlines`](#69-apixairlines)
7. [Common Use-Cases](#7-common-use-cases)
8. [Reference: Source Tables & Views](#8-reference-source-tables--views)

---

## 1. Authentication

Every data endpoint requires an API key sent in the **`X-API-Key`** request header.

| Header | Value | Required |
|--------|-------|----------|
| `X-API-Key` | `web-key` / `admin-key` (whatever is configured in `API_KEYS`) | Yes * |

> \* `GET /api/v1/health` does **not** require an API key.

Keys are configured server-side as a JSON object in the `API_KEYS` environment
variable (e.g. `{"web-key":"web","admin-key":"admin"}`). The **value** is the
secret sent in the header; the **label** (right-hand side) is the scope.

### Scopes

| Scope | Can access |
|-------|------------|
| `web` (any non-admin label) | All `/api/v1/apix/*` endpoints |
| `admin` | `/api/v1/apix/*` **and** `/api/v1/admin/*` |

### Examples

```bash
# Public data endpoint (needs a key)
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/weekly"

# Missing key → 401
curl "https://smart-airfare-price-index.onrender.com/api/v1/apix/weekly"

# Admin endpoint with a web-scoped key → 403
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/admin/coverage"

# Admin endpoint with an admin key → 200
curl -H "X-API-Key: YOUR_ADMIN_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/admin/coverage"
```

---

## 2. Rate Limiting

Rate limiting is applied via `slowapi`, keyed by **client IP**.

- Default: **`100 requests / minute`** per IP.
- Configurable via `RATE_LIMIT_PER_MINUTE` in `src/api/config.py` / env.
- Exceeding the limit returns **HTTP 429**.

```bash
curl -i -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/latest"
# ... repeat rapidly ...
#   429 Too Many Requests
```

---

## 3. Response Envelope

Most endpoints return:

```json
{
  "data": [ ...rows... ],
  "meta": {
    "portal": "Ixigo",
    "count": 52,
    "generated_at": "2026-08-31T09:00:00Z"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | Array of row objects from the underlying table/view |
| `meta.portal` | string | `"Ixigo"` or `"Google Flights"` source portal |
| `meta.count` | int | Number of rows in `data` |
| `meta.generated_at` | string | UTC timestamp of response generation |

Exception — `GET /api/v1/apix/latest` adds top-level convenience fields:
`current_index` and `observation_date` (see §6.3).

---

## 4. Error Handling

Errors use an RFC-7807-inspired envelope:

```json
{
  "error": {
    "code": 401,
    "message": "Missing API key",
    "type": "unauthorized"
  }
}
```

| HTTP Status | `code` | `type` | Cause |
|-------------|--------|--------|-------|
| 401 | 401 | `unauthorized` | Missing or invalid `X-API-Key` |
| 403 | 403 | `forbidden` | Valid key but wrong scope (e.g. web key on `/admin/*`) |
| 404 | 404 | `not_found` | No rows returned for the requested filter |
| 429 | 429 | `rate_limit_exceeded` | Exceeded the per-minute limit |
| 502 | 502 | `bad_gateway` | Supabase PostgREST upstream returned an error |

> **Note:** `412 Precondition Failed` may appear from PostgREST filters against
> views where a column is absent. The wrapper surfaces an upstream `502` for any
> `>= 400` PostgREST response.

---

## 5. Query Parameters & Filters

All `/apix/*` endpoints accept a `portal` query parameter:

| Param | Values | Default |
|-------|--------|---------|
| `portal` | `Ixigo`, `Google Flights` | `Ixigo` |

Because the API proxies PostgREST, filter values are passed through to Supabase
using PostgREST operators where applicable (this is internal wiring — the public
params per endpoint are documented in §6).

---

## 6. Endpoints

### 6.1 `GET /api/v1/health`

> No API key required.

Returns service + database health by pinging the `view_apix_weekly` view.

**Example**
```bash
curl "https://smart-airfare-price-index.onrender.com/api/v1/health"
```

**Response (200)**
```json
{
  "status": "ok",
  "db": "ok",
  "version": "1.0.0"
}
```

**Response (degraded, if Supabase unreachable)**
```json
{
  "status": "degraded",
  "db": "error",
  "version": "1.0.0"
}
```

---

### 6.2 `GET /api/v1/admin/coverage`

> Requires an **admin**-scoped API key.

Returns scrape coverage and imputation stats per day + portal.

**Query params**

| Param | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `limit` | int | 1–90 | 14 | Max number of (day, portal) groups returned |

**Example**
```bash
curl -H "X-API-Key: YOUR_ADMIN_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/admin/coverage?limit=7"
```

**Response (200)**
```json
{
  "data": [
    {
      "journey_date": "2026-08-31",
      "source_portal": "Ixigo",
      "quotes": 5811,
      "imputed": 0,
      "imputed_pct": 0.0
    },
    {
      "journey_date": "2026-08-31",
      "source_portal": "Google Flights",
      "quotes": 2800,
      "imputed": 12,
      "imputed_pct": 0.43
    }
  ],
  "meta": {
    "count": 2,
    "generated_at": "2026-08-31T09:10:00Z"
  }
}
```

---

### 6.3 `GET /api/v1/apix/latest`

Returns today's/recent overall APIx index history (for a sparkline) plus the
current weighted index.

**Query params**

| Param | Type | Values | Default | Description |
|-------|------|--------|---------|-------------|
| `portal` | string | `Ixigo`, `Google Flights` | `Ixigo` | Source portal |

**Example**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/latest"

# Google Flights instead
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/latest?portal=Google%20Flights"
```

**Response (200)** — note the extra `current_index` and `observation_date` fields
at the top level (in addition to `data` and `meta`):
```json
{
  "data": [
    {
      "date": "2026-08-31",
      "index_value": 101.25,
      "route_weight": 0.28,
      "advance_window_weight": 0.20
    }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 1,
    "generated_at": "2026-08-31T09:10:00Z"
  },
  "current_index": 101.25,
  "observation_date": "2026-08-31"
}
```

> `current_index` = Σ(`index_value × route_weight × advance_window_weight`) over the
> returned rows. If no rows exist for the portal, returns **404**.

---

### 6.4 `GET /api/v1/apix/weekly`

Weekly aggregated APIx from `view_apix_weekly` (`date_trunc('week', date)`).

**Query params**

| Param | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `portal` | string | `Ixigo`, `Google Flights` | `Ixigo` | Source portal |
| `limit` | int | 1–104 | 52 | Number of weeks (most recent first) |

**Example**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/weekly?limit=12"

curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/weekly?portal=Google%20Flights&limit=4"
```

**Response (200)**
```json
{
  "data": [
    {
      "week_start": "2026-08-31T00:00:00+00:00",
      "source_portal": "Ixigo",
      "apix_weekly": 1023.45,
      "total_fare": 214000.00,
      "total_base_fare": 214000.00,
      "total_base_period_fare": 210000.00
    }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 1,
    "generated_at": "2026-08-31T09:10:00Z"
  }
}
```

---

### 6.5 `GET /api/v1/apix/monthly`

Monthly aggregated APIx from `view_apix_monthly` (`date_trunc('month', date)`).

**Query params**

| Param | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `portal` | string | `Ixigo`, `Google Flights` | `Ixigo` | Source portal |
| `limit` | int | 1–120 | 24 | Number of months (most recent first) |

**Example**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/monthly?limit=6"

curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/monthly?portal=Google%20Flights&limit=3"
```

**Response (200)**
```json
{
  "data": [
    {
      "month_start": "2026-08-01T00:00:00+00:00",
      "source_portal": "Ixigo",
      "apix_monthly": 4090.12,
      "total_fare": 900000.00,
      "total_base_fare": 900000.00,
      "total_base_period_fare": 870000.00
    }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 1,
    "generated_at": "2026-08-31T09:10:00Z"
  }
}
```

---

### 6.6 `GET /api/v1/apix/by-route`

Index contribution **per route** for a specific date.

**Query params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string (`YYYY-MM-DD`) | **Yes** | Observation date of the index |
| `portal` | string | No | Default `Ixigo` |

**Example**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/by-route?date=2026-08-31"

curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/by-route?date=2026-08-31&portal=Google%20Flights"
```

**Missing `date` → 422** (FastAPI validation):
```json
{
  "detail": [
    {
      "loc": ["query", "date"],
      "msg": "Field required",
      "type": "missing"
    }
  ]
}
```

**Response (200)**
```json
{
  "data": [
    {
      "origin": "DEL",
      "destination": "BOM",
      "index_value": 101.25,
      "route_weight": 0.28,
      "fare": 7200.00,
      "base_period_fare": 7100.00
    },
    {
      "origin": "BLR",
      "destination": "HYD",
      "index_value": 99.8,
      "route_weight": 0.12,
      "fare": 3100.00,
      "base_period_fare": 3106.00
    }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 6,
    "generated_at": "2026-08-31T09:10:00Z"
  }
}
```

---

### 6.7 `GET /api/v1/apix/heatmap`

Index matrix of **route × advance window** for a specific date (feed for a heatmap).

**Query params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string (`YYYY-MM-DD`) | **Yes** | Observation date of the index |
| `portal` | string | No | Default `Ixigo` |

**Example**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/heatmap?date=2026-08-31"
```

**Response (200)**
```json
{
  "data": [
    {
      "origin": "DEL",
      "destination": "BOM",
      "advance_windows": 1,
      "index_value": 102.1
    },
    {
      "origin": "DEL",
      "destination": "BOM",
      "advance_windows": 7,
      "index_value": 100.4
    },
    {
      "origin": "DEL",
      "destination": "BOM",
      "advance_windows": 30,
      "index_value": 98.7
    }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 30,
    "generated_at": "2026-08-31T09:10:00Z"
  }
}
```

---

### 6.8 `GET /api/v1/apix/elasticity`

Day-over-day percentage change in the index for a **route + advance window**
(lead-time elasticity), from `view_route_leadtime_elasticity`.

**Query params**

| Param | Type | Required | Default / Range | Description |
|-------|------|----------|-----------------|-------------|
| `route` | string `^[A-Z]{3}-[A-Z]{3}$` | **Yes** | e.g. `DEL-BOM` | Route key |
| `window` | int | **Yes** | 1–45 | Advance window (days) |
| `portal` | string | No | `Ixigo` | Source portal |
| `limit` | int | No | 30 (range 1–90) | Recent days to return |

**Examples**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/elasticity?route=DEL-BOM&window=7"

curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/elasticity?route=BLR-HYD&window=30&portal=Google%20Flights&limit=14"
```

**Invalid `route` → 422** (regex violation), e.g. `route=delbom`:
```json
{
  "detail": [
    {
      "loc": ["query", "route"],
      "msg": "String should match pattern '^[A-Z]{3}-[A-Z]{3}$'",
      "type": "string_pattern_mismatch"
    }
  ]
}
```

**Response (200)**
```json
{
  "data": [
    {
      "origin": "DEL",
      "destination": "BOM",
      "advance_windows": 7,
      "date": "2026-08-30",
      "current_index": 100.4,
      "previous_index": 99.1,
      "percentage_change": 1.31
    },
    {
      "origin": "DEL",
      "destination": "BOM",
      "advance_windows": 7,
      "date": "2026-08-29",
      "current_index": 99.1,
      "previous_index": 100.0,
      "percentage_change": -0.9
    }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 2,
    "generated_at": "2026-08-31T09:10:00Z"
  }
}
```

> `percentage_change` is `NULL` when `previous_index` is 0 (no prior day).

---

### 6.9 `GET /api/v1/apix/airlines`

Average/min fare per airline on a **route + journey date** (from `flight_quotes`).

**Query params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `route` | string `^[A-Z]{3}-[A-Z]{3}$` | **Yes** | e.g. `DEL-BOM` |
| `date` | string (`YYYY-MM-DD`) | **Yes** | **Journey** date (departure date) |
| `portal` | string | No | Default `Ixigo` |

**Examples**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/airlines?route=DEL-BOM&date=2026-09-14"

curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/airlines?route=DEL-BLR&date=2026-09-14&portal=Google%20Flights"
```

**Response (200)** — rows are the raw `flight_quotes` records (one per flight), ordered by
fare ascending. `carrier_code` is `null` for Google Flights.
```json
{
  "data": [
    {
      "carrier": "IndiGo",
      "carrier_code": "6E",
      "total_fare": 6408.0
    },
    {
      "carrier": "Akasa Air",
      "carrier_code": "QP",
      "total_fare": 6530.0
    },
    {
      "carrier": "Air India",
      "carrier_code": "AI",
      "total_fare": 7000.0
    }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 3,
    "generated_at": "2026-08-31T09:10:00Z"
  }
}
```

> To get **average** fare per airline, aggregate client-side or use PostgREST directly
> (see §8). The endpoint returns per-flight rows ordered by fare.

---

## 7. Common Use-Cases

### Dashboard sparkline (weekly trend)
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/latest"
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/weekly?limit=52"
```

### Price heatmap for today (all routes × windows)
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/heatmap?date=2026-08-31"
```

### Compare two portals on the same metric
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/by-route?date=2026-08-31&portal=Ixigo"
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/by-route?date=2026-08-31&portal=Google%20Flights"
```

### Lead-time elasticity of a specific market
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/elasticity?route=DEL-BOM&window=1&limit=30"
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/elasticity?route=DEL-BOM&window=45&limit=30"
```

### Cheapest airline on a route for a departure date
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/airlines?route=DEL-BOM&date=2026-09-14"
```

### Operational monitoring (no key)
```bash
curl "https://smart-airfare-price-index.onrender.com/api/v1/health"
```

### Admin coverage check
```bash
curl -H "X-API-Key: YOUR_ADMIN_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/admin/coverage?limit=14"
```

---

## 8. Reference: Source Tables & Views

The API reads from the following Supabase objects. The column names in responses
come directly from these objects.

### `airfare_price_index` (rows per date/route/window/portal)
Key columns used by the API: `date`, `journey_date`, `origin`, `destination`,
`route`, `advance_windows`, `source_portal`, `index_value`, `route_weight`,
`advance_window_weight`, `fare`, `base_fare`, `base_period_fare`.

### `flight_quotes` (raw cleaned quotes)
Key columns used by the API: `journey_date`, `route`, `source_portal`, `carrier`,
`carrier_code`, `total_fare`, `is_imputed`, `scraping_date_time`.

### Views
| View | Purpose | Consumed by |
|------|---------|-------------|
| `view_apix_weekly` | Weighted weekly APIx sum | `/apix/weekly` |
| `view_apix_monthly` | Weighted monthly APIx sum | `/apix/monthly` |
| `view_route_leadtime_elasticity` | Day-over-day % change per route/window/portal | `/apix/elasticity` |

> Direct PostgREST access (e.g. for averages not exposed by the wrapper) can be done
> against the Supabase REST endpoint: `https://<ref>.supabase.co/rest/v1/flight_quotes?select=carrier,avg(total_fare)&route=eq.DEL-BOM`.
> The thin wrapper intentionally exposes only the curated endpoints above.
