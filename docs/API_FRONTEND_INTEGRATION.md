# Full-Stack API & Frontend Integration Reference

This document is the **definitive full-stack bridge** connecting the FastAPI backend, Supabase database, and React 18 frontend dashboard. It documents data contracts, authentication, CORS, performance caching, fallback mechanisms, and developer recipes for extending the platform.

---

## 1. Full-Stack System Architecture

```
                                  DATA INGESTION PIPELINE
                     ┌─────────────────────────────────────────────────┐
                     │ Ixigo SSE Interceptor  │ Google Flights Scraper │
                     └────────────────────────┬────────────────────────┘
                                              ▼
                                 ┌─────────────────────────┐
                                 │ Cleaning & TruthEngine  │
                                 └────────────┬────────────┘
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              SUPABASE POSTGRESQL DATABASE                                   │
│  Tables: flight_quotes, route_weights, advance_window_weights, airfare_price_index          │
│  Views:  view_apix_weekly, view_apix_monthly, view_route_leadtime_elasticity                │
└─────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                              │ PostgREST REST API
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               FASTAPI THIN BACKEND PROXY                                    │
│  Auth: X-API-Key (web/admin) │ Rate Limiting (100 req/min) │ CORS: Access-Control-Allow: *  │
│  Routes: /api/v1/health, /admin/metadata, /admin/coverage, /apix/* (latest, series, etc.)   │
└─────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                              │ HTTP JSON / HTTPS
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                REACT 18 + TS DASHBOARD                                      │
│  DataProvider: buildProvider (Live REST + Cache) ◄──► prototypeProvider (Offline Engine)    │
│  Hooks:        useDataProvider(), useMetadata(), useTheme()                                 │
│  UI:           10 Analytical Pages, India Vector Map (Survey of India), Smart Search        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. End-to-End Data Contract Matrix

| FastAPI Route | HTTP | Auth Scope | Source DB Object | Frontend Method (`buildProvider`) | UI Consumer |
|---|---|---|---|---|---|
| `/api/v1/health` | `GET` | *Public* | `view_apix_weekly` ping | Direct health probes | Uptime monitoring |
| `/api/v1/admin/metadata` | `GET` | `web` / `admin` | `route_weights`, `advance_window_weights`, `flight_quotes` | `getConstants()` | `useMetadata()` $\to$ All Selects & Tickers |
| `/api/v1/admin/coverage` | `GET` | `admin` | `flight_quotes` aggregate | `getCoverage(limit)` | `DataQuality.tsx` |
| `/api/v1/apix/latest` | `GET` | `web` / `admin` | `airfare_price_index` | `getLatestIndex(portal)` | `Home.tsx`, `DataExplorer.tsx` |
| `/api/v1/apix/series` | `GET` | `web` / `admin` | `airfare_price_index` | `getDailySeries(r, a, days)` | `AirfareIndex.tsx`, `PriceTrends.tsx` |
| `/api/v1/apix/weekly` | `GET` | `web` / `admin` | `view_apix_weekly` | `getWeeklyIndex(portal, limit)` | `PriceTrends.tsx` |
| `/api/v1/apix/monthly` | `GET` | `web` / `admin` | `view_apix_monthly` | `getMonthlyIndex(portal, limit)` | `PriceTrends.tsx` |
| `/api/v1/apix/by-route` | `GET` | `web` / `admin` | `airfare_price_index` | `getByRoute(date, portal)` | `DataExplorer.tsx`, `RouteAnalytics.tsx` |
| `/api/v1/apix/heatmap` | `GET` | `web` / `admin` | `airfare_price_index` | `getHeatmap(date, portal)` | `AirfareIndex.tsx` heatmap |
| `/api/v1/apix/elasticity` | `GET` | `web` / `admin` | `view_route_leadtime_elasticity` | `getElasticity(r, w, portal, l)` | Lead-time comparison curves |
| `/api/v1/apix/leadtime` | `GET` | `web` / `admin` | `flight_quotes` | `getLeadTimeData(r, a)` | `LeadTimeAnalysis.tsx` |
| `/api/v1/apix/airlines` | `GET` | `web` / `admin` | `flight_quotes` | `getAirlines(r, date, portal)` | Carrier fare rankings |

---

## 3. Authentication & CORS Lifecycle

### Authentication Flow
1. The frontend reads `VITE_API_KEY` from its environment (`frontend/.env`).
2. Every request issued by `buildProvider` or the interactive API Console includes:
   ```http
   X-API-Key: <VITE_API_KEY>
   Content-Type: application/json
   ```
3. The FastAPI server validates this key against the `API_KEYS` JSON map in `src/api/config.py`:
   * Matches `'web'` $\to$ grants access to `/apix/*` and `/admin/metadata`.
   * Matches `'admin'` $\to$ grants access to `/admin/coverage` and pipeline triggers.
   * Missing / invalid key $\to$ returns `401 Unauthorized` (`{"detail": {"code": 401, "message": "Missing API key"}}`).

### CORS Preflight Resolution
Because `X-API-Key` is a custom HTTP header, browsers mandate a CORS preflight (`OPTIONS` request) before issuing `GET` requests across origins.

* **Backend Configuration (`src/api/main.py`)**:
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["*"],
      allow_credentials=False,
      allow_methods=["GET", "OPTIONS", "HEAD"],
      allow_headers=["*"],
  )
  ```
* **Render Deployment**: Render automatically sets `CORS_ORIGINS_JSON='["*"]'`, ensuring preflight `OPTIONS` requests return `HTTP 200` with `Access-Control-Allow-Origin: *`.

---

## 4. Provider Pattern & Fallback Architecture

The frontend abstracts data access through the `DataProvider` interface (`frontend/src/lib/types.ts`). Components interact solely with `useDataProvider()`, remaining decoupled from backend URLs and mock implementations.

```typescript
export interface DataProvider {
  getLatestIndex(portal: string): Promise<LatestIndexResponse>
  getWeeklyIndex(portal: string, limit: number): Promise<WeeklyIndexResponse>
  getMonthlyIndex(portal: string, limit: number): Promise<MonthlyIndexResponse>
  getByRoute(date: string, portal: string): Promise<ByRouteResponse>
  getHeatmap(date: string, portal: string): Promise<HeatmapResponse>
  getElasticity(route: string, window: number, portal: string, limit: number): Promise<ElasticityResponse>
  getAirlines(route: string, date: string, portal: string): Promise<AirlinesResponse>
  getCoverage(limit: number): Promise<CoverageResponse>
  getConstants(): Promise<ConstantsResponse>
  getDailySeries(routeCode: string, airlineCode: string, days: number): Promise<DataResponse<SeriesPoint[]>>
  getWeeklySeries(routeCode: string, airlineCode: string, limit: number): Promise<DataResponse<SeriesPoint[]>>
  getMonthlySeries(routeCode: string, airlineCode: string, limit: number): Promise<DataResponse<SeriesPoint[]>>
  getRouteTable(airlineCode: string): Promise<DataResponse<RouteTableRow[]>>
  getRouteIntel(airlineCode: string): Promise<DataResponse<RouteIntel[]>>
  getLeadTimeData(routeCode: string, airlineCode: string): Promise<DataResponse<LeadTimeData>>
  getBacktestData(start: string, end: string, airlineCode: string): Promise<DataResponse<BacktestResult>>
}
```

### The 4-Tier Fallback Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│                        buildProvider Execution                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 1. Check in-memory session cache
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          HTTP fetch(API_BASE)                          │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │ Success (200)                          │ Error / 404 / 500 / Network
                ▼                                        ▼
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Tier 1: Full Live Dataset   │         │    Tier 3 & 4: Fallback      │
│  (Real PostgreSQL numbers)   │         │  (Invoke prototypeProvider   │
└───────────────┬──────────────┘         │   + attach warning string)   │
                │                        └───────────────┬──────────────┘
                │ If available < requested               │
                ▼                                        ▼
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Tier 2: Limited Live Data   │         │     LimitedHistoryBanner     │
│  (Cap Range + Banner Alert)  │         │  "Live API unavailable..."   │
└──────────────────────────────┘         └──────────────────────────────┘
```

1. **Tier 1 (200 OK Live)**: Data returned directly from PostgreSQL.
2. **Tier 2 (Partial Live History)**: If requested window exceeds live data depth (e.g. user requests 30 days but only 8 days exist in DB), `buildProvider` attaches `warning: "Limited live history: only 8 days available"`. The UI caps range dropdowns and displays `LimitedHistoryBanner`.
3. **Tier 3 (Pre-deployment 404)**: If a new endpoint is not yet live on the server, `buildProvider` catches the 404 and synthesizes from existing endpoints or prototype logic with an informative warning banner.
4. **Tier 4 (Cold-Start / Network Failure)**: If the backend is spinning up on Render's free tier or network is offline, `buildProvider` falls back to `prototypeProvider`, ensuring **zero crashing and full UI interactivity**.

---

## 5. Performance & In-Memory Session Caching

To prevent network hammering when users toggle between filters on the dashboard:

* `buildProvider` maintains an in-memory `Map<string, { data: unknown; expires: number }>` with a **5-minute TTL**.
* Duplicate queries with the same path and search parameters are resolved from memory in `< 1ms`.
* `clearApiCache()` is called automatically in `afterEach()` during Vitest execution to guarantee test isolation.

---

## 6. Dynamic Metadata Lifecycle (`useMetadata`)

Instead of hard-coding routes and airlines in the frontend, the `useMetadata()` hook dynamically synchronizes with `/api/v1/admin/metadata`:

1. Fetches active route basket with DGCA passenger traffic weights.
2. Fetches observed carrier registry (IndiGo, Air India, Akasa Air, SpiceJet, Air India Express).
3. Fetches latest observation date and historical depth.
4. If network is unavailable, defaults gracefully to static baseline constants without blocking the initial render.

---

## 7. Developer & AI Extension Recipe

When adding a new analytical feature:

1. **Backend Route**: Define route in `src/api/routes/apix.py` returning standard `{"data": ..., "meta": ...}` envelope.
2. **Frontend Type**: Add TypeScript interfaces to `frontend/src/lib/types.ts` and add signature to `DataProvider`.
3. **Build Provider**: Implement method in `frontend/src/lib/build/provider.ts` with `try/catch` fallback to `prototypeProvider`.
4. **Prototype Provider**: Implement corresponding simulated data method in `frontend/src/lib/prototype/provider.ts`.
5. **MSW Handler**: Add mock endpoint in `frontend/src/mocks/handlers.ts`.
6. **UI Component**: Consume via `useDataProvider()` and render `LimitedHistoryBanner` for warnings.
7. **Verification**: Run `pytest tests/ -v && cd frontend && npm run lint && npx tsc --noEmit && npm run test`.
