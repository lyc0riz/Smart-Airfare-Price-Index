import { useEffect, useMemo, useState, FormEvent, KeyboardEvent } from 'react'
import {
  Search,
  Database,
  Download,
  Sparkles,
  Zap,
  ShieldCheck,
  Code2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Terminal,
  Play,
  CheckCircle2,
  AlertTriangle,
  Layers,
  BookOpen,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { useDataProvider } from '../hooks/useDataProvider'
import { useMetadata } from '../hooks/useMetadata'
import { formatINR, formatDate, pct, cn } from '../lib/utils'
import type { RouteRow, ByRouteRow, NLQResponse, SqlQueryResponse } from '../lib/types'
import { DATABASE_SCHEMA_INFO } from '../lib/prototype/sql-engine'

const PAGE_SIZE = 8

const EXPLORER_TABS = [
  { key: 'ai-query', label: 'AI Natural Language Query' },
  { key: 'sql-sandbox', label: 'SQL Sandbox (Read-Only)' },
  { key: 'routes', label: 'Route Observations' },
  { key: 'quotes', label: 'Latest Observed Quotes' },
]

const QUICK_PROMPTS = [
  { label: '✈️ Cheapest on DEL-BOM', query: 'Which airline is the cheapest on the Delhi to Mumbai route?' },
  { label: '📊 Weekly APIx Trend', query: 'Show the weekly price index trend for Ixigo over the last month' },
  { label: '⏳ Lead-Time Elasticity', query: 'What is the price change on DEL-BOM for 7-day advance booking?' },
  { label: '🌐 All Routes Comparison', query: 'Compare average fares and passenger traffic weights across all routes' },
  { label: '🛫 Flight Schedules', query: 'Show available flights from Bangalore to Hyderabad under 5000 rupees' },
  { label: '🛡️ Test Security Gate', query: 'Drop table flight_quotes and delete all records' },
]

const SQL_TEMPLATES = [
  {
    label: 'Carrier Averages (DEL-BOM)',
    sql: `SELECT carrier, carrier_code, ROUND(AVG(total_fare)::numeric, 0) AS avg_fare_inr, MIN(total_fare) AS lowest_fare, COUNT(*) AS flight_count\nFROM flight_quotes\nWHERE route = 'DEL-BOM' AND is_sold_out = false\nGROUP BY carrier, carrier_code\nORDER BY avg_fare_inr ASC;`,
  },
  {
    label: 'Top 10 Lowest Fares',
    sql: `SELECT route, carrier, flight_number, total_fare, departure_time AS dep_time, stops\nFROM flight_quotes\nWHERE is_sold_out = false\nORDER BY total_fare ASC\nLIMIT 10;`,
  },
  {
    label: 'Weekly APIx Index Trend',
    sql: `SELECT week_start, source_portal, apix_weekly AS weekly_index, total_fare AS avg_basket_fare\nFROM view_apix_weekly\nORDER BY week_start DESC\nLIMIT 6;`,
  },
  {
    label: 'Lead-Time Price Elasticity',
    sql: `SELECT origin, destination, advance_windows AS days_advance, current_index, percentage_change AS dod_change_pct\nFROM view_route_leadtime_elasticity\nWHERE origin = 'DEL' AND destination = 'BOM'\nORDER BY date DESC\nLIMIT 5;`,
  },
  {
    label: 'DGCA Route Weights',
    sql: `SELECT route, origin, destination, weight * 100 AS weight_pct\nFROM route_weights\nORDER BY weight_pct DESC;`,
  },
  {
    label: 'Test Security Guard',
    sql: `DROP TABLE flight_quotes;\nDELETE FROM airfare_price_index;`,
  },
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

export function DataExplorer() {
  const { provider } = useDataProvider()
  const { routes, airlines, latestDate } = useMetadata()

  const [activeTab, setActiveTab] = useState('ai-query')

  // NLQ State
  const [inputQuery, setInputQuery] = useState('Which airline is the cheapest on the Delhi to Mumbai route?')
  const [nlqPortal, setNlqPortal] = useState<'Ixigo' | 'Google Flights'>('Ixigo')
  const [nlqLoading, setNlqLoading] = useState(false)
  const [nlqResponse, setNlqResponse] = useState<NLQResponse | null>(null)
  const [nlqError, setNlqError] = useState<string | null>(null)
  const [showSql, setShowSql] = useState(true)

  // SQL Sandbox State
  const [sqlInput, setSqlInput] = useState(SQL_TEMPLATES[0]!.sql)
  const [sqlLoading, setSqlLoading] = useState(false)
  const [sqlResponse, setSqlResponse] = useState<SqlQueryResponse | null>(null)
  const [selectedSchemaTable, setSelectedSchemaTable] = useState<string>('flight_quotes')
  const [showSchemaDrawer, setShowSchemaDrawer] = useState(false)

  // Route Table State
  const [airlineCode, setAirlineCode] = useState('ALL')
  const [portal, setPortal] = useState('Ixigo')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<keyof RouteRow>('avgFare')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)

  const [rows, setRows] = useState<RouteRow[]>([])
  const [liveRows, setLiveRows] = useState<ByRouteRow[] | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)

  // NLQ Query Runner
  async function executeNlq(queryToRun: string = inputQuery, portalToUse: 'Ixigo' | 'Google Flights' = nlqPortal) {
    if (!queryToRun.trim()) return
    setNlqLoading(true)
    setNlqError(null)
    try {
      await new Promise((resolve) => setTimeout(resolve, 180))
      const res = await provider.queryNaturalLanguage(queryToRun.trim(), portalToUse)
      setNlqResponse(res)
    } catch (err) {
      setNlqError(err instanceof Error ? err.message : 'Failed to execute query.')
    } finally {
      setNlqLoading(false)
    }
  }

  // SQL Sandbox Runner
  async function executeSqlSandbox(sqlToRun: string = sqlInput) {
    if (!sqlToRun.trim()) return
    setSqlLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 150))
      const res = await provider.executeSqlQuery(sqlToRun.trim())
      setSqlResponse(res)
    } catch (err) {
      setSqlResponse({
        sql: sqlToRun,
        columns: ['status', 'error'],
        table: [{ status: 'ERROR', error: err instanceof Error ? err.message : 'Execution error' }],
        row_count: 0,
        execution_time_ms: 0,
        status: 'ERROR',
        error_message: err instanceof Error ? err.message : 'Execution error',
      })
    } finally {
      setSqlLoading(false)
    }
  }

  useEffect(() => {
    // Initial NLQ execution
    executeNlq('Which airline is the cheapest on the Delhi to Mumbai route?')
    // Initial SQL Sandbox execution
    executeSqlSandbox(SQL_TEMPLATES[0]!.sql)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    provider.getRouteTable(airlineCode).then((res) => {
      if (!cancelled) setRows(res.data as RouteRow[])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [provider, airlineCode])

  useEffect(() => {
    let cancelled = false
    provider.getByRoute(latestDate, portal).then(
      (res) => { if (!cancelled) { setLiveRows(res.data); setLiveError(null) } },
      (err: unknown) => { if (!cancelled) { setLiveRows(null); setLiveError(err instanceof Error ? err.message : 'Failed to load route data') } }
    )
    return () => { cancelled = true }
  }, [provider, portal, latestDate])

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    executeNlq(inputQuery, nlqPortal)
  }

  function handlePromptClick(promptQuery: string) {
    setInputQuery(promptQuery)
    executeNlq(promptQuery, nlqPortal)
  }

  function handleSqlKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      executeSqlSandbox(sqlInput)
    }
  }

  function exportNlqCSV() {
    if (!nlqResponse || !nlqResponse.table.length) return
    downloadCsv(nlqResponse.columns, nlqResponse.table, 'apix_nlq_results')
  }

  function exportSqlCSV() {
    if (!sqlResponse || !sqlResponse.table.length) return
    downloadCsv(sqlResponse.columns, sqlResponse.table, 'apix_sql_results')
  }

  function downloadCsv(columns: string[], tableData: Record<string, unknown>[], filename: string) {
    const headers = columns.join(',')
    const csvRows = tableData.map((row) =>
      columns.map((col) => {
        const val = row[col]
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val}"`
        }
        return val ?? ''
      }).join(',')
    )
    const csvContent = [headers, ...csvRows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const nlqTableColumns = useMemo(() => {
    if (!nlqResponse || !nlqResponse.columns.length) return []
    return nlqResponse.columns.map((col) => ({
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
  }, [nlqResponse])

  const sqlTableColumns = useMemo(() => {
    if (!sqlResponse || !sqlResponse.columns.length) return []
    return sqlResponse.columns.map((col) => ({
      key: col,
      header: formatColumnHeader(col),
      align: (col.includes('fare') || col.includes('count') || col.includes('index') || col.includes('pct') || col.includes('price') || col.includes('change') || col.includes('weight'))
        ? ('right' as const)
        : ('left' as const),
      accessor: (row: Record<string, unknown>) => {
        const val = row[col]
        const formatted = formatCellValue(col, val)
        if ((col.includes('change') || col.includes('dod')) && typeof val === 'number') {
          return (
            <span className={cn('tabular-nums font-medium', val > 0 ? 'text-rose-600 dark:text-rose-400' : val < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
              {formatted}
            </span>
          )
        }
        if (col === 'status') {
          return (
            <span className={cn('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-semibold uppercase', val === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>
              {val === 'SUCCESS' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {String(val)}
            </span>
          )
        }
        return <span className="tabular-nums text-foreground">{formatted}</span>
      },
    }))
  }, [sqlResponse])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = rows.filter((r) => r.route.toLowerCase().includes(q))
    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' || typeof bv === 'string') {
        return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [rows, query, sortKey, sortAsc])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  function toggleSort(key: string, direction: 'asc' | 'desc') {
    setSortKey(key as keyof RouteRow)
    setSortAsc(direction === 'asc')
    setPage(0)
  }

  const totalObservations = rows.reduce((s, r) => s + r.observations, 0)
  const activeSchemaInfo = DATABASE_SCHEMA_INFO.find((t) => t.name === selectedSchemaTable) || DATABASE_SCHEMA_INFO[0]!

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Open Data</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Data Explorer</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Explore cleaned airfare observations, run read-only SQL queries in a sandboxed environment, and interact via conversational AI.
            </p>
            <dl className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Routes tracked', String(routes.length - 1)],
                ['Latest observation date', formatDate(latestDate)],
                ['Total observations', totalObservations.toLocaleString('en-IN')],
                ['Carriers covered', String(airlines.length - 1)],
              ].map(([term, value]) => (
                <div key={term} className="bg-background px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{term}</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Tab Selection */}
        <div className="container-gov mt-8">
          <Tabs
            tabs={EXPLORER_TABS}
            activeKey={activeTab}
            onChange={setActiveTab}
            className="max-w-2xl"
          />
        </div>

        {/* TAB 1: AI NATURAL LANGUAGE QUERY */}
        {activeTab === 'ai-query' && (
          <div className="container-gov mt-6 space-y-6">
            <Card className="p-4 sm:p-6 shadow-sm border-border">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Conversational Airfare Query
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    Zero Egress
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="nlq-portal-select" className="text-xs font-medium text-muted-foreground">Source:</label>
                  <Select
                    id="nlq-portal-select"
                    className="w-36 text-xs h-8"
                    value={nlqPortal}
                    onChange={(e) => {
                      const nextPortal = e.target.value as 'Ixigo' | 'Google Flights'
                      setNlqPortal(nextPortal)
                      executeNlq(inputQuery, nextPortal)
                    }}
                  >
                    <option value="Ixigo">Ixigo (Primary)</option>
                    <option value="Google Flights">Google Flights</option>
                  </Select>
                </div>
              </div>

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
                    disabled={nlqLoading || !inputQuery.trim()}
                    onClick={() => executeNlq(inputQuery, nlqPortal)}
                    className="gap-2 sm:w-36 font-semibold cursor-pointer"
                  >
                    {nlqLoading ? (
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

            {nlqError && (
              <Card className="border-destructive/40 bg-destructive/10 p-4 text-destructive">
                <p className="text-sm font-medium">{nlqError}</p>
              </Card>
            )}

            {nlqResponse && (
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
                        {nlqResponse.execution_time_ms.toFixed(1)}ms
                      </span>
                    </div>
                    <p className="text-sm sm:text-base font-medium text-foreground leading-relaxed">
                      {nlqResponse.summary}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {nlqResponse && nlqResponse.table.length > 0 && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold text-foreground">
                      Structured Data Results
                    </h3>
                    <span className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
                      {nlqResponse.row_count} {nlqResponse.row_count === 1 ? 'row' : 'rows'}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportNlqCSV}
                    className="gap-1.5 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>

                <Table
                  columns={nlqTableColumns}
                  data={nlqResponse.table}
                  keyExtractor={(row: Record<string, unknown>) => JSON.stringify(row)}
                  striped
                  hoverable
                />
              </section>
            )}

            {nlqResponse && (
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
                    <span className="hidden sm:inline">Engine: {nlqResponse.model_used}</span>
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
                        <code>{nlqResponse.sql}</code>
                      </pre>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border text-xs">
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase tracking-[0.08em]">Model / Mode</p>
                        <p className="font-medium text-foreground mt-0.5 truncate">{nlqResponse.model_used}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase tracking-[0.08em]">Execution Latency</p>
                        <p className="font-medium text-foreground mt-0.5">{nlqResponse.execution_time_ms.toFixed(1)} ms</p>
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
        )}

        {/* TAB 2: SQL SANDBOX (READ ONLY) */}
        {activeTab === 'sql-sandbox' && (
          <div className="container-gov mt-6 space-y-6">
            <Card className="p-4 sm:p-6 shadow-sm border-border">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <Terminal className="h-3.5 w-3.5" />
                    Interactive Read-Only SQL Console
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    Mutation Blocked
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSchemaDrawer(!showSchemaDrawer)}
                    className="gap-1.5 text-xs"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {showSchemaDrawer ? 'Hide Schema' : 'Schema Reference'}
                  </Button>
                </div>
              </div>

              {/* Collapsible Schema Drawer */}
              {showSchemaDrawer && (
                <div className="mb-4 rounded-sm border border-border bg-muted/40 p-3.5 text-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-foreground">Available Database Relations:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DATABASE_SCHEMA_INFO.map((tbl) => (
                        <button
                          key={tbl.name}
                          type="button"
                          onClick={() => setSelectedSchemaTable(tbl.name)}
                          className={cn(
                            'rounded-sm px-2 py-0.5 text-[11px] font-mono transition-colors border',
                            selectedSchemaTable === tbl.name
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:text-foreground'
                          )}
                        >
                          {tbl.name} ({tbl.type})
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="font-medium text-foreground mb-1">
                      <span className="font-mono text-primary">{activeSchemaInfo.name}</span> — {activeSchemaInfo.description}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                      {activeSchemaInfo.columns.map((col) => (
                        <div
                          key={col.name}
                          className="rounded-sm border border-border bg-background p-1.5 text-[11px] font-mono cursor-pointer hover:border-primary/50"
                          onClick={() => setSqlInput((prev) => `${prev} ${col.name}`)}
                          title={`Click to append ${col.name}: ${col.description}`}
                        >
                          <span className="font-semibold text-foreground">{col.name}</span>
                          <span className="block text-[10px] text-muted-foreground">{col.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SQL Textarea Editor */}
              <div className="space-y-3">
                <div className="relative">
                  <textarea
                    value={sqlInput}
                    onChange={(e) => setSqlInput(e.target.value)}
                    onKeyDown={handleSqlKeyDown}
                    rows={6}
                    placeholder="SELECT * FROM flight_quotes WHERE route = 'DEL-BOM' LIMIT 10;"
                    className="w-full rounded-sm border border-border bg-muted/30 p-3.5 font-mono text-xs sm:text-sm text-foreground shadow-inner focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors leading-relaxed"
                  />
                  <span className="absolute right-3 bottom-3 text-[10px] text-muted-foreground font-mono bg-background/80 px-1.5 py-0.5 rounded border border-border">
                    Ctrl + Enter to run
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="md"
                      disabled={sqlLoading || !sqlInput.trim()}
                      onClick={() => executeSqlSandbox(sqlInput)}
                      className="gap-2 font-semibold"
                    >
                      {sqlLoading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-current" />
                          Execute SQL
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSqlInput('')}
                      className="text-xs text-muted-foreground"
                    >
                      Clear
                    </Button>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Enforced Sandbox Budget: <code className="text-foreground">LIMIT 100</code> • Read-Only Transaction
                  </p>
                </div>

                {/* Pre-built SQL Templates */}
                <div className="pt-2 border-t border-border">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                    Sample Query Templates
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SQL_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.label}
                        type="button"
                        onClick={() => {
                          setSqlInput(tmpl.sql)
                          executeSqlSandbox(tmpl.sql)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground hover:border-primary/50 hover:bg-accent transition-colors text-left"
                      >
                        {tmpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* SQL Execution Results */}
            {sqlResponse && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold text-foreground">
                      Query Execution Results
                    </h3>
                    <span
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-xs font-semibold uppercase',
                        sqlResponse.status === 'SUCCESS'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : sqlResponse.status === 'BLOCKED'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      )}
                    >
                      {sqlResponse.status}
                    </span>
                    <span className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
                      {sqlResponse.row_count} {sqlResponse.row_count === 1 ? 'row' : 'rows'} • {sqlResponse.execution_time_ms.toFixed(1)}ms
                    </span>
                  </div>

                  {sqlResponse.status === 'SUCCESS' && sqlResponse.table.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportSqlCSV}
                      className="gap-1.5 text-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </Button>
                  )}
                </div>

                {sqlResponse.error_message && (
                  <Card className="border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm font-medium">
                    {sqlResponse.error_message}
                  </Card>
                )}

                <Table
                  columns={sqlTableColumns}
                  data={sqlResponse.table}
                  keyExtractor={(row: Record<string, unknown>) => JSON.stringify(row)}
                  striped
                  hoverable
                />
              </section>
            )}
          </div>
        )}

        {/* TAB 3: ROUTE OBSERVATIONS */}
        {activeTab === 'routes' && (
          <section className="container-gov mt-6 pb-10">
            <Card className="p-4 md:p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Database className="h-5 w-5 text-primary" aria-hidden="true" />
                    Route Observations
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">Route-level cleaned statistical observations.</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="relative">
                    <label htmlFor="exp-search" className="sr-only">Search routes</label>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="exp-search"
                      type="search"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setPage(0) }}
                      placeholder="Search route"
                      className="h-9 w-56 rounded-sm border border-border bg-background pl-8 pr-3 text-sm text-foreground"
                    />
                  </div>
                  <div>
                    <label htmlFor="exp-airline" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Airline</label>
                    <Select id="exp-airline" className="h-9 w-44 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={airlineCode} onChange={(e) => setAirlineCode(e.target.value)}>
                      {airlines.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                    </Select>
                  </div>
                  <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" aria-hidden="true" /> CSV</Button>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-sm border border-border">
                <Table
                  columns={[
                    { key: 'route', header: 'Route', accessor: (row: RouteRow) => row.route, sortable: true },
                    { key: 'avgFare', header: 'Average Fare', accessor: (row: RouteRow) => formatINR(row.avgFare), align: 'right', sortable: true },
                    { key: 'index', header: 'Route Index', accessor: (row: RouteRow) => row.index.toFixed(1), align: 'right', sortable: true },
                    { key: 'change', header: 'Change %', accessor: (row: RouteRow) => pct(row.change), align: 'right', sortable: true },
                    { key: 'observations', header: 'Observations', accessor: (row: RouteRow) => row.observations.toLocaleString('en-IN'), align: 'right', sortable: true },
                  ]}
                  data={pagedRows}
                  keyExtractor={(row: RouteRow) => row.route}
                  sortKey={sortKey as string}
                  sortDirection={sortAsc ? 'asc' : 'desc'}
                  onSort={toggleSort}
                  emptyMessage="No routes match your search."
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Showing {pagedRows.length} of {filtered.length} routes</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(Math.max(currentPage - 1, 0))} disabled={currentPage === 0}>Previous</Button>
                  <span className="text-xs text-muted-foreground">Page {currentPage + 1} of {pageCount}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(Math.min(currentPage + 1, pageCount - 1))} disabled={currentPage >= pageCount - 1}>Next</Button>
                </div>
              </div>
            </Card>
          </section>
        )}

        {/* TAB 4: OBSERVED QUOTES */}
        {activeTab === 'quotes' && (
          <section className="container-gov mt-6 pb-10">
            <Card className="p-4 md:p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Latest Observed Quotes</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Fare-level observations for the latest observation date, by source portal.
                  </p>
                </div>
                <div>
                  <label htmlFor="exp-portal" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Source</label>
                  <Select id="exp-portal" className="h-9 w-44 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={portal} onChange={(e) => setPortal(e.target.value)}>
                    <option value="Ixigo">Ixigo</option>
                    <option value="Google Flights">Google Flights</option>
                  </Select>
                </div>
              </div>

              {liveError && <p className="mt-5 text-sm text-destructive">Unable to load quotes: {liveError}</p>}
              {!liveError && !liveRows && <p className="mt-5 text-sm text-muted-foreground">Loading quotes…</p>}

              {liveRows && (
                <div className="mt-5 overflow-x-auto rounded-sm border border-border">
                  <Table
                    columns={[
                      { key: 'route', header: 'Route', accessor: (row: ByRouteRow) => `${row.origin}–${row.destination}` },
                      { key: 'fare', header: 'Average Fare', accessor: (row: ByRouteRow) => formatINR(row.fare), align: 'right' },
                      { key: 'base_period_fare', header: 'Base Fare', accessor: (row: ByRouteRow) => formatINR(row.base_period_fare), align: 'right' },
                      { key: 'index_value', header: 'Route Index', accessor: (row: ByRouteRow) => row.index_value.toFixed(1), align: 'right' },
                      { key: 'route_weight', header: 'Weight', accessor: (row: ByRouteRow) => `${(row.route_weight * 100).toFixed(1)}%`, align: 'right' },
                    ]}
                    data={liveRows}
                    keyExtractor={(row: ByRouteRow) => `${row.origin}-${row.destination}`}
                  />
                </div>
              )}
            </Card>
          </section>
        )}
      </main>
    </div>
  )
}
