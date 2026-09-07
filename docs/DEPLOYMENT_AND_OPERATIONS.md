# Deployment, CI/CD & Operations Guide

This document covers production deployment, environment configuration, continuous integration, and operational runbooks for **FlyIndex India**.

---

## 1. Render Blueprint Deployment (`render.yaml`)

Both the backend API and frontend dashboard are managed as a single infrastructure-as-code Blueprint on Render:

```yaml
services:
  # 1. FastAPI Backend Service (Docker)
  - type: web
    name: apix-api
    runtime: docker
    repo: https://github.com/lyc0riz/Smart-Airfare-Price-Index
    plan: free
    dockerfilePath: ./api.Dockerfile
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_KEY
        sync: false
      - key: SUPABASE_SERVICE_KEY
        sync: false
      - key: API_KEYS
        sync: false
      - key: CORS_ORIGINS_JSON
        value: '["*"]'
    healthCheckPath: /api/v1/health
    autoDeploy: true

  # 2. React 18 Frontend Dashboard (Static Site)
  - type: static
    name: apix-frontend
    repo: https://github.com/lyc0riz/Smart-Airfare-Price-Index
    plan: free
    rootDir: frontend
    buildCommand: npm ci && npm run build
    publishPath: dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    envVars:
      - key: VITE_API_BASE_URL
        value: https://smart-airfare-price-index.onrender.com/api/v1
      - key: VITE_API_KEY
        sync: false
```

### Essential Settings:
* **SPA Rewrite Rule**: `source: /*` $\to$ `destination: /index.html` prevents `404 Not Found` errors when users reload deep pages (e.g. `/airfare-index` or `/route-analytics`).
* **Root Directory for Frontend**: `rootDir: frontend` ensures Render only builds inside the frontend directory.
* **Auto-Deploy**: Pushing to `master` automatically triggers builds for both services.

---

## 2. Environment Variables Checklist

### Backend (`apix-api`)
| Variable | Description | Example / Value |
|---|---|---|
| `SUPABASE_URL` | Supabase Project HTTPS URL | `https://jroileuazlukbbvmmkxh.supabase.co` |
| `SUPABASE_KEY` | Supabase `anon` / public key | `eyJhbGciOiJIUzI1Ni...` |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` key | `eyJhbGciOiJIUzI1Ni...` |
| `API_KEYS` | JSON map of authorized client keys to scopes | `{"apix-web-dev-key":"web","apix-admin-key":"admin"}` |
| `CORS_ORIGINS_JSON` | JSON list of allowed origins | `["*"]` |
| `RATE_LIMIT_PER_MINUTE` | Rate limit per IP | `100` |

### Frontend (`apix-frontend`)
| Variable | Description | Example / Value |
|---|---|---|
| `VITE_API_BASE_URL` | Live backend API URL | `https://smart-airfare-price-index.onrender.com/api/v1` |
| `VITE_API_KEY` | Web-scoped API key matching `API_KEYS` | `apix-web-dev-key` |
| `VITE_DEFAULT_MODE` | Default data provider mode | `prototype` |

---

## 3. Automated Testing & Verification Suite

Before pushing any commit, execute the full test suite across both stacks:

### Backend Testing (Python)
```bash
# Activate virtual environment
./venv/bin/pytest tests/ -v
```
* **Total Tests:** 159 tests passing.
* **Coverage:** Schema validation, truth triangle parity checks, Jevons geometric mean, Laspeyres index calculation, API route responses, and authentication scopes.

### Frontend Testing (TypeScript / React)
```bash
cd frontend

# Run Vitest test suite with coverage
npm run test

# Run ESLint (0 warnings allowed)
npm run lint

# Run TypeScript typechecker
npx tsc --noEmit

# Run Vite production bundle build
npm run build
```
* **Total Tests:** 144 tests passing across 22 test files.
* **Enforced Coverage Thresholds:**
  * Statements: $> 70\%$ (Actual: $84.7\%$)
  * Branches: $> 60\%$ (Actual: $71.4\%$)
  * Functions: $> 70\%$ (Actual: $85.5\%$)
  * Lines: $> 70\%$ (Actual: $86.5\%$)

---

## 4. Troubleshooting & Operational Runbooks

### Problem: Render Returns `401 Unauthorized` on API Calls
* **Cause**: `VITE_API_KEY` is missing in `frontend/.env` or Render environment settings.
* **Fix**: Ensure `VITE_API_KEY` matches a key defined in `API_KEYS` on the backend service.

### Problem: Browser Throws `TypeError: NetworkError when attempting to fetch resource`
* **Cause**: CORS preflight (`OPTIONS`) rejected by server.
* **Fix**: Confirm `CORS_ORIGINS_JSON='["*"]'` in `render.yaml` or Render dashboard, and ensure `CORSMiddleware` in `src/api/main.py` is active.

### Problem: Direct URL Navigation Gives `404 Not Found` on Refresh
* **Cause**: Static site server is trying to locate `/route-analytics/index.html` on disk.
* **Fix**: Ensure the SPA rewrite rule `source: /*` $\to$ `destination: /index.html` is configured under Redirects/Rewrites on Render.

### Problem: Render Build Fails with `Cannot find module '../lib/build/provider'`
* **Cause**: Unanchored `build/` in `.gitignore` ignored `frontend/src/lib/build/`.
* **Fix**: Use root-anchored `/build/` in `.gitignore` and ensure `frontend/src/lib/build/` is committed to git.
