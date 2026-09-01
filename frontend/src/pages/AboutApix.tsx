import { Link } from 'react-router-dom'
import { ArrowRight, Landmark, Scale, TrendingUp } from 'lucide-react'
import { Card } from '../components/ui/Card'

const PRINCIPLES = [
  { icon: Landmark, title: 'Purpose', text: 'A defensible, high-frequency statistical measure of domestic airfare movement that supports monitoring, research and policy analysis.' },
  { icon: Scale, title: 'Measurement', text: 'Index values are computed from observed quotations using documented weights, so results are reproducible and auditable.' },
  { icon: TrendingUp, title: 'Timeliness', text: 'Daily, weekly and monthly frequencies allow price pressure to be detected well before slow-moving official aggregates.' },
]

export function AboutApix() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">About</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">About APIx</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              The Real-time Airfare Price Index for India.
            </p>
          </div>
        </section>

        <section className="container-gov py-10">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2 className="text-xl font-semibold text-foreground">Why an airfare price index?</h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Domestic airfares in India are among the most dynamic prices consumers face.
                  A single published tariff rarely reflects what a passenger actually pays; fares
                  vary with route, carrier, booking window, day of week and demand surges.
                </p>
                <p>
                  APIx complements the official Consumer Price Index by providing a dedicated,
                  high-frequency measure of airfare movement. It combines observed fare quotations
                  from airline and travel platforms with official route-importance statistics so
                  that changes can be measured consistently over time.
                </p>
                <p>
                  The product is designed for use in monitoring exercises, economic analysis and
                  research. Published figures are analytical outputs and are not part of the
                  official CPI release framework.
                </p>
              </div>
            </div>
            <div className="lg:col-span-5">
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-foreground">Platform scope</h3>
                <dl className="mt-4 divide-y divide-border border-y border-border">
                  {[
                    ['Coverage', 'Scheduled domestic city-pair routes'],
                    ['Frequency', 'Daily / weekly / monthly'],
                    ['Base period', 'January 2024 (monthly average)'],
                    ['Weighting', 'DGCA passenger traffic'],
                    ['Construct', 'Jevons → weighted Laspeyres'],
                  ].map(([term, value]) => (
                    <div key={term} className="flex items-baseline justify-between gap-4 py-3">
                      <dt className="text-sm text-muted-foreground">{term}</dt>
                      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>
          </div>

          <h2 className="mt-10 text-xl font-semibold text-foreground">Design principles</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="p-5">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </Card>
            ))}
          </div>

          <div className="mt-10 rounded-sm border-l-2 border-primary border-y border-r border-border bg-muted/50 p-5">
            <h3 className="text-sm font-semibold text-foreground">Status</h3>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              APIx is an experimental statistical platform under development. Its methodology,
              route basket and outputs are refined iteratively. Readers should treat published
              values as indicative analytical results.
            </p>
            <Link to="/data-sources" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Read the methodology <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}