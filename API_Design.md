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
3. [CORS & Preflight Configuration](#3-cors--preflight-configuration)
4. [Response Envelope](#4-response-envelope)
5. [Error Handling](#5-error-handling)
6. [Query Parameters & Filters](#6-query-parameters--filters)
7. [Endpoints](#7-endpoints)
   - [`GET /api/v1/health`](#71-health)
   - [`GET /api/v1/admin/metadata`](#72-admin-metadata)
   - [`GET /api/v1/admin/coverage`](#73-admin-coverage)
   - [`GET /api/v1/apix/latest`](#74-apixlatest)
   - [`GET /api/v1/apix/series`](#75-apixseries)
   - [`GET /api/v1/apix/weekly`](#76-apixweekly)
   - [`GET /api/v1/apix/monthly`](#77-apixmonthly)
   - [`GET /api/v1/apix/by-route`](#78-apixby-route)
   - [`GET /api/v1/apix/heatmap`](#79-apixheatmap)
   - [`GET /api/v1/apix/elasticity`](#710-apixelasticity)
   - [`GET /api/v1/apix/leadtime`](#711-apixleadtime)
   - [`GET /api/v1/apix/airlines`](#712-apixairlines)
8. [Common Use-Cases](#8-common-use-cases)
9. [Reference: Source Tables & Views](#9-reference-source-tables--views)

---

## 1. Authentication

Every data endpoint requires an API key sent in the **`X-API-Key`** request header.

| Header | Value | Required |
|--------|-------|----------|
| `X-API-Key` | `web-key` / `admin-key` (configured in `API_KEYS`) | Yes * |

> \* `GET /api/v1/health` does **not** require an API key.

Keys are configured server-side as a JSON object in the `API_KEYS` environment
variable (e.g. `{"web-key":"web","admin-key":"admin"}`). The **key** is the
secret sent in the header; the **value** (right-hand side) is the scope.

### Scopes

| Scope | Can access |
|-------|------------|
| `web` (any valid non-admin key) | All `/api/v1/apix/*` endpoints **and** `GET /api/v1/admin/metadata` |
| `admin` | All `/api/v1/apix/*` **and** all `/api/v1/admin/*` endpoints (`/admin/coverage`, `/admin/metadata`) |

### Examples

```bash
# Public data endpoint (needs a valid web key)
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/weekly"

# Public metadata endpoint (accessible with web key)
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/admin/metadata"

# Missing key → 401
curl "https://smart-airfare-price-index.onrender.com/api/v1/apix/weekly"

# Admin-restricted endpoint with a web-scoped key → 403
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/admin/coverage"

# Admin-restricted endpoint with an admin key → 200
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

## 3. CORS & Preflight Configuration

The API implements standard W3C Cross-Origin Resource Sharing (CORS) via FastAPI's `CORSMiddleware`:

- **Allowed Origins:** `*` (wildcard by default for public analytics consumption) or configured via `CORS_ORIGINS_JSON` env var.
- **Allowed Methods:** `GET`, `OPTIONS`, `HEAD`.
- **Allowed Headers:** `*` (specifically supporting `X-API-Key`, `Authorization`, and `Content-Type`).
- **Preflight Handling:** Browser HTTP `OPTIONS` requests are handled automatically and return `200 OK` with `Access-Control-Allow-Origin: *`.

---

## 4. Response Envelope

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

### 7.1 `GET /api/v1/health`

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

### 7.2 `GET /api/v1/admin/metadata`

> Requires a valid API key (`web` or `admin` scope).

Returns global dashboard metadata: the active DGCA route basket with traffic weights, carrier registry, portals, supported advance-purchase windows, latest observation date, and history depth.

**Example**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/admin/metadata"
```

**Response (200)**
```json
{
  "data": {
    "routes": [
      {
        "code": "DEL-BOM",
        "origin": "DEL",
        "destination": "BOM",
        "label": "DEL–BOM",
        "weight_pct": 28.0
      },
      {
        "code": "DEL-BLR",
        "origin": "DEL",
        "destination": "BLR",
        "label": "DEL–BLR",
        "weight_pct": 20.0
      }
    ],
    "airlines": [
      { "code": "6E", "label": "IndiGo" },
      { "code": "AI", "label": "Air India" },
      { "code": "IX", "label": "Air India Express" },
      { "code": "QP", "label": "Akasa Air" },
      { "code": "SG", "label": "SpiceJet" }
    ],
    "portals": ["Ixigo", "Google Flights"],
    "lead_windows": [1, 7, 15, 30, 45],
    "latest_date": "2026-09-06",
    "first_date": "2026-08-30",
    "base_period_label": "30 Aug 2026 (first scrape date)",
    "history_days": 8
  },
  "meta": {
    "count": 1,
    "generated_at": "2026-09-07T12:00:00Z"
  }
}
```

---

### 7.3 `GET /api/v1/admin/coverage`

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
      "quotes": 4821,
      "imputed": 0,
      "imputed_pct": 0.0
    },
    {
      "journey_date": "2026-08-31",
      "source_portal": "Google Flights",
      "quotes": 1840,
      "imputed": 12,
      "imputed_pct": 0.65
    }
  ],
  "meta": {
    "count": 2,
    "generated_at": "2026-08-31T09:10:00Z"
  }
}
```

---

### 7.4 `GET /api/v1/apix/latest`

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

### 7.5 `GET /api/v1/apix/series`

Daily continuous weighted index series for all-India or a specific route.

**Query params**

| Param | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `route` | string | `ALL` or `^[A-Z]{3}-[A-Z]{3}$` | `ALL` | Route filter (`ALL` or `DEL-BOM`) |
| `days` | int | 1–730 | 60 | Number of daily points (most recent first) |
| `portal` | string | `Ixigo`, `Google Flights` | `Ixigo` | Source portal |

**Example**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/series?route=DEL-BOM&days=30"
```

**Response (200)**
```json
{
  "data": [
    { "date": "2026-08-30", "index_value": 87.1 },
    { "date": "2026-08-31", "index_value": 88.4 }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 2,
    "generated_at": "2026-09-07T12:00:00Z"
  },
  "available_days": 2,
  "requested_days": 30
}
```

---

### 7.6 `GET /api/v1/apix/weekly`

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

### 7.7 `GET /api/v1/apix/monthly`

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

### 7.8 `GET /api/v1/apix/by-route`

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

### 7.10 `GET /api/v1/apix/elasticity`

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

### 7.11 `GET /api/v1/apix/leadtime`

Average, median (P50), min, max observed fare and quote counts per advance-purchase window ($T+1, T+7, T+15, T+30, T+45$) for a route.

**Query params**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `route` | string `^[A-Z]{3}-[A-Z]{3}$` | **Yes** | e.g. `DEL-BOM` | Route key |
| `portal` | string | No | `Ixigo` | Source portal |
| `limit` | int | No | 4000 (100–8000) | Recent quotes sampled |

**Examples**
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/leadtime?route=DEL-BOM"
```

**Response (200)**
```json
{
  "data": [
    {
      "advance_windows": 1,
      "avg_fare": 8450.00,
      "p50_fare": 8200.00,
      "min_fare": 5200.00,
      "max_fare": 14500.00,
      "observations": 240
    },
    {
      "advance_windows": 7,
      "avg_fare": 6120.00,
      "p50_fare": 5900.00,
      "min_fare": 4300.00,
      "max_fare": 11200.00,
      "observations": 310
    },
    {
      "advance_windows": 30,
      "avg_fare": 4250.00,
      "p50_fare": 4100.00,
      "min_fare": 3400.00,
      "max_fare": 7500.00,
      "observations": 450
    }
  ],
  "meta": {
    "portal": "Ixigo",
    "count": 3,
    "generated_at": "2026-09-07T12:00:00Z"
  }
}
```

---

### 7.12 `GET /api/v1/apix/airlines`

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
> (see §9). The endpoint returns per-flight rows ordered by fare.

---

## 8. Common Use-Cases

### Dashboard sparkline & continuous series
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/latest"
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/series?route=ALL&days=60"
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

### Advance-purchase price curve
```bash
curl -H "X-API-Key: YOUR_WEB_KEY" \
  "https://smart-airfare-price-index.onrender.com/api/v1/apix/leadtime?route=DEL-BOM"
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

## 9. Reference: Source Tables & Views

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
