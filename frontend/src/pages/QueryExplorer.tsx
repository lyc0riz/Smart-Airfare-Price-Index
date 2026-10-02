import { useState, useEffect, useMemo, FormEvent } from 'react'
import {
  Sparkles,
  Search,
  Download,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronUp,
  Database,
  RefreshCw,
  Code2,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { useDataProvider } from '../hooks/useDataProvider'
import type { NLQResponse } from '../lib/types'
import { formatINR, pct, cn } from '../lib/utils'

const QUICK_PROMPTS = [
  { label: '✈️ Cheapest on DEL-BOM', query: 'Which airline is the cheapest on the Delhi to Mumbai route?' },
  { label: '📊 Weekly APIx Trend', query: 'Show the weekly price index trend for Ixigo over the last month' },
  { label: '⏳ Lead-Time Elasticity', query: 'What is the price change on DEL-BOM for 7-day advance booking?' },
  { label: '🌐 All Routes Comparison', query: 'Compare average fares and passenger traffic weights across all routes' },
  { label: '🛫 Flight Schedules', query: 'Show available flights from Bangalore to Hyderabad under 5000 rupees' },
  { label: '🛡️ Test Security Gate', query: 'Drop table flight_quotes and delete all records' },
]

function formatColumnHeader(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\binr\b/i, '(INR)')
    .replace(/\bpct\b/i, '(%)')
    .replace(/\bapix\b/i, 'APIx')
    .replace(/\b(\w)/g, (c) => c.toUpperCase())
}

function formatCellValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    if (key.includes('fare') || key.includes('price')) {
      return formatINR(value)
    }
    if (key.includes('pct') || key.includes('percentage') || key.includes('change')) {
      return pct(value, 2)
    }
    if (key.includes('index')) {
      return value.toFixed(2)
    }
    return value.toLocaleString('en-IN')
  }
  return String(value)
}

export function QueryExplorer() {
  const { provider } = useDataProvider()
  const [inputQuery, setInputQuery] = useState('Which airline is the cheapest on the Delhi to Mumbai route?')
  const [portal, setPortal] = useState<'Ixigo' | 'Google Flights'>('Ixigo')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<NLQResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSql, setShowSql] = useState(true)

  async function handleQuerySubmit(queryToRun: string = inputQuery, portalToUse: 'Ixigo' | 'Google Flights' = portal) {
    if (!queryToRun.trim()) return
    setLoading(true)
    setError(null)
    try {
      await new Promise((resolve) => setTimeout(resolve, 180))
      const res = await provider.queryNaturalLanguage(queryToRun.trim(), portalToUse)
      setResponse(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute natural language query.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Run initial demo query on mount
    handleQuerySubmit('Which airline is the cheapest on the Delhi to Mumbai route?')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    handleQuerySubmit(inputQuery, portal)
  }

  function handlePromptClick(promptQuery: string) {
    setInputQuery(promptQuery)
    handleQuerySubmit(promptQuery, portal)
  }

  function exportCSV() {
    if (!response || !response.table.length) return
    const headers = response.columns.join(',')
    const rows = response.table.map((row) =>
      response.columns.map((col) => {
        const val = row[col]
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val}"`
        }
        return val ?? ''
      }).join(',')
    )
    const csvContent = [headers, ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `apix_query_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Generate dynamic table column configuration
  const tableColumns = useMemo(() => {
    if (!response || !response.columns.length) return []
    return response.columns.map((col) => ({
      key: col,
      header: formatColumnHeader(col),
      align: (col.includes('fare') || col.includes('count') || col.includes('index') || col.includes('pct') || col.includes('price') || col.includes('change'))
        ? ('right' as const)
        : ('left' as const),
      accessor: (row: Record<string, unknown>) => {
        const val = row[col]
        const formatted = formatCellValue(col, val)
        if (col.includes('change') && typeof val === 'number') {
          return (
            <span className={cn('tabular-nums font-medium', val > 0 ? 'text-rose-600 dark:text-rose-400' : val < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
              {formatted}
            </span>
          )
        }
        return <span className="tabular-nums text-foreground">{formatted}</span>
      },
    }))
  }, [response])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        {/* Header Hero Section */}
        <section className="border-b border-border bg-muted/40 py-8">
          <div className="container-gov">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Sovereign SLM NL2SQL
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    Zero Data Egress
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
                  Natural Language Query Console
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground sm:text-base">
                  Query the Real-Time Airfare Price Index database in conversational English. Translates institutional prompts into sandboxed, read-only SQL with real-time tabular analysis.
                </p>
              </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="portal-select" className="text-xs font-medium text-muted-foreground">Source Portal:</label>
                  <Select
                    id="portal-select"
                    className="w-36 text-xs"
                    value={portal}
                    onChange={(e) => {
                      const nextPortal = e.target.value as 'Ixigo' | 'Google Flights'
                      setPortal(nextPortal)
                      handleQuerySubmit(inputQuery, nextPortal)
                    }}
                  >
                    <option value="Ixigo">Ixigo (Primary)</option>
                    <option value="Google Flights">Google Flights</option>
                  </Select>
                </div>
              </div>
            </div>
          </section>

          <div className="container-gov mt-6 space-y-6">
            {/* Query Bar Card */}
            <Card className="p-4 sm:p-6 shadow-sm border-border">
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="relative flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={inputQuery}
                      onChange={(e) => setInputQuery(e.target.value)}
                      placeholder="Ask anything (e.g. Which airline is cheapest on Delhi to Mumbai?)"
                      className="h-12 w-full rounded-sm border border-border bg-background pl-11 pr-10 text-sm sm:text-base text-foreground shadow-inner placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                    />
                    {inputQuery && (
                      <button
                        type="button"
                        onClick={() => setInputQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground p-1"
                        aria-label="Clear query input"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading || !inputQuery.trim()}
                    onClick={() => handleQuerySubmit(inputQuery, portal)}
                    className="gap-2 sm:w-36 font-semibold cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Run Query
                      </>
                    )}
                  </Button>
                </div>

              {/* Suggestion Chips */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                  Institutional Query Exemplars
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => handlePromptClick(prompt.query)}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground hover:border-primary/50 hover:bg-accent transition-colors text-left"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </Card>

          {/* Error Message */}
          {error && (
            <Card className="border-destructive/40 bg-destructive/10 p-4 text-destructive">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{error}</p>
              </div>
            </Card>
          )}

          {/* AI Executive Takeaway Card */}
          {response && (
            <Card className="relative overflow-hidden border-primary/30 bg-primary/5 p-5">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">
                      Executive AI Takeaway
                    </h2>
                    <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border">
                      {response.execution_time_ms.toFixed(1)}ms
                    </span>
                  </div>
                  <p className="text-sm sm:text-base font-medium text-foreground leading-relaxed">
                    {response.summary}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Results Table Section */}
          {response && response.table.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">
                    Structured Data Results
                  </h3>
                  <span className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
                    {response.row_count} {response.row_count === 1 ? 'row' : 'rows'}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCSV}
                  className="gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>

              <Table
                columns={tableColumns}
                data={response.table}
                keyExtractor={(row: Record<string, unknown>) => JSON.stringify(row)}
                striped
                hoverable
              />
            </section>
          )}

          {/* SQL Transparency & Diagnostics Drawer */}
          {response && (
            <Card className="overflow-hidden border-border bg-card">
              <button
                type="button"
                onClick={() => setShowSql(!showSql)}
                className="flex w-full items-center justify-between px-4 py-3 bg-muted/30 text-left hover:bg-muted/50 transition-colors border-b border-border"
              >
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground">
                    SQL Transparency & Sandboxed Execution Diagnostics
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">Engine: {response.model_used}</span>
                  {showSql ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {showSql && (
                <div className="p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Generated Read-Only PostgreSQL Statement
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Isolation: READ ONLY • Statement Timeout: 3000ms
                      </span>
                    </div>
                    <pre className="overflow-x-auto rounded-sm bg-muted/80 p-3.5 font-mono text-xs text-foreground leading-relaxed border border-border">
                      <code>{response.sql}</code>
                    </pre>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border text-xs">
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase tracking-[0.08em]">Model / Mode</p>
                      <p className="font-medium text-foreground mt-0.5 truncate">{response.model_used}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase tracking-[0.08em]">Execution Latency</p>
                      <p className="font-medium text-foreground mt-0.5">{response.execution_time_ms.toFixed(1)} ms</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase tracking-[0.08em]">Data Privacy</p>
                      <p className="font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">Air-Gapped / Zero Egress</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase tracking-[0.08em]">Target Schema</p>
                      <p className="font-medium text-foreground mt-0.5">DGCA APIx Canonical</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
