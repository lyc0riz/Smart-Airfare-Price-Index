import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../hooks/useDataProvider'
import { useMetadata } from '../hooks/useMetadata'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus, Plane, Map, LineChart, History, Scale, Database, BarChart3, Search, CheckCircle2, Gauge, Sigma } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { formatDate, pct } from '../lib/utils'

const EXPLORE_CARDS = [
  { icon: Gauge, title: 'Airfare Price Index', text: 'Track daily movements in domestic airfare prices.', href: '/airfare-index' },
  { icon: Map, title: 'Route Intelligence', text: 'Explore airfare movements across major city-pair routes.', href: '/route-analytics' },
  { icon: LineChart, title: 'Price Trends', text: 'Analyse daily, weekly and monthly airfare trends.', href: '/price-trends' },
  { icon: History, title: 'Backtesting', text: 'Examine historical performance of the Airfare Price Index.', href: '/backtesting' },
  { icon: Scale, title: 'Data Quality', text: 'Validation, outlier treatment and completeness reporting.', href: '/data-quality' },
  { icon: Database, title: 'Data Explorer', text: 'Explore cleaned airfare observations and statistical records.', href: '/data-explorer' },
]

const SOURCES = [
  { tag: 'Official source', name: 'DGCA', text: 'Passenger traffic and route-level aviation statistics used to establish route importance and weights.' },
  { tag: 'Observed market data', name: 'Airline & OTA Data', text: 'Observed airfare quotations collected from airline and online travel platforms.' },
  { tag: 'Official source', name: 'MoSPI CPI', text: 'Official Consumer Price Index data used as a statistical benchmark where applicable.' },
]

const FEATURES = [
  { icon: Plane, title: 'High-frequency airfare monitoring', text: 'Daily observation cycles across scheduled domestic sectors.' },
  { icon: Map, title: 'Route-wise analysis', text: 'City-pair level comparison of fare behaviour and dispersion.' },
  { icon: Sigma, title: 'Passenger-weighted index construction', text: 'Route weights derived from reported passenger traffic.' },
  { icon: History, title: 'Historical backtesting', text: 'Index behaviour evaluated against past reference periods.' },
  { icon: CheckCircle2, title: 'Statistical data quality checks', text: 'Validation, outlier treatment and completeness reporting.' },
  { icon: BarChart3, title: 'Interactive visualisation', text: 'Tabular and graphical views for analysts and researchers.' },
]

const STEPS = [
  { n: '1', title: 'Collect', text: 'Airfare observations' },
  { n: '2', title: 'Clean', text: 'Validate and standardise data' },
  { n: '3', title: 'Weight', text: 'Apply route importance using passenger traffic' },
  { n: '4', title: 'Calculate', text: 'Generate the Airfare Price Index' },
]

function Delta({ value }: { value: number }) {
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : Minus
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${value > 0 ? 'text-green-700 dark:text-green-400' : value < 0 ? 'text-destructive' : ''}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {pct(value)}
    </span>
  )
}

function SectionHeading({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p> : null}
      <h2 className="mt-2 text-2xl font-bold text-foreground md:text-3xl">{title}</h2>
      <span className="mt-3 block h-0.5 w-14 bg-saffron" aria-hidden="true" />
      {lead ? <p className="mt-4 text-base leading-relaxed text-muted-foreground">{lead}</p> : null}
    </div>
  )
}

export function Home() {
  const { mode, provider } = useDataProvider()
  const { routes, airlines, latestDate, basePeriodLabel } = useMetadata()

  const [daily, setDaily] = useState<{ date: string; index: number }[]>([])

  useEffect(() => {
    let cancelled = false
    provider.getDailySeries('ALL', 'ALL', 60).then((res) => {
      if (cancelled) return
      setDaily(res.data.map((p) => ({ date: p.date, index: p.index_value })))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [provider])

  const latest = daily[daily.length - 1]?.index ?? 108.42
  const dayAgo = daily[daily.length - 2]?.index ?? latest
  const weekAgo = daily[daily.length - 8]?.index ?? latest
  const monthAgo = daily[daily.length - 31]?.index ?? latest

  const summary = useMemo(() => [
    { label: 'Daily Change', value: ((latest - dayAgo) / dayAgo) * 100 },
    { label: '7-Day Change', value: ((latest - weekAgo) / weekAgo) * 100 },
    { label: '30-Day Change', value: ((latest - monthAgo) / monthAgo) * 100 },
  ], [latest, dayAgo, weekAgo, monthAgo])

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        Skip to main content
      </a>

      <main id="main-content">
        {/* Hero */}
        <section className="relative border-b border-border">
          <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.35]" aria-hidden="true">
            <svg className="h-full w-full" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice">
              <g fill="none" stroke="hsl(var(--primary))" strokeWidth="1">
                <path d="M120 340 C 340 140, 620 140, 860 260" />
                <path d="M180 380 C 420 250, 700 200, 1040 190" />
                <path d="M90 250 C 320 300, 640 330, 980 300" />
              </g>
              <g fill="hsl(var(--primary))">
                {[[120, 340], [860, 260], [180, 380], [1040, 190], [90, 250], [980, 300]].map(([cx, cy]) => (
                  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" />
                ))}
              </g>
            </svg>
          </div>

          <div className="container-gov relative grid gap-10 py-14 md:py-20 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="inline-flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <Plane className="h-3.5 w-3.5" aria-hidden="true" />
                Statistical platform under development — MoSPI
              </p>
              <h1 className="mt-5 text-3xl font-bold leading-tight text-foreground md:text-5xl">
                Real-time Airfare Price Index for India
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                An analytical platform for monitoring domestic airfare movements using
                high-frequency airfare observations, route-level passenger traffic and official
                statistical benchmarks.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/airfare-index"
                  className="inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-navy"
                >
                  Explore APIx
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/data-explorer"
                  className="inline-flex items-center gap-2 rounded-sm border border-primary bg-background px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-accent"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Explore Data
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5">
              <Card className="p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current APIx</p>
                    <p className="mt-1 font-serif text-4xl font-bold tabular-nums text-foreground">{latest.toFixed(2)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Base period: {basePeriodLabel}
                    </p>
                  </div>
                  <div className="rounded-sm border border-border bg-muted/50 px-3 py-2 text-xs">
                    <p className="text-muted-foreground">{mode === 'prototype' ? 'Prototype data' : 'Live API'} mode</p>
                  </div>
                </div>

                <dl className="mt-4 divide-y divide-border border-y border-border">
                  {summary.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 py-3">
                      <dt className="text-sm text-muted-foreground">{item.label}</dt>
                      <dd><Delta value={item.value} /></dd>
                    </div>
                  ))}
                </dl>

                <dl className="mt-4 space-y-3">
                  {[
                    ['Coverage', `${routes.length - 1} routes · ${airlines.length - 1} airlines`],
                    ['Latest observation', formatDate(latestDate)],
                    ['Weighting basis', 'DGCA passenger traffic'],
                  ].map(([term, value]) => (
                    <div key={term} className="flex items-baseline justify-between gap-4">
                      <dt className="text-xs text-muted-foreground">{term}</dt>
                      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>

                <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                  Figures published on this platform are analytical outputs of APIx and are
                  distinct from official statistics released by source agencies.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Introduction */}
        <section className="border-b border-border">
          <div className="container-gov py-14 md:py-16">
            <SectionHeading
              eyebrow="Introduction"
              title="Understanding India's Airfare Movement"
            />
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <p className="text-base leading-relaxed text-muted-foreground">
                Airfares in India change dynamically with demand, route, booking time and other
                market factors. A single published tariff rarely reflects what passengers actually
                pay across a season, a sector or a booking window.
              </p>
              <p className="text-base leading-relaxed text-muted-foreground">
                APIx is designed to provide a high-frequency view of these movements. The platform
                combines observed airfare quotations with route-level statistical information so
                that fare behaviour can be measured consistently over time and compared across
                routes.
              </p>
            </div>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                'Consistent measurement of fare movement over time',
                'Route-level comparison based on passenger importance',
                'Support for monitoring, analysis and policy research',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 rounded-sm border border-border bg-muted/50 p-4 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Explore APIx */}
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-14 md:py-16">
            <SectionHeading
              eyebrow="Explore Platform"
              title="Interactive Analytical Views"
              lead="Access detailed index series, route comparisons, lead-time elasticity and data records."
            />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {EXPLORE_CARDS.map((card) => {
                const Icon = card.icon
                return (
                  <Link
                    key={card.title}
                    to={card.href}
                    className="group flex flex-col justify-between rounded-sm border border-border bg-card p-6 shadow-sm transition-all hover:border-primary hover:shadow-md"
                  >
                    <div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-foreground group-hover:text-primary">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.text}</p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      View details
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* Methodology */}
        <section className="border-b border-border">
          <div className="container-gov py-14 md:py-16">
            <SectionHeading
              eyebrow="Methodology"
              title="How the Index is Computed"
              lead="APIx uses a structured four-stage statistical process to convert observed airfares into a reliable price index."
            />
            <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step) => (
                <div key={step.n} className="bg-background p-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-primary-foreground">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-14 md:py-16">
            <SectionHeading
              eyebrow="Key Features"
              title="Platform Capabilities"
              lead="Designed for researchers, analysts and policy institutions requiring accurate airfare tracking."
            />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon
                return (
                  <div key={feature.title} className="rounded-sm border border-border bg-card p-6 shadow-sm">
                    <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                    <h3 className="mt-3 text-base font-semibold text-foreground">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Data Sources */}
        <section className="border-b border-border">
          <div className="container-gov py-14 md:py-16">
            <SectionHeading
              eyebrow="Sources"
              title="Data Sources & Integrity"
              lead="APIx incorporates multiple information sources to ensure accurate route weighting and price tracking."
            />
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {SOURCES.map((source) => (
                <div key={source.name} className="rounded-sm border border-border bg-card p-6 shadow-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{source.tag}</span>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{source.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{source.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
