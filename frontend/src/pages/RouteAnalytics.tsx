import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ArrowRight, Info, Minus } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { Link } from 'react-router-dom'
import { formatINR, pct, cn } from '../lib/utils'
import { AIRLINES, CITIES } from '../lib/constants'
import { routeIntel, project, formatTraffic, type RouteIntel } from '../lib/prototype/route-intel'
import { INDIA_OUTLINE } from '../lib/constants'

function Delta({ value, className = '' }: { value: number; className?: string }) {
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : Minus
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', className)}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {pct(value)}
    </span>
  )
}

function IndiaMap({ intel }: { intel: RouteIntel[] }) {
  const maxTraffic = Math.max(...intel.map((r) => r.traffic), 1)
  const outline = INDIA_OUTLINE.map(([lon, lat]) => project(lon, lat))
  const routePaths = intel
    .filter((r) => r.code !== 'ALL')
    .slice(0, 8)
    .map((r) => {
      const o = CITIES.find((c) => c.code === r.origin)
      const d = CITIES.find((c) => c.code === r.destination)
      if (!o || !d) return null
      const a = project(o.lon, o.lat)
      const b = project(d.lon, d.lat)
      return { key: r.code, a, b, change: r.change, index: r.index }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return (
    <svg viewBox={`0 0 ${620} ${660}`} className="w-full" role="img" aria-label="India route map">
      <polygon
        points={outline.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="hsl(var(--muted))"
        stroke="hsl(var(--border))"
        strokeWidth="1.2"
      />
      {routePaths.map((r) => (
        <g key={r.key}>
          <line
            x1={r.a.x}
            y1={r.a.y}
            x2={r.b.x}
            y2={r.b.y}
            stroke="hsl(var(--primary))"
            strokeWidth={Math.max(1.2, Math.abs(r.change) / 2)}
            opacity={0.55}
            strokeDasharray={r.change < 0 ? '4 3' : undefined}
          >
            <title>{`${r.key} · APIx ${r.index.toFixed(1)} · ${pct(r.change)}`}</title>
          </line>
        </g>
      ))}
      {CITIES.map((city) => {
        const p = project(city.lon, city.lat)
        const traffic = intel
          .filter((r) => r.origin === city.code || r.destination === city.code)
          .reduce((s, r) => s + (r.traffic || 0), 0)
        const r = 3 + (traffic / maxTraffic) * 6
        return (
          <g key={city.code}>
            <circle cx={p.x} cy={p.y} r={r} fill="hsl(var(--saffron))" stroke="hsl(var(--card))" strokeWidth="1.5">
              <title>{`${city.name} (${city.code})`}</title>
            </circle>
            <text x={p.x} y={p.y - r - 3} textAnchor="middle" fontSize="9" fill="hsl(var(--foreground))">
              {city.code}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function RouteAnalytics() {
  const [airlineCode, setAirlineCode] = useState('ALL')
  const [sortKey, setSortKey] = useState<keyof RouteIntel>('weight')
  const [sortAsc, setSortAsc] = useState(false)

  const intel = useMemo(() => routeIntel(airlineCode), [airlineCode])

  const sorted = useMemo(() => {
    return [...intel].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' || typeof bv === 'string') {
        return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      }
      return sortAsc ? av - bv : bv - av
    })
  }, [intel, sortKey, sortAsc])

  function toggleSort(key: string, direction: 'asc' | 'desc') {
    setSortKey(key as keyof RouteIntel)
    setSortAsc(direction === 'asc')
  }

  const totalTraffic = intel.reduce((s, r) => s + r.traffic, 0)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Statistical Product</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Route Intelligence</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              City-pair level analysis of airfare movements across India's major domestic routes.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Route-level index values, passenger-importance weights and average fares are shown
              for each scheduled city-pair in the APIx basket.
            </p>
            <dl className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Routes tracked', String(intel.length)],
                ['Total annual traffic', formatTraffic(totalTraffic)],
                ['Top route', intel[0]?.route ?? '—'],
                ['Weighting basis', 'DGCA passenger traffic'],
              ].map(([term, value]) => (
                <div key={term} className="bg-background px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{term}</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="container-gov py-8">
          <Card className="p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Domestic Route Map</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  City-pair network with route-level APIx movement. Solid lines indicate rising fares; dashed lines indicate falling fares.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                Bubble size reflects route importance
              </span>
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="rounded-sm border border-border bg-background p-2">
                <IndiaMap intel={intel} />
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="map-airline" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Airline</label>
                  <Select id="map-airline" className="h-9 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={airlineCode} onChange={(e) => setAirlineCode(e.target.value)}>
                    {AIRLINES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                  </Select>
                </div>
                <div className="rounded-sm border border-border bg-background p-4">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Total annual traffic</p>
                  <p className="mt-1 font-serif text-3xl font-bold tabular-nums text-foreground">{formatTraffic(totalTraffic)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Passengers · all tracked routes</p>
                </div>
                <div className="rounded-sm border border-border bg-background p-4">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Top movement</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{intel[0]?.route}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground"><Delta value={intel[0]?.change ?? 0} /> at index {intel[0]?.index.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="container-gov pb-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Route-wise Statistics</h2>
              <p className="text-sm text-muted-foreground">
                Index levels, average fares, importance weights and contribution to the all-India index.
              </p>
            </div>
            <div>
              <label htmlFor="table-airline" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Airline</label>
              <Select id="table-airline" className="h-9 w-56 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={airlineCode} onChange={(e) => setAirlineCode(e.target.value)}>
                {AIRLINES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
              </Select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-sm border border-border">
            <Table
              columns={[
                { key: 'route', header: 'Route', accessor: (row: RouteIntel) => row.route, sortable: true },
                { key: 'avgFare', header: 'Average Fare', accessor: (row: RouteIntel) => formatINR(row.avgFare), align: 'right', sortable: true },
                { key: 'baseFare', header: 'Base Fare', accessor: (row: RouteIntel) => formatINR(row.baseFare), align: 'right', sortable: true },
                { key: 'index', header: 'Route Index', accessor: (row: RouteIntel) => row.index.toFixed(1), align: 'right', sortable: true },
                { key: 'change', header: 'Change %', accessor: (row: RouteIntel) => <Delta value={row.change} />, align: 'right', sortable: true },
                { key: 'weight', header: 'DGCA Weight', accessor: (row: RouteIntel) => `${row.weight.toFixed(1)}%`, align: 'right', sortable: true },
                { key: 'traffic', header: 'Traffic', accessor: (row: RouteIntel) => formatTraffic(row.traffic), align: 'right', sortable: true },
                { key: 'contribution', header: 'Contribution', accessor: (row: RouteIntel) => row.contribution.toFixed(1), align: 'right', sortable: true },
              ]}
              data={sorted}
              keyExtractor={(row: RouteIntel) => row.code}
              sortKey={sortKey as string}
              sortDirection={sortAsc ? 'asc' : 'desc'}
              onSort={toggleSort}
              emptyMessage="No routes match the current selection."
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <span className={cn('mr-2 inline-block h-2 w-2 rounded-full', 'bg-saffron/10')} aria-hidden="true" />
            Weights sum to 100% across the route basket. Contribution = route index × DGCA weight / 100.
          </p>
          <Link to="/price-trends" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            View Price Trends <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </main>
    </div>
  )
}