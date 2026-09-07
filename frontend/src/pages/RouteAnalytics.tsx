import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ArrowRight, Info, Minus, SlidersHorizontal } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { Button } from '../components/ui/Button'
import { Link } from 'react-router-dom'
import { formatINR, pct, cn } from '../lib/utils'
import { AIRLINES, CITIES, ROUTES } from '../lib/constants'
import { IndiaMap } from '../components/map/IndiaMap'
import { routeIntel, formatTraffic, type RouteIntel } from '../lib/prototype/route-intel'

function Delta({ value, className = '' }: { value: number; className?: string }) {
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : Minus
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', className)}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {pct(value)}
    </span>
  )
}

export function RouteAnalytics() {
  const [airlineCode, setAirlineCode] = useState('ALL')
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<keyof RouteIntel>('weight')
  const [sortAsc, setSortAsc] = useState(false)

  const intel = useMemo(() => routeIntel(airlineCode), [airlineCode])

  const filtered = useMemo(() => {
    return selectedRoute
      ? intel.filter((r) => r.code === selectedRoute)
      : intel
  }, [intel, selectedRoute])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' || typeof bv === 'string') {
        return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      }
      return sortAsc ? av - bv : bv - av
    })
  }, [filtered, sortKey, sortAsc])

  const topMovement = useMemo(() => {
    return intel.reduce((max, r) => (Math.abs(r.change) > Math.abs(max.change) ? r : max), intel[0]!)
  }, [intel])

  function toggleSort(key: string, direction: 'asc' | 'desc') {
    setSortKey(key as keyof RouteIntel)
    setSortAsc(direction === 'asc')
  }

  function resetFilters() {
    setAirlineCode('ALL')
    setSelectedRoute(null)
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

        {/* Filters — single bar controlling both map and table */}
        <section className="container-gov" aria-labelledby="filters-heading">
          <Card className="p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 id="filters-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Filters
              </h2>
              <Button variant="outline" size="sm" onClick={resetFilters}>Reset Filters</Button>
            </div>
            <div className="grid gap-4 border-t border-border px-4 py-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground" htmlFor="route-filter">Route</label>
                <Select
                  id="route-filter"
                  className="h-9 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground"
                  value={selectedRoute ?? 'ALL'}
                  onChange={(e) => setSelectedRoute(e.target.value === 'ALL' ? null : e.target.value)}
                >
                  <option value="ALL">All Routes</option>
                  {ROUTES.filter((r) => r.code !== 'ALL').map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground" htmlFor="airline-filter">Airline</label>
                <Select
                  id="airline-filter"
                  className="h-9 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground"
                  value={airlineCode}
                  onChange={(e) => setAirlineCode(e.target.value)}
                >
                  {AIRLINES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                </Select>
              </div>
              <div className="flex items-end">
                <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  Click a route on the map to filter
                </span>
              </div>
            </div>
          </Card>
        </section>

        {/* Map */}
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
                <IndiaMap intel={intel} selectedRoute={selectedRoute} onSelectRoute={setSelectedRoute} />
                <p className="mt-2 border-t border-border px-1 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Boundary as per the Survey of India representation (DataMeet, CC-0). Indicative; not to scale.
                </p>
              </div>
              <div className="space-y-4">
                <div className="rounded-sm border border-border bg-background p-4">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Total annual traffic</p>
                  <p className="mt-1 font-serif text-3xl font-bold tabular-nums text-foreground">{formatTraffic(totalTraffic)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Passengers · all tracked routes</p>
                </div>
                <div className="rounded-sm border border-border bg-background p-4">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Top movement</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{topMovement.route}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground"><Delta value={topMovement.change} /> at index {topMovement.index.toFixed(1)}</p>
                </div>
                <div className="rounded-sm border border-border bg-background p-4">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Cities covered</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CITIES.map((c) => (
                      <span key={c.code} className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.code}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Route table */}
        <section className="container-gov pb-10" aria-labelledby="routes-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="routes-heading" className="text-lg font-semibold text-foreground">Route-wise Statistics</h2>
              <p className="text-sm text-muted-foreground">
                {selectedRoute
                  ? `Showing ${ROUTES.find((r) => r.code === selectedRoute)?.label ?? selectedRoute}`
                  : 'Index levels, average fares, importance weights and contribution to the all-India index.'}
              </p>
            </div>
          </div>

          {selectedRoute && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-sm border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground">
              <span className="font-medium">Filtered by {ROUTES.find((r) => r.code === selectedRoute)?.label}</span>
              <button
                type="button"
                onClick={() => setSelectedRoute(null)}
                className="text-muted-foreground underline decoration-dotted hover:text-foreground"
                aria-label="Clear route filter"
              >
                Clear
              </button>
            </div>
          )}

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
