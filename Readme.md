
# FlyIndex India — Real-Time Airfare Price Index System

[![MoSPI DIID](https://img.shields.io/badge/MoSPI-DIID-navy?style=flat-square)](https://esankhyiki.mospi.gov.in)
[![Problem Statement ID](https://img.shields.io/badge/Problem%20Statement-26056-saffron?style=flat-square)]()
[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite%205%20%7C%20TypeScript-blue?style=flat-square)]()
[![Python](https://img.shields.io/badge/Backend-Python%203.11%2B%20%7C%20FastAPI-green?style=flat-square)]()
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20(Supabase)-emerald?style=flat-square)]()
[![Container](https://img.shields.io/badge/Deployment-Docker%20%7C%20Air--Gapped-orange?style=flat-square)]()

**FlyIndex India (APIx)** is an automated, high-frequency data ingestion, econometric index computation, and interactive intelligence platform engineered for the **Ministry of Statistics and Programme Implementation (MoSPI)** under the **Data Informatics & Innovation Division (DIID)**. 

The system programmatically harvests observed domestic airfare data from airline endpoints and Online Travel Aggregators (OTAs) using ethical, stealth-enabled interceptors. Incoming quotes undergo canonical Pydantic validation, idempotent deduplication, and Jevons cell-relative missing-slot imputation before feeding a weighted Laspeyres index engine aligned with international statistical standards (IMF / ILO / Eurostat). Policy intelligence is delivered via an interactive React/TypeScript analytical dashboard and an asynchronous FastAPI gateway featuring a sandboxed Text-to-SQL interface powered by local, quantized Small Language Models (SLMs).

---

## 📌 Problem Statement Details

- **Problem Statement ID:** `26056`
- **Problem Statement Title:** Development of a Real-time Airfare Price Index for India through Automated Web Scraping of Airline and Online Travel Aggregator Portals for Augmentation of the Consumer Price Index (CPI)
- **Organization:** Ministry of Statistics and Programme Implementation (MoSPI)
- **Department:** Data Informatics & Innovation Division (DIID)
- **Category:** Software
- **Theme:** Smart Automation
- **Official Dataset Link:** [https://esankhyiki.mospi.gov.in](https://esankhyiki.mospi.gov.in)

### Background & Policy Relevance
The Consumer Price Index (CPI) published by the National Statistical Office (NSO), MoSPI, anchors retail inflation measurement and monetary policy formulation by the Reserve Bank of India (RBI). The traditional CPI framework collects "Transport and Communication" sub-group prices through periodic, manual price-collection from ticketing counters.

With over **90% of domestic air tickets in India booked digitally**, airline pricing algorithms induce high-frequency intra-day fare volatility of **200–400%** across advance booking windows ($T+1$ to $T+45$), days of the week, and peak holiday corridors. Manual monthly sampling cannot capture these dynamic shifts. FlyIndex India replaces this latency with an automated, daily price collection engine that reflects real transaction prices while providing regulatory oversight against predatory surge pricing.

---

## 🛠️ System Architecture & Tech Stack

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                               FlyIndex India (APIx) Architecture                             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                               │
         ┌─────────────────────────────────────┴─────────────────────────────────────┐
         ▼                                                                           ▼
┌───────────────────────────────────────────┐               ┌───────────────────────────────────────────┐
│        Ingestion & Computation Core       │               │      Interactive Web Dashboard (UI)       │
│               (Python 3.11+)              │               │       (React 18 + Vite 5 + TS + TW)       │
└─────────────────────┬─────────────────────┘               └─────────────────────┬─────────────────────┘
                      │                                                           │
┌─────────────────────┴─────────────────────┐               ┌─────────────────────┴─────────────────────┐
│ • Playwright & curl_cffi Harvesters       │               │ • 11 Analytical & Operational Views       │
│ • Dual-Source Interceptors (Ixigo/GF)     │               │ • Route × Lead-Time Volatility Heatmaps   │
│ • Pydantic V2 Canonical Data Cleaning     │               │ • Sovereign Survey of India Map (SVG)     │
│ • Truth Triangle Parity Engine            │               │ • Plain-Language Semantic Route Search    │
│ • Jevons Cell-Relative Imputation         │               │ • Resilient Dual-Mode Provider (Build/Mock│
│ • Weighted Laspeyres Index Calculator     │               │ • Tabular-Nums Financial Design Tokens    │
└─────────────────────┬─────────────────────┘               └─────────────────────┬─────────────────────┘
                      │                                                           │
                      ▼                                                           ▼
┌───────────────────────────────────────────┐   FastAPI /   ┌───────────────────────────────────────────┐
│          PostgreSQL Database Layer        │◄─ REST JSON ─►│      @tanstack/react-query Gateway        │
│    (5 Core Tables + 3 Analytical Views)   │    Gateway    │        (Map-Based Session Caching)        │
└─────────────────────┬─────────────────────┘               └─────────────────────┬─────────────────────┘
                      │                                                           │
                      ▼                                                           ▼
┌───────────────────────────────────────────┐               ┌───────────────────────────────────────────┐
│     Row-Level Security & AST Sandbox      │               │     Sovereign Natural Language Interface  │
│  (Read-Only Session & Execution Limits)   │◄──────────────┤   (Local Qwen2.5-Coder SLM via Ollama)    │
└───────────────────────────────────────────┘               └───────────────────────────────────────────┘
```
### 1. Elementary Cell Aggregation (Jevons Formula)

For each elementary cell $c = (\text{origin}, \text{destination}, \text{advance-window})$, the unweighted daily price is calculated using the geometric mean of observed quotes:

$$
P_{c,t} = \exp\left( \frac{1}{n} \sum_{i=1}^{n} \ln(p_{i,t}) \right)
$$

Using the geometric mean prevents extreme asymmetric tariff outliers from biasing the baseline index.

### 2. Relative Index & Laspeyres Chain Aggregation

The price relative for cell $c$ at time $t$ against the base-period benchmark $P_{c,0}$ is defined as:

$$
I_{c,t} = \left( \frac{P_{c,t}}{P_{c,0}} \right) \times 100
$$

The macro-level **FlyIndex India** aggregates all cells using official DGCA volume shares ($w_{\text{route}}$) and booking horizon distribution weights ($w_{\text{window}}$):

$$
\text{FlyIndex}_t = \frac{\sum_c (w_c \cdot I_{c,t})}{\sum_c w_c} \quad \text{where } w_c = w_{\text{route}} \times w_{\text{window}}
$$

### 3. Missing-Slot Imputation (Jevons Cell-Relative Method)

When a flight sells out or drops from an advance horizon, its price is imputed using the geometric trend ($R_{c,t}$) of matched carrier flights active on both day $t-1$ and day $t$:

$$
R_{c,t} = \frac{\exp\left(\frac{1}{m}\sum_{j=1}^m \ln p_{j,t}\right)}{\exp\left(\frac{1}{m}\sum_{j=1}^m \ln p_{j,t-1}\right)} \implies \hat{p}_{\text{imputed},t} = p_{\text{base},t-1} \times R_{c,t}
$$

### 4. Cross-Portal Verification ("Truth Triangle")

Quotes are paired between the primary stream (Ixigo) and secondary scraper (Google Flights) across a 6-parameter match key: `(journey_date, origin, destination, carrier_code, departure_time, arrival_time)`. Differences exceeding a 1% relative threshold are flagged in the audit pipeline to detect scraping anomalies or portal-specific surcharges.

🔒 Security Architecture: SQL Sandbox & Air-Gapped AI
FlyIndex India integrates conversational querying for non-technical statistical officers while ensuring zero risk to data integrity:
```text
User Prompt (Natural Language)
               │
               ▼
┌──────────────────────────────────────────────┐
│       FastAPI Microservice Gateway           │  <-- Auth via X-API-Key
│  • Rate Limiting (SlowAPI: 100 req/min)      │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│      Local Air-Gapped SLM (Ollama)           │  <-- Containerized Qwen2.5-Coder-1.5B/7B
│  • Generates raw PostgreSQL text query       │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│          AST SQL Sandbox (sqlglot)           │
│  • Enforces SELECT expressions exclusively   │
│  • Whitelists tables: flight_quotes, views   │
│  • Blocks pg_sleep, DDL, and DML statements  │
│  • Automatically clamps queries to LIMIT 100 │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│        PostgreSQL Database Execution         │
│  • Dedicated Role: apix_sandbox_user         │
│  • default_transaction_read_only = on        │
│  • statement_timeout = 2000ms                │
└──────────────────────────────────────────────┘
```
## 🖥️ Interactive Dashboard & Analytical Suite

The **FlyIndex India** interface is organized into modular views tailored for economists, market regulators, and data analysts:

| View | Route | Primary Capability | Core Visualization / Feature |
| :--- | :--- | :--- | :--- |
| **Market Pulse** | `/` | Executive Macro Overview | Real-time headline index, rolling price deltas (24h/7d/30d), and automated AI narrative briefs. |
| **National Fare Index** | `/airfare-index` | Weighted Price Trends | Official Laspeyres index tracking against a 100.0 baseline, accompanied by route contribution shares. |
| **Live Flight Network** | `/route-analytics` | Spatial Route Intelligence | Authoritative Survey of India SVG map rendering dynamic flight corridors weighted by price volatility. |
| **Historical Price Trends**| `/price-trends` | Long-Term Macro Direction | Multi-horizon moving averages (daily, weekly, monthly) comparing national metrics to city-pairs. |
| **Booking Horizon Radar** | `/lead-time` | Advance Purchase Dynamics | 5-window matrix ($T+1$ to $T+45$) with interactive drill-down cards showing carrier fare spreads. |
| **Model Verification** | `/backtesting` | Historical Accuracy Audit | Statistical retrospective benchmarking against historical monthly averages using MAPE and RMSE. |
| **Pipeline Health** | `/data-quality` | Ingestion Quality Telemetry | 4-stage pipeline telemetry, imputation ratios, and cross-source verification tracking. |
| **Raw Fare Explorer** | `/data-explorer` | Granular Flight Search | Filterable data table to inspect individual ticket records across carriers, dates, and fare buckets. |
| **Statistical Framework** | `/data-sources` | Methodology Reference | Full breakdown of official weighting matrices, mathematical formulas, and scraping policies. |
| **Platform Architecture** | `/about-apix` | Institutional Brief | Technical documentation on dynamic pricing behaviors, policy rationale, and sovereign deployment. |
| **API Console** | `/api-docs` | Direct Data Integration | Interactive OpenAPI runner enabling live testing against FastAPI analytical endpoints. |

---

### Key Feature Highlights

*   **Advance Booking Matrix:** Toggle between raw currency values (₹) and relative index metrics across five advance horizons to identify last-minute price gouging bottlenecks.
*   **Sovereign Boundary Mapping:** Built-in vector cartography adhering strictly to official Indian borders, scaling corridor stroke widths dynamically based on percentage shifts.
*   **Dual-State Connectivity:** Seamlessly switches between live streaming endpoints and deterministic local mock data to guarantee zero UI downtime during network interruptions.

## 🚀 Quickstart & Getting Up and Running

Here is how to get the entire platform—from the ingestion workers to the interactive dashboard—running locally on your machine.

### 1. What You’ll Need First
* **Node.js:** v18.0.0+ installed
* **Python:** v3.11+ environment ready
* **PostgreSQL:** Either a local database or your Supabase connection strings
* **Ollama (Optional):** Needed if you plan to test the air-gapped natural language SQL queries locally

---

### 2. Launching the Web Interface
Fire up the React front-end to explore the visual dashboards and mock analytics:

```bash
# Head into the front-end folder
cd frontend

# Grab all the dependencies
npm install

# Start the Vite development server
npm run dev

# Install the core Python libraries
pip install -r requirements.txt

# Download the browser binaries needed for automated collection
playwright install chromium

# Set up your environment secrets
cp .env.example .env

# Run a test cycle of the scraping and indexing pipeline
python main.py

# Fire up the live FastAPI backend
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload

# Run the complete test suite
pytest tests/ -v
```
## 🏛️ Why This Matters: Real-World Impact

* **Smarter Official Statistics (MoSPI):** Replaces delayed, manual monthly ticket surveys with high-frequency, automated ingestion reflecting what citizens actually pay across digital platforms.
* **Faster Policy Decisions (RBI):** Equips monetary authorities with a reliable, daily leading indicator for services inflation, delivering actionable market signals well ahead of lagging monthly releases.
* **Fair Play for Flyers (DGCA):** Gives aviation watchdogs verified, objective evidence to identify predatory surge pricing, synthetic seat-scarcity tactics, and route-level gouging during peak holiday corridors.
* **Engineered for Sovereign Deployment:** Operates fully within domestic, air-gapped infrastructure (NIC / MeghRaj GI Cloud). All data processing, storage, and local AI inferencing remain strictly inside national boundaries with zero dependency on foreign third-party APIs.

---

## 📜 Compliance & Ethical Standards

Developed in alignment with research guidelines for the **Ministry of Statistics and Programme Implementation (MoSPI)**, Government of India.

* **Dynamic `robots.txt` Compliance:** Ingestion workers automatically query, parse, and obey domain-level crawl-delay directives and restricted paths prior to initiating queries.
* **Polite Token-Bucket Rate Limiting:** Outgoing request rates are capped per domain to preserve host server stability and eliminate service degradation risks.
* **Transparent Identification:** Every network request broadcasts an institutional research identity via a structured header:
  ```http
  User-Agent: MoSPI-APIx-Research-Bot/1.0 (+[https://mospi.gov.in/cpi](https://mospi.gov.in/cpi); rate-limited; research-use)
