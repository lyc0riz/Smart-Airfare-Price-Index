# Frontend Pages & Analytical Views Specification

This document provides the exhaustive functional and technical specification for all 10 dashboard pages in **FlyIndex India** (`frontend/src/pages/`).

---

## 1. Executive Summary / Home (`Home.tsx`)

* **Route:** `/`
* **Purpose:** High-level institutional landing view showing real-time headline APIx, metric deltas, and exploratory navigation cards.
* **Data Dependencies:**
  * `provider.getDailySeries('ALL', 'ALL', 60)` $\to$ computes day-over-day, 7-day, and 30-day percentage changes.
  * `useMetadata()` $\to$ `basePeriodLabel`, `latestDate`, `routes`, `airlines`.
* **Key UI Sections:**
  * **Hero Header**: Headline indicator ($108.42$), base period badge, active mode ticker (`Prototype data` vs `Live API`).
  * **Metric Ticker**: Day, 7-day, 30-day index percentage changes with color-coded arrows.
  * **Explore Cards Grid**: 6 direct links to analytical modules (`Airfare Index`, `Route Intelligence`, `Price Trends`, `Backtesting`, `Data Quality`, `Data Explorer`).
  * **4-Step Methodology Workflow**: Summary of the collection, cleaning, weighting, and calculation stages.

---

## 2. Core Airfare Price Index (`AirfareIndex.tsx`)

* **Route:** `/airfare-index`
* **Purpose:** Primary macroeconomic indicator view showing weighted Laspeyres index trends, time-range selectors, frequency aggregation, and route-level price movements.
* **Data Dependencies:**
  * `provider.getDailySeries(routeCode, airlineCode, days)` $\to$ continuous daily series.
  * `provider.getRouteTable(airlineCode)` $\to$ route importance table.
  * `useMetadata()` $\to$ dynamic routes, airlines, latest date, historical depth.
* **State Controls:**
  * `range`: `7d` (7 days), `30d` (30 days), `3m` (91 days), `6m` (182 days), `1y` (365 days) — *dynamically capped by `historyDays`*.
  * `routeCode`: `ALL` or specific sector (e.g. `DEL-BOM`).
  * `airlineCode`: `ALL` or carrier code (e.g. `6E`, `AI`, `QP`, `SG`, `IX`).
  * `frequency`: `daily`, `weekly`, `monthly`.
  * `query`: Smart search query for route table.
* **Visualizations & Tables:**
  * **Primary Line Chart**: Recharts line chart with base reference line ($y = 100$), custom tooltip with percentage change from previous and base period.
  * **Smart Route Table**: Filtered via `filterRoutes(rows, query)` supporting natural language, city names, and IATA pairs with sortable columns and pagination.
  * **Recent Movement Summary**: Cards showing Highest Increase, Highest Decrease, and Most Stable route.

---

## 3. Route Intelligence (`RouteAnalytics.tsx`)

* **Route:** `/route-analytics`
* **Purpose:** Geospatial and sector-level intelligence displaying India's domestic aviation network with interactive route paths and traffic analysis.
* **Data Dependencies:**
  * `provider.getRouteIntel(airlineCode)` $\to$ per-route traffic, DGCA weight, average fare, and contribution.
  * `useMetadata()` $\to$ dynamic routes, airlines.
* **Visualizations & Interactions:**
  * **India Vector Map (`IndiaMap.tsx`)**:
    * Survey of India official boundary with Andaman & Nicobar archipelago and Lakshadweep marker dots.
    * Curved quadratic Bezier route arcs bowing northward.
    * Route stroke width scales with price change magnitude ($|\Delta\%|$); dashed lines indicate falling fares.
    * Hovering shows foreignObject `MapTooltip` with APIx, change, and annual traffic.
    * Clicking a route filters the table and dims all other routes on the map.
  * **Route Statistics Table**: Sortable table with Route, Average Fare, Base Fare, Index, Change %, DGCA Weight, Traffic, and Contribution.
  * **Top Movement Metric**: Automatically highlights the route with largest absolute percentage movement.

---

## 4. Price Trends & Comparisons (`PriceTrends.tsx`)

* **Route:** `/price-trends`
* **Purpose:** Macroeconomic comparison view comparing sector-specific fare growth against the all-India benchmark.
* **Data Dependencies:**
  * `provider.getDailySeries('ALL', airlineCode, days)` $\to$ all-India series.
  * `provider.getDailySeries(routeCode, airlineCode, days)` $\to$ selected route series.
* **Visualizations:**
  * **All-India Index Chart**: Displays raw APIx alongside **Rebased APIx** (where window start index is calibrated to $100.0$ to isolate short-term volatility).
  * **Route vs. All-India Comparison Chart**: Dual-line comparison tracking sector trajectory relative to the national benchmark.

---

## 5. Lead-Time Analysis (`LeadTimeAnalysis.tsx`)

* **Route:** `/lead-time`
* **Purpose:** Microeconomic analysis of dynamic pricing elasticity across advance purchase windows ($T+1, T+7, T+15, T+30, T+45$).
* **Data Dependencies:**
  * `provider.getLeadTimeData(routeCode, airlineCode)` $\to$ price curve points, window statistics, carrier comparisons.
* **Visualizations:**
  * **Advance Purchase Curve**: Line chart plotting average fare vs days before departure, demonstrating the steepness of near-departure surge pricing.
  * **Carrier Comparison Chart**: Multi-line chart comparing booking curve slopes across airlines.
  * **Window Statistics Table**: Average fare, median ($P_{50}$) fare, change from base ($T+30$), and observation counts per window.

---

## 6. Historical Backtesting (`Backtesting.tsx`)

* **Route:** `/backtesting`
* **Purpose:** Methodological validation reconstructing daily index behavior over 30-day reference windows against baseline reference index $100$.
* **Data Dependencies:**
  * `provider.getBacktestData(start, end, airlineCode)` $\to$ daily reconstructed index points, route contribution breakdown, cleaning audit metrics.
* **Visualizations:**
  * **Reconstructed Series**: Daily backtested trajectory with reference base line ($100$).
  * **Key Metrics Summary**: Highest index, lowest index, largest single-day increase, largest single-day decrease.
  * **Route Contributions Table**: Route-level Laspeyres weighting and contribution to aggregate index.
  * **Data Cleaning Audit Metrics**: Records received, cleaning yield, duplicates removed, outliers treated, and missing cells.

---

## 7. Data Explorer (`DataExplorer.tsx`)

* **Route:** `/data-explorer`
* **Purpose:** Open Data transparency interface allowing analysts to inspect route-level statistics and raw scraped quotations.
* **Data Dependencies:**
  * `provider.getRouteTable(airlineCode)` $\to$ route summary records.
  * `provider.getByRoute(latestDate, portal)` $\to$ live observed quotes for selected date.
* **Features:**
  * Live route records table with search, sorting, and pagination.
  * Portal selector (`Ixigo` vs `Google Flights`) to inspect source-specific quotes.
  * CSV export button for statistical research consumption.

---

## 8. Data Quality & Assurance (`DataQuality.tsx`)

* **Route:** `/data-quality`
* **Purpose:** Statistical audit dashboard displaying data ingestion health, cleaning yield, and imputation rates.
* **Data Dependencies:**
  * `provider.getCoverage(30)` $\to$ 30-day scrape cycle stats from `/admin/coverage`.
  * `provider.getBacktestData(...)` $\to$ cleaning pipeline validation metrics.
* **Features:**
  * **4-Stage Cleaning Pipeline Overview**: Collection $\to$ Cleaning & Validation $\to$ Outlier Treatment $\to$ Jevons Cell-Relative Imputation.
  * **Portal Ingestion Summary**: Total quotes collected and imputation percentages by portal.
  * **Recent Scrape Cycles Table**: Daily breakdown of quotes collected, imputed quotes, imputation rate, and collection status.

---

## 9. Interactive API Playground (`ApiDocs.tsx`)

* **Route:** `/api-docs`
* **Purpose:** Developer portal providing documentation and a live interactive API console.
* **Features:**
  * Interactive parameter inputs for all 11 endpoints.
  * "Run Request" button executing direct live HTTP fetches with automatic `X-API-Key` injection.
  * JSON response inspector with syntax formatting, status code badges, and copy-to-clipboard functionality.

---

## 10. Institutional & Methodology Pages (`AboutApix.tsx`, `DataSources.tsx`)

* **Routes:** `/about-apix`, `/data-sources`
* **Purpose:** Institutional reference documenting the MoSPI Smart India Hackathon problem statement, DGCA passenger traffic weighting methodology, and dual-source parametric scraping architecture.
