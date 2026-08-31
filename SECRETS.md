# GitHub Secrets Required for APIx Pipeline

Add these secrets in GitHub repository settings:
**Settings → Secrets and variables → Actions → New repository secret**

## Required Secrets

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `SUPABASE_DB_URL` | PostgreSQL connection string (pooler, port 6543) | `postgresql://postgres.xxx:password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Anon/public API key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_KEY` | Service role key (admin) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `RENDER_DEPLOY_HOOK` | Render deploy hook URL (triggers API deploy) | `https://api.render.com/deploy/srv_xxx?key=yyy` |

## How to Get Values

### From Supabase Dashboard
1. Go to **Project Settings → Database** for `SUPABASE_DB_URL`
2. Go to **Project Settings → API** for `SUPABASE_URL`, `SUPABASE_KEY` (anon), `SUPABASE_SERVICE_KEY` (service_role)

### From Render
1. Deploy the web service from the GitHub repo (see **Render Deployment** below)
2. In the Render dashboard → your service → **Events / Deploy Hooks** → **Create Deploy Hook**
3. Copy the hook URL → paste into `RENDER_DEPLOY_HOOK` GitHub secret

### Render Service Environment Variables (set in Render dashboard)
These are `sync: false` in `render.yaml`, so set them manually in Render:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
API_KEYS={"web-key":"web","admin-key":"admin"}
```

### .env Template (for local development)
```bash
# .env (never commit this)
SUPABASE_DB_URL=postgresql://postgres.xxx:password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Ixigo Cloudflare handling

Ixigo is protected by Cloudflare, which blocks headless Chromium on cloud
runner IPs (GitHub Actions). The pipeline handles this as follows:

1. **Playwright** navigates to the Ixigo homepage and waits for Cloudflare
   to issue a `cf_clearance` cookie (cached for the run).
2. **curl_cffi** replays those cookies against the SSE endpoint using
   Chrome's TLS/HTTP2 fingerprint (`impersonate="chrome"`). curl_cffi is
   required because Cloudflare binds the `cf_clearance` cookie to the TLS
   fingerprint of the client that solved the challenge — aiohttp's fixed
   fingerprint is rejected.
3. If the cookie replay returns no results, the pipeline falls back to the
   Playwright browser context.

No external service or secret is required for Ixigo Cloudflare bypass.

## Workflow Schedule

The workflow runs **twice daily at 2 AM and 2 PM IST**:
- **2 AM IST**  → `30 20 * * *` (20:30 UTC)
- **2 PM IST**  → `30 8 * * *`  (08:30 UTC)

Cron expression: `30 8,20 * * *`

## Manual Trigger

Go to **Actions → Daily APIx Pipeline → Run workflow** for manual execution.

## Artifacts

Pipeline summary JSON is uploaded as artifact on each run (retention: 30 days).

## Failure Notification

On failure, a GitHub Issue is automatically created with the label `pipeline,failure`.

## Render Deployment (API)

The API is deployed as a **Render Web Service** (Docker) — see `render.yaml`.

### One-time setup (in Render dashboard)
1. **dashboard.render.com** → **New → Blueprint** (recommended) or **New → Web Service**
2. Connect your GitHub repo
3. If using **Blueprint**: Render reads `render.yaml`, creates the service, and deploys
   - Fill the `repo` field in `render.yaml` with your repo URL
4. If using **Web Service** manually:
   - **Runtime:** Docker
   - **Dockerfile:** `api.Dockerfile`
   - **Plan:** Free
5. Set env vars (see above) — `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `API_KEYS`
6. Create a **Deploy Hook** → copy URL into GitHub `RENDER_DEPLOY_HOOK` secret

### Deploy behavior
- `render.yaml` has `autoDeploy: true` → every push to the connected branch redeploys
- GitHub Actions (`api-deploy.yml`) runs API tests first, then triggers the **Render Deploy Hook** for explicit control
- The API listens on `$PORT` (set by Render) — see `api.Dockerfile`

### Verify
- Live URL: `https://apix-api.onrender.com/api/v1/health`
- Interactive docs: `https://apix-api.onrender.com/docs`