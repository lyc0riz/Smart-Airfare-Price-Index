import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, KeyRound, TerminalSquare } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/utils'

interface EndpointParam {
  name: string
  required: boolean
  example: string
  description: string
}

interface Endpoint {
  method: 'GET'
  path: string
  tag: string
  summary: string
  params: EndpointParam[]
  example: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://smart-airfare-price-index.onrender.com/api/v1'
const API_KEY = import.meta.env.VITE_API_KEY || ''

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/apix/latest',
    tag: 'APEx',
    summary: "Today's all-India APIx plus recent history.",
    params: [
      { name: 'portal', required: false, example: 'Ixigo', description: 'Source portal (Ixigo | Google Flights)' },
    ],
    example: 'curl -H "X-API-Key: $API_KEY" "https://smart-airfare-price-index.onrender.com/api/v1/apix/latest?portal=Ixigo"',
  },
  {
    method: 'GET',
    path: '/apix/weekly',
    tag: 'APEx',
    summary: 'Weekly aggregated index.',
    params: [
      { name: 'portal', required: false, example: 'Ixigo', description: 'Source portal' },
      { name: 'limit', required: false, example: '52', description: 'Weeks (1–104)' },
    ],
    example: 'curl -H "X-API-Key: $API_KEY" "https://smart-airfare-price-index.onrender.com/api/v1/apix/weekly?portal=Ixigo&limit=8"',
  },
  {
    method: 'GET',
    path: '/apix/monthly',
    tag: 'APEx',
    summary: 'Monthly aggregated index.',
    params: [
      { name: 'portal', required: false, example: 'Ixigo', description: 'Source portal' },
      { name: 'limit', required: false, example: '24', description: 'Months (1–120)' },
    ],
    example: 'curl -H "X-API-Key: $API_KEY" "https://smart-airfare-price-index.onrender.com/api/v1/apix/monthly?portal=Ixigo&limit=6"',
  },
  {
    method: 'GET',
    path: '/apix/by-route',
    tag: 'APEx',
    summary: 'Index contribution per route for a date.',
    params: [
      { name: 'date', required: true, example: '2026-08-29', description: 'Observation date (YYYY-MM-DD)' },
      { name: 'portal', required: false, example: 'Ixigo', description: 'Source portal' },
    ],
    example: 'curl -H "X-API-Key: $API_KEY" "https://smart-airfare-price-index.onrender.com/api/v1/apix/by-route?date=2026-08-29&portal=Ixigo"',
  },
  {
    method: 'GET',
    path: '/apix/heatmap',
    tag: 'APEx',
    summary: 'Route × advance-window index matrix for a date.',
    params: [
      { name: 'date', required: true, example: '2026-08-29', description: 'Observation date (YYYY-MM-DD)' },
      { name: 'portal', required: false, example: 'Ixigo', description: 'Source portal' },
    ],
    example: 'curl -H "X-API-Key: $API_KEY" "https://smart-airfare-price-index.onrender.com/api/v1/apix/heatmap?date=2026-08-29&portal=Ixigo"',
  },
  {
    method: 'GET',
    path: '/apix/elasticity',
    tag: 'APEx',
    summary: 'Day-over-day change for a route and advance window.',
    params: [
      { name: 'route', required: true, example: 'DEL-BOM', description: 'Route (XXX-XXX)' },
      { name: 'window', required: true, example: '15', description: 'Advance window days (1–45)' },
      { name: 'portal', required: false, example: 'Ixigo', description: 'Source portal' },
      { name: 'limit', required: false, example: '30', description: 'Points (1–90)' },
    ],
    example: 'curl -H "X-API-Key: $API_KEY" "https://smart-airfare-price-index.onrender.com/api/v1/apix/elasticity?route=DEL-BOM&window=15&portal=Ixigo&limit=30"',
  },
  {
    method: 'GET',
    path: '/apix/airlines',
    tag: 'APEx',
    summary: 'Average fare per airline on a route/date.',
    params: [
      { name: 'route', required: true, example: 'DEL-BOM', description: 'Route (XXX-XXX)' },
      { name: 'date', required: true, example: '2026-08-29', description: 'Journey date (YYYY-MM-DD)' },
      { name: 'portal', required: false, example: 'Ixigo', description: 'Source portal' },
    ],
    example: 'curl -H "X-API-Key: $API_KEY" "https://smart-airfare-price-index.onrender.com/api/v1/apix/airlines?route=DEL-BOM&date=2026-08-29&portal=Ixigo"',
  },
  {
    method: 'GET',
    path: '/health',
    tag: 'System',
    summary: 'Service and database status.',
    params: [],
    example: 'curl "https://smart-airfare-price-index.onrender.com/api/v1/health"',
  },
]

function TryIt({ endpoint }: { endpoint: Endpoint }) {
  const [params, setParams] = useState<Record<string, string>>(() =>
    Object.fromEntries(endpoint.params.filter((p) => !p.required).map((p) => [p.name, p.example ?? '']))
  )
  const [response, setResponse] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const url = new URL(`${API_BASE}${endpoint.path}`)
  endpoint.params.forEach((p) => {
    const value = params[p.name]
    if (value) url.searchParams.set(p.name, value)
  })

  async function run() {
    setLoading(true)
    setError(null)
    setResponse(null)
    try {
      const res = await fetch(url.toString(), {
        headers: API_KEY ? { 'X-API-Key': API_KEY } : undefined,
      })
      const text = await res.text()
      if (!res.ok) {
        setError(`${res.status} ${res.statusText} — ${text.slice(0, 200)}`)
      } else {
        setResponse(text)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 rounded-sm border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-sm bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">{endpoint.method}</span>
        <code className="text-sm text-foreground">{url.toString()}</code>
      </div>

      {endpoint.params.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {endpoint.params.map((p) => (
            <div key={p.name}>
              <label htmlFor={`try-${endpoint.path}-${p.name}`} className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                {p.name} {p.required && <span className="text-destructive">*</span>}
              </label>
              <input
                id={`try-${endpoint.path}-${p.name}`}
                type="text"
                value={params[p.name] ?? ''}
                onChange={(e) => setParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                placeholder={p.example}
                className="h-9 w-full rounded-sm border border-border bg-muted/30 px-3 text-sm text-foreground"
              />
              {p.required && <p className="mt-1 text-[11px] text-muted-foreground">{p.description}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={run} loading={loading}>Run Request</Button>
        {response !== null && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> 200 OK
          </span>
        )}
        {error && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {error}
          </span>
        )}
      </div>

      {response !== null && (
        <div className="mt-3 overflow-x-auto rounded-sm border border-border bg-muted/50 p-3">
          <pre className="max-h-80 overflow-auto text-xs leading-relaxed text-foreground">{response}</pre>
        </div>
      )}
    </div>
  )
}

export function ApiDocs() {
  const [activeEndpoint, setActiveEndpoint] = useState(0)
  const [copied, setCopied] = useState(false)
  const endpoint = ENDPOINTS[activeEndpoint]!

  function copyExample() {
    navigator.clipboard?.writeText(endpoint.example).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Developer Resources</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">API Documentation</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Programmatic access to APIx indices and underlying records.
            </p>
          </div>
        </section>

        <section className="container-gov py-8">
          <Card className="p-4 md:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
              Authentication
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              All API requests require an API key passed in the <code className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">X-API-Key</code> header.
              Requests are rate-limited to 100 per minute per IP. The key below is a public demo key
              provided for evaluation.
            </p>
            <div className="mt-4 rounded-sm border border-border bg-muted/50 p-3">
              <code className="text-xs break-all text-foreground">{API_KEY || 'VITE_API_KEY not configured'}</code>
            </div>
          </Card>
        </section>

        <section className="container-gov pb-10">
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className="text-lg font-semibold text-foreground">Endpoints</h2>
              <nav className="mt-4 flex flex-col gap-1" aria-label="API endpoints">
                {ENDPOINTS.map((ep, i) => (
                  <button
                    key={ep.path}
                    type="button"
                    onClick={() => setActiveEndpoint(i)}
                    className={cn(
                      'flex items-center gap-3 rounded-sm border px-3 py-2.5 text-left text-sm transition-colors',
                      activeEndpoint === i
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent'
                    )}
                  >
                    <span className="text-[10px] font-bold text-primary">{ep.method}</span>
                    <code className="truncate">{ep.path}</code>
                  </button>
                ))}
              </nav>
            </div>

            <div className="lg:col-span-8">
              <Card className="p-4 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      {endpoint.tag}
                    </p>
                    <h3 className="mt-1 font-mono text-lg font-semibold text-foreground">
                      {endpoint.method} {endpoint.path}
                    </h3>
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">{endpoint.summary}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={copyExample}>
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    {copied ? 'Copied' : 'Copy Example'}
                  </Button>
                </div>

                {endpoint.params.length > 0 && (
                  <>
                    <h4 className="mt-5 text-sm font-semibold text-foreground">Parameters</h4>
                    <div className="mt-2 overflow-x-auto rounded-sm border border-border">
                      <table className="w-full min-w-[480px] border-collapse">
                        <thead className="bg-muted/50">
                          <tr>
                            {['Name', 'Required', 'Example', 'Description'].map((h) => (
                              <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {endpoint.params.map((p) => (
                            <tr key={p.name} className="bg-background">
                              <td className="px-4 py-2 font-mono text-sm text-foreground">{p.name}</td>
                              <td className="px-4 py-2 text-sm">{p.required ? <span className="font-medium text-destructive">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
                              <td className="px-4 py-2 font-mono text-sm text-muted-foreground">{p.example}</td>
                              <td className="px-4 py-2 text-sm text-muted-foreground">{p.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <h4 className="mt-5 text-sm font-semibold text-foreground">Try It</h4>
                <TryIt key={endpoint.path} endpoint={endpoint} />
              </Card>
            </div>
          </div>

          <div className="mt-6 rounded-sm border-l-2 border-primary border-y border-r border-border bg-muted/50 p-4">
            <h3 className="text-sm font-semibold text-foreground">Rate limits</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              The gateway enforces 100 requests/minute/IP. Exceeding the limit returns HTTP 429.
              Consumers should cache responses and poll no more frequently than every 5 minutes for
              index endpoints.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}