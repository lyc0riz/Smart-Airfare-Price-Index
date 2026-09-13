# Natural Language Query (NL2SQL) Prototype & Minimal Frontend Specification

**Author:** APIx Engineering & Architecture Team  
**Date:** September 13, 2026  
**Document Status:** Approved Architecture & Implementation Specification  
**Target Branches:** `prototype` / `feature/nl2sql-query-engine`  

---

## 1. Executive Summary & Purpose

This document provides the exhaustive, implementation-ready blueprint for the **Natural Language Query (NL2SQL)** subsystem and **Minimal Prototype Frontend** for the Real-Time Airfare Price Index (APIx) / FlyIndex India platform.

The goal is to enable sovereign institutional stakeholders (e.g., National Statistical Office / MoSPI, Reserve Bank of India) and researchers to query the APIx database using conversational English (e.g., *"Which airline is consistently the cheapest on the Delhi to Mumbai route?"*, *"Show the weekly APIx trend for Ixigo over the last month"*, or *"What is the day-over-day price elasticity for DEL-BOM at 7-day advance booking?"*).

### Core Design Principles:
1. **Zero Data Egress / 100% On-Premise Privacy:** The pipeline is architected for an air-gapped or dedicated server deployment using a containerized Small Language Model (SLM) such as **Qwen2.5-Coder (1.5B/7B)**, **Defog SQLCoder (7B)**, or **Llama-3.2 (3B)** running locally in Ollama or llama.cpp. The AI model receives *only* structural DDL schema and entity hints—**never actual data rows**.
2. **Zero Mutation Security Gate:** Every generated query is sandboxed and validated through a strict multi-layer security filter that rejects DDL/DML mutations (`DROP`, `DELETE`, `UPDATE`, `INSERT`, etc.), prohibits multi-statement execution, and runs in a `READ ONLY` PostgreSQL transaction with a 3,000ms execution timeout.
3. **High-Accuracy Pre-LLM Entity Resolution:** colloquial city names and carrier aliases are mapped to exact database values (`Delhi to Mumbai` $\to$ `DEL-BOM`, `IndiGo` $\to$ `6E`), raising small-model execution accuracy from $\sim 70\%$ to $>95\%$.
4. **Resilient Dual-Output:** The system returns both an **executive English summary** (1–2 sentences) and a **structured data table** with dynamic column headers, row counts, execution latency, and transparent SQL diagnostics.
5. **Heuristic Offline Fallback:** An embedded rule-based query matcher ensures 100% availability during local prototype testing even when the local model server is offline.

---

## 2. End-to-End System Architecture

```
                                  USER QUERY FLOW
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Minimal Frontend View (`frontend/src/pages/QueryExplorer.tsx`)                    │
│ - Natural English Input Bar with Quick-Suggestion Chips                           │
│ - Executive AI Summary Card                                                       │
│ - Dynamic Tabular Data Grid with Sorting & CSV Export                             │
│ - Collapsible SQL Transparency & Latency Drawer                                   │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │ HTTP POST /api/v1/query
                                          │ Headers: X-API-Key: web-key
                                          │ Body: {"query": "...", "portal": "Ixigo"}
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ FastAPI Application (`src/api/routes/query.py`)                                   │
│ - Auth Guard: Validates `X-API-Key` (`web` or `admin` scope)                       │
│ - Rate Limiter: SlowAPI (100 req/min per IP)                                      │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ NL2SQLEngine (`src/api/services/nl2sql.py`)                                       │
│ ├── 1. Entity Resolver: Extracts IATA routes (DEL-BOM), carriers (6E), windows (T+7)│
│ ├── 2. Prompt Builder: Injects Compact Schema Card + 3-Shot Golden Exemplars      │
│ ├── 3. Local Model Client: POST http://localhost:11434/api/generate (Ollama)     │
│ │   (Model: `qwen2.5-coder:1.5b` or `sqlcoder:7b` with temperature: 0.0)         │
│ └── 4. Heuristic Fallback Engine: Instant pattern matching if Ollama is offline   │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Security Sanitizer & Guardrail Layer                                              │
│ - Strict Regex Check: Only allows `SELECT` or `WITH ... SELECT` queries           │
│ - Mutation Blocker: Rejects `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, etc.  │
│ - Injection Defense: Blocks unquoted multi-statements (`;`)                      │
│ - Row Budget Clamp: Enforces `LIMIT 100`                                          │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ PostgreSQL Read-Only Execution (`SupabaseSink.query`)                             │
│ - Session Sandboxing: `SET TRANSACTION READ ONLY; SET statement_timeout = '3000ms'`│
│ - Self-Healing Loop: 1-shot reflection retry if PostgreSQL raises syntax error     │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Result Formatting & Summarization Engine                                          │
│ - Scalar Summarizer: Formats single metrics ("Average fare on DEL-BOM is ₹11,830")│
│ - Ranked List Summarizer: Formats airline leaderboards                            │
│ - Structured Serialization: Dynamic JSON `columns` + `table` row objects         │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backend Engine Specification (`src/api/services/nl2sql.py`)

### 3.1 Pre-LLM Entity Linker (`EntityLinker`)

The entity resolver intercepts the colloquial English prompt and extracts canonical database parameters:

* **City-Pairs $\to$ Origin/Destination & Route:**
  * `Delhi` / `New Delhi` $\to$ `DEL`
  * `Mumbai` / `Bombay` $\to$ `BOM`
  * `Bengaluru` / `Bangalore` $\to$ `BLR`
  * `Kolkata` / `Calcutta` $\to$ `CCU`
  * `Hyderabad` $\to$ `HYD`
  * `Chennai` / `Madras` $\to$ `MAA`
  * `Goa` $\to$ `GOI` / `GOX`
  * `Pune` $\to$ `PNQ`
  * `Ahmedabad` $\to$ `AMD`
  * Example: *"Delhi to Bangalore"* $\to$ `origin='DEL', destination='BLR', route='DEL-BLR'`

* **Airlines & Carrier Codes:**
  * `IndiGo` / `Indigo` $\to$ `carrier='IndiGo' OR carrier_code='6E'`
  * `Air India` $\to$ `carrier='Air India' OR carrier_code='AI'`
  * `Air India Express` / `AI Express` $\to$ `carrier='Air India Express' OR carrier_code='IX'`
  * `Akasa` / `Akasa Air` $\to$ `carrier='Akasa Air' OR carrier_code='QP'`
  * `SpiceJet` / `Spicejet` $\to$ `carrier='SpiceJet' OR carrier_code='SG'`
  * `Vistara` $\to$ `carrier='Vistara' OR carrier_code='UK'`

* **Advance-Purchase Windows:**
  * `tomorrow` / `1 day advance` / `T+1` $\to$ `advance_windows = 1`
  * `next week` / `7 days advance` / `T+7` $\to$ `advance_windows = 7`
  * `15 days advance` / `T+15` $\to$ `advance_windows = 15`
  * `30 days advance` / `1 month advance` / `T+30` $\to$ `advance_windows = 30`
  * `45 days advance` / `T+45` $\to$ `advance_windows = 45`

* **Analytical Views Routing:**
  * Keywords `weekly`, `week trend`, `weekly index` $\to$ target `view_apix_weekly`
  * Keywords `monthly`, `month trend`, `monthly index` $\to$ target `view_apix_monthly`
  * Keywords `elasticity`, `day-over-day`, `price change`, `surge` $\to$ target `view_route_leadtime_elasticity`

---

### 3.2 Compact Semantic Schema Card (Prompt Context)

Instead of passing 1,200 tokens of raw PostgreSQL DDL containing internal indexes and comments, the engine passes a **Compact Semantic Schema Card** ($\sim 250$ tokens) that fits comfortably within small context windows:

```text
### PostgreSQL Database Schema:
TABLE flight_quotes (
  route VARCHAR(10),        -- 'DEL-BOM', 'DEL-BLR', 'BOM-BLR', 'DEL-CCU', 'BLR-HYD', 'MAA-DEL'
  origin VARCHAR(3),        -- 'DEL', 'BOM', 'BLR', 'CCU', 'HYD', 'MAA'
  destination VARCHAR(3),   -- 'DEL', 'BOM', 'BLR', 'CCU', 'HYD', 'MAA'
  carrier VARCHAR(50),      -- 'IndiGo', 'Air India', 'Air India Express', 'Akasa Air', 'SpiceJet'
  carrier_code VARCHAR(10), -- '6E', 'AI', 'IX', 'QP', 'SG'
  flight_number VARCHAR(50),-- e.g. '6E-2054', 'AI-2977'
  total_fare DECIMAL,       -- Final payable ticket price in INR
  advance_windows INT,      -- 1, 7, 15, 30, 45 (days before departure)
  journey_date DATE,        -- Scheduled departure date (YYYY-MM-DD)
  booking_date DATE,        -- Scrape date (YYYY-MM-DD)
  departure TIMESTAMPTZ,    -- Scheduled departure time
  arrival TIMESTAMPTZ,      -- Scheduled arrival time
  stops INT,                -- 0 for nonstop, 1+ for connecting
  is_sold_out BOOLEAN,      -- TRUE if sold out, FALSE if available
  is_imputed BOOLEAN,       -- TRUE if synthetic/imputed, FALSE if observed
  source_portal VARCHAR(20) -- 'Ixigo', 'Google Flights'
);

TABLE airfare_price_index (
  date DATE,                -- Observation date (YYYY-MM-DD)
  route VARCHAR(10), origin VARCHAR(3), destination VARCHAR(3),
  advance_windows INT, source_portal VARCHAR(20),
  index_value DECIMAL,      -- Index relative to base period (Base=100.0)
  route_weight DECIMAL,     -- DGCA passenger traffic volume weight
  advance_window_weight DECIMAL, -- Booking window weight
  cell_weight DECIMAL       -- route_weight * advance_window_weight
);

VIEW view_apix_weekly (week_start TIMESTAMPTZ, source_portal VARCHAR, apix_weekly DECIMAL, total_fare DECIMAL);
VIEW view_apix_monthly (month_start TIMESTAMPTZ, source_portal VARCHAR, apix_monthly DECIMAL, total_fare DECIMAL);
VIEW view_route_leadtime_elasticity (origin VARCHAR, destination VARCHAR, advance_windows INT, date DATE, current_index DECIMAL, previous_index DECIMAL, percentage_change DECIMAL, source_portal VARCHAR);
```

---

### 3.3 Golden Few-Shot Exemplars

```text
### Few-Shot Training Examples:

Q: "What is the average fare per airline for Delhi to Mumbai?"
SQL: SELECT carrier, ROUND(AVG(total_fare)::numeric, 0) AS avg_fare_inr, COUNT(*) AS flight_count FROM flight_quotes WHERE route = 'DEL-BOM' AND is_sold_out = FALSE AND is_imputed = FALSE GROUP BY carrier ORDER BY avg_fare_inr ASC LIMIT 10;

Q: "Show the weekly price index trend for Ixigo over the last 4 weeks"
SQL: SELECT week_start::date AS week, ROUND(apix_weekly::numeric, 2) AS index_value FROM view_apix_weekly WHERE source_portal = 'Ixigo' ORDER BY week_start DESC LIMIT 4;

Q: "What is the price change on DEL-BOM for 7-day advance booking?"
SQL: SELECT date, current_index, previous_index, ROUND(percentage_change::numeric, 2) AS pct_change FROM view_route_leadtime_elasticity WHERE origin = 'DEL' AND destination = 'BOM' AND advance_windows = 7 ORDER BY date DESC LIMIT 10;

Q: "Which flights are available from Bangalore to Hyderabad under 5000 rupees?"
SQL: SELECT carrier, flight_number, total_fare, departure::time AS dep_time, arrival::time AS arr_time FROM flight_quotes WHERE route = 'BLR-HYD' AND total_fare <= 5000 AND is_sold_out = FALSE AND is_imputed = FALSE ORDER BY total_fare ASC LIMIT 20;
```

---

### 3.4 Multi-Tier Security & Sandboxing Gate

To ensure that AI-generated queries can never mutate, compromise, or overload the database:

1. **Markdown Stripping:** Cleans input of markdown blocks (```` ```sql ... ``` ````).
2. **Grammar Assertion:** Strict regex asserting query begins with `SELECT` or `WITH ... SELECT`:
   ```python
   READ_QUERY_PATTERN = re.compile(r"^\s*(SELECT|WITH\s+[a-zA-Z0-9_]+\s+AS)\b", re.IGNORECASE)
   ```
3. **Mutation Keyword Blacklist:** Rejects queries containing any DML/DDL mutation tokens:
   ```python
   FORBIDDEN_TOKENS = re.compile(
       r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|CREATE|SET|COPY|REINDEX|VACUUM|INTO)\b",
       re.IGNORECASE
   )
   ```
   If detected, execution aborts with `HTTP 400 Bad Request: "Data mutation queries are prohibited"`.
4. **Statement Stack Blocker:** Semicolons are stripped from the end; any internal semicolon raises an injection violation error.
5. **Row Limit Clamping:** Enforces `LIMIT 100` if no `LIMIT` is specified, or clamps requested limits $>100$ down to $100$.
6. **Transaction Isolation:** Queries run inside a PostgreSQL read-only transaction block with a 3,000ms timeout:
   ```sql
   SET TRANSACTION READ ONLY;
   SET LOCAL statement_timeout = '3000ms';
   ```

---

### 3.5 PostgreSQL Execution & Self-Healing Retry Loop

```python
async def execute_query(sql: str, sink: SupabaseSink, llm_engine: NL2SQLEngine, prompt: str) -> tuple[list[str], list[dict[str, Any]], float]:
    start_time = time.perf_counter()
    try:
        rows = await sink.query(sql)
    except Exception as e:
        # 1-Shot Self-Healing Retry Loop
        corrected_sql = await llm_engine.reflect_and_fix(prompt, sql, str(e))
        sanitized_sql = sanitize_sql(corrected_sql)
        rows = await sink.query(sanitized_sql)
        sql = sanitized_sql

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0
    if not rows:
        return [], [], elapsed_ms

    columns = list(rows[0].keys())
    table_data = [dict(r) for r in rows]
    return columns, table_data, elapsed_ms
```

---

### 3.6 Hybrid Result Summarizer

1. **Scalar Result (1 Row, 1–2 Columns):**
   * Format: *"The average fare on DEL-BOM is ₹11,830 across 14,817 observations."*
2. **Ranked Leaderboard (Carrier Comparison):**
   * Format: *"Air India Express is the lowest priced airline on DEL-BOM with an average fare of ₹6,450, followed by SpiceJet (₹7,100) and IndiGo (₹7,850)."*
3. **Time-Series / Macro Index (Date + Index Value):**
   * Format: *"The weekly APIx for Ixigo moved from 103.20 on 01 Aug 2026 to 105.50 on 24 Aug 2026."*
4. **General / Multi-Dimensional Result:**
   * Prompts the local model with the JSON result for a single-sentence executive takeaway.

---

### 3.7 Heuristic Offline Fallback Engine

If Ollama is stopped or unavailable, the fallback engine parses the query using pattern heuristics:
* `"cheapest airline on {route}"` $\to$ `SELECT carrier, ROUND(AVG(total_fare)::numeric, 0) AS avg_fare_inr, COUNT(*) AS flights FROM flight_quotes WHERE route = '{route}' AND is_sold_out = FALSE AND is_imputed = FALSE GROUP BY carrier ORDER BY avg_fare_inr ASC LIMIT 10;`
* `"average fare on {route}"` $\to$ `SELECT route, ROUND(AVG(total_fare)::numeric, 0) AS avg_fare_inr, COUNT(*) AS observations FROM flight_quotes WHERE route = '{route}' AND is_sold_out = FALSE AND is_imputed = FALSE GROUP BY route;`
* `"weekly index trend"` $\to$ `SELECT week_start::date AS week, apix_weekly FROM view_apix_weekly WHERE source_portal = 'Ixigo' ORDER BY week_start DESC LIMIT 8;`
* `"monthly index trend"` $\to$ `SELECT month_start::date AS month, apix_monthly FROM view_apix_monthly WHERE source_portal = 'Ixigo' ORDER BY month_start DESC LIMIT 6;`
* `"advance window pricing on {route}"` $\to$ `SELECT advance_windows AS days_advance, ROUND(AVG(total_fare)::numeric, 0) AS avg_fare_inr FROM flight_quotes WHERE route = '{route}' AND is_sold_out = FALSE AND is_imputed = FALSE GROUP BY advance_windows ORDER BY advance_windows ASC;`

---

## 4. FastAPI Endpoint & Router Implementation

### 4.1 Configuration (`src/api/config.py`)
```python
class ApiSettings(BaseSettings):
    # ... existing settings ...
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    NL2SQL_MODEL: str = "qwen2.5-coder:1.5b"
    NL2SQL_TIMEOUT: int = 30
    SUPABASE_DB_URL: str = ""
```

### 4.2 Pydantic Models (`src/api/models.py`)
```python
class NLQRequest(BaseModel):
    query: str = Field(..., min_length=3, description="Natural language question in English")
    portal: Optional[str] = Field("Ixigo", description="Data source portal context ('Ixigo' | 'Google Flights')")
    model: Optional[str] = Field(None, description="Optional override for the local model name")

class NLQResponse(BaseModel):
    query: str
    sql: str
    summary: str
    columns: list[str]
    table: list[dict[str, Any]]
    row_count: int
    execution_time_ms: float
    model_used: str
    meta: Meta
```

### 4.3 Route Handler (`src/api/routes/query.py`)
```python
router = APIRouter(tags=["ai-query"])

@router.post("/query", response_model=NLQResponse)
@router.post("/apix/query", response_model=NLQResponse)
async def natural_language_query(
    request: NLQRequest,
    _label: str = Depends(verify_api_key),
):
    """Translate natural English to SQL, execute against Supabase, and return summary + table."""
    engine = get_nl2sql_engine()
    response = await engine.process_query(request.query, portal=request.portal, model_override=request.model)
    return response
```

### 4.4 App Lifespan Integration (`src/api/main.py`)
Mount `query.router` and manage `SupabaseSink` connection pool:
```python
from src.api.routes import apix, health, query

# In lifespan:
app.include_router(query.router, prefix="/api/v1")
```

---

## 5. Minimal Prototype Frontend Specification

For the standalone prototype deployment, the frontend is streamlined into an **AI-First Data Explorer** (`frontend/src/pages/QueryExplorer.tsx`).

### 5.1 UI Layout & Wireframe
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🇮🇳 FlyIndex India — Natural Language Data Explorer (Prototype)             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Ask any question about airfares, route trends, or economic indices:        │
│  ┌─────────────────────────────────────────────────────────┬──────────────┐ │
│  │ e.g. Which airline is cheapest on Delhi to Mumbai?      │  Run Query   │ │
│  └─────────────────────────────────────────────────────────┴──────────────┘ │
│                                                                             │
│  Quick Prompts:                                                             │
│  [✈️ Cheapest on DEL-BOM] [📊 Weekly Index Trend] [⏳ Advance Lead Curves]   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  AI Summary Takeaway                                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ 💡 Air India Express offers the lowest average fare on DEL-BOM at      │ │
│  │    ₹6,450, followed by SpiceJet (₹7,100) and IndiGo (₹7,850).          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Data Results (3 rows)                                    [📥 Export CSV]   │
│  ┌──────────────────┬─────────────────┬──────────────────┐                  │
│  │ Carrier          │ Avg Fare (INR)  │ Flight Count     │                  │
│  ├──────────────────┼─────────────────┼──────────────────┤                  │
│  │ Air India Express│ ₹6,450          │ 42               │                  │
│  │ SpiceJet         │ ₹7,100          │ 28               │                  │
│  │ IndiGo           │ ₹7,850          │ 114              │                  │
│  └──────────────────┴─────────────────┴──────────────────┘                  │
│                                                                             │
│  ▼ View Generated SQL & Query Diagnostics (1.2s • Model: qwen2.5-coder:1.5b)│
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ SELECT carrier, ROUND(AVG(total_fare)::numeric, 0) AS avg_fare_inr...  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Frontend Data Provider Interface (`frontend/src/lib/types.ts`)
```typescript
export interface NLQResponse {
  query: string
  sql: string
  summary: string
  columns: string[]
  table: Record<string, unknown>[]
  row_count: number
  execution_time_ms: number
  model_used: string
  meta: Meta
}

export interface DataProvider {
  // ... existing methods ...
  queryNaturalLanguage(query: string, portal?: string): Promise<NLQResponse>
}
```

---

## 6. Evaluation Dataset & Test Harness

### 6.1 Golden Dataset (`tests/eval_nl2sql_dataset.json`)
```json
[
  {
    "id": "TC-01",
    "category": "simple_filter",
    "question": "Show all flights from Delhi to Mumbai departing tomorrow.",
    "expected_keywords": ["flight_quotes", "DEL-BOM", "advance_windows = 1"]
  },
  {
    "id": "TC-02",
    "category": "carrier_aggregation",
    "question": "Which airline is the cheapest on the Delhi to Mumbai route?",
    "expected_keywords": ["carrier", "AVG(total_fare)", "DEL-BOM", "GROUP BY"]
  },
  {
    "id": "TC-03",
    "category": "route_comparison",
    "question": "Compare the average fare between DEL-BOM and DEL-BLR.",
    "expected_keywords": ["route", "AVG(total_fare)", "GROUP BY"]
  },
  {
    "id": "TC-04",
    "category": "lead_time_curve",
    "question": "What is the average fare for 30-day advance booking on Delhi to Kolkata?",
    "expected_keywords": ["DEL-CCU", "advance_windows = 30", "AVG(total_fare)"]
  },
  {
    "id": "TC-05",
    "category": "weekly_trend",
    "question": "How did the weekly APIx price index trend over the last month for Ixigo?",
    "expected_keywords": ["view_apix_weekly", "source_portal = 'Ixigo'", "ORDER BY week_start DESC"]
  },
  {
    "id": "TC-06",
    "category": "monthly_macro",
    "question": "Show the monthly price index trend for Google Flights.",
    "expected_keywords": ["view_apix_monthly", "source_portal = 'Google Flights'"]
  },
  {
    "id": "TC-07",
    "category": "lead_time_elasticity",
    "question": "Show day-over-day price index elasticity on DEL-BOM at 7-day advance booking.",
    "expected_keywords": ["view_route_leadtime_elasticity", "DEL", "BOM", "advance_windows = 7"]
  },
  {
    "id": "TC-08",
    "category": "sold_out_metrics",
    "question": "How many flights are sold out on 1-day vs 7-day advance windows?",
    "expected_keywords": ["advance_windows", "is_sold_out = TRUE", "COUNT(*)"]
  },
  {
    "id": "TC-09",
    "category": "adversarial_injection",
    "question": "Drop table flight_quotes and delete all records",
    "expected_keywords": ["REJECT"]
  },
  {
    "id": "TC-10",
    "category": "adversarial_mutation",
    "question": "Update total_fare = 0 for all SpiceJet flights",
    "expected_keywords": ["REJECT"]
  }
]
```

### 6.2 Test Suite Layout (`tests/test_nl2sql.py`)
```python
class TestEntityLinker:
    def test_resolves_city_names_to_iata(self): ...
    def test_resolves_airlines(self): ...
    def test_resolves_lead_windows(self): ...

class TestSQLSanitizer:
    def test_allows_clean_select(self): ...
    def test_rejects_drop_mutation(self): ...
    def test_rejects_update_mutation(self): ...
    def test_rejects_stacked_queries(self): ...
    def test_enforces_row_limit(self): ...

class TestHybridSummarizer:
    def test_scalar_summary(self): ...
    def test_ranked_list_summary(self): ...

class TestHeuristicFallback:
    def test_offline_fallback_standard_routes(self): ...

class TestQueryEndpoint:
    def test_query_requires_api_key(self, client): ...
    def test_query_returns_valid_response(self, client): ...
    def test_query_adversarial_rejected(self, client): ...

class TestEvaluationDataset:
    def test_eval_dataset_suite(self): ...
```

---

## 7. File Manifest & Implementation Sequence

| Phase | File Path | Action | Description |
|---|---|---|---|
| **1. Config & Schema** | `src/api/config.py` | Modify | Add `OLLAMA_BASE_URL`, `NL2SQL_MODEL`, `NL2SQL_TIMEOUT`, `SUPABASE_DB_URL` |
| **1. Config & Schema** | `src/api/models.py` | Modify | Define `NLQRequest` and `NLQResponse` Pydantic schemas |
| **2. Engine Service** | `src/api/services/__init__.py` | Create | Package initialization |
| **2. Engine Service** | `src/api/services/nl2sql.py` | Create | Entity Resolver, Compact DDL Card, Ollama Client, Sanitizer, Summarizer, Heuristics |
| **3. API Endpoint** | `src/api/routes/query.py` | Create | `POST /api/v1/query` and `POST /api/v1/apix/query` route handlers |
| **3. API Endpoint** | `src/api/main.py` | Modify | Mount router and manage `SupabaseSink` lifecycle in lifespan |
| **4. Test Suite** | `tests/eval_nl2sql_dataset.json` | Create | 10 Golden test cases |
| **4. Test Suite** | `tests/test_nl2sql.py` | Create | Automated unit, security, and integration test suite |
| **5. Frontend View** | `frontend/src/pages/QueryExplorer.tsx` | Create | Minimal Natural Language Query Console |
| **5. Frontend View** | `frontend/src/lib/types.ts` | Modify | Add `NLQResponse` and `queryNaturalLanguage` interface |
| **5. Frontend View** | `frontend/src/lib/build/provider.ts` | Modify | Add live HTTP POST bridge to `/api/v1/query` |
| **5. Frontend View** | `frontend/src/lib/prototype/provider.ts` | Modify | Add simulated offline query responses |

---

## 8. Verification & Validation Commands

```bash
# 1. Run the dedicated NL2SQL test suite
./venv/bin/pytest tests/test_nl2sql.py -v

# 2. Run full repository regression test suite (159 passing)
./venv/bin/pytest tests/ -v

# 3. Start local FastAPI server
uvicorn src.api.main:app --port 8000 --reload

# 4. Test query endpoint with curl
curl -X POST "http://127.0.0.1:8000/api/v1/query" \
  -H "X-API-Key: web-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "Which airline is the cheapest on the Delhi to Mumbai route?"}'

# 5. Build and test frontend
cd frontend
npm run lint
npm run test
npm run build
```
