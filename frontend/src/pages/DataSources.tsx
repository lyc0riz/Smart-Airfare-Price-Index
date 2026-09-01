import { Link } from 'react-router-dom'
import { ArrowRight, Database, FileText, Globe, ShieldCheck } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { formatDate } from '../lib/utils'
import { LATEST_DATE } from '../lib/prototype/apix-data'

const SOURCE_TABLE = [
  { source: 'DGCA', type: 'Official statistics', frequency: 'Monthly', use: 'Route-level passenger traffic; route importance weights.' },
  { source: 'Airline & OTA portals', type: 'Observed market data', frequency: 'Daily', use: 'Airfare quotations by route, carrier and advance-purchase window.' },
  { source: 'MoSPI CPI', type: 'Official statistics', frequency: 'Monthly', use: 'Reference benchmark for airfare price movements where applicable.' },
]

const FORMULA_STEPS = [
  { n: '1', title: 'Collect', text: 'Daily airfare observations are captured for each route in the basket across advance-purchase windows.' },
  { n: '2', title: 'Clean', text: 'Records are validated, de-duplicated and checked for outliers at route–window–carrier level.' },
  { n: '3', title: 'Weight routes', text: 'Each route receives an importance weight derived from DGCA passenger traffic.' },
  { n: '4', title: 'Compute route indices', text: 'Geometric-mean (Jevons) aggregation is used to form route-level price relatives vs the base period.' },
  { n: '5', title: 'Aggregate', text: 'Route indices are aggregated with passenger weights to produce the all-India APIx.' },
  { n: '6', title: 'Publish', text: 'Daily, weekly and monthly indices are validated and published to the platform.' },
]

export function DataSources() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Documentation</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Data Sources & Methodology</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              The inputs, statistical methods and safeguards that underpin APIx.
            </p>
          </div>
        </section>

        <section className="container-gov py-10">
          <h2 className="text-lg font-semibold text-foreground">Source Data</h2>
          <div className="mt-4 overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[560px] border-collapse">
              <thead className="bg-muted/50">
                <tr>
                  {['Source', 'Type', 'Frequency', 'How it is used'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {SOURCE_TABLE.map((row) => (
                  <tr key={row.source} className="bg-background">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">{row.source}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.type}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.frequency}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-sm border-l-2 border-primary border-y border-r border-border bg-muted/50 p-4">
            <p className="text-sm leading-relaxed text-foreground">
              <strong className="font-semibold">Note:</strong> DGCA and MoSPI data are official
              statistics. Airfare quotations are observed market data. Indices and comparisons
              published here are analytical outputs of APIx and are not official statistics.
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-muted/50">
          <div className="container-gov py-10">
            <h2 className="text-lg font-semibold text-foreground">Index Construction</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              APIx is constructed in six steps, from observed quotations to a published index.
            </p>
            <ol className="mt-5 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {FORMULA_STEPS.map((s) => (
                <li key={s.n} className="bg-card p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-primary-foreground">{s.n}</span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
            <Link to="/backtesting" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              See backtesting results <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="container-gov py-10">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5">
              <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 text-base font-semibold text-foreground">Ethical collection</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Collection respects robots.txt and the terms of service of source portals. Automatic
                access is limited to monthly volumes that a typical editorial user would generate.
              </p>
            </Card>
            <Card className="p-5">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 text-base font-semibold text-foreground">Documented processing</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Every cleaning and imputation decision is logged. Outliers are treated using
                route–window–carrier context rather than global thresholds.
              </p>
            </Card>
            <Card className="p-5">
              <Database className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 text-base font-semibold text-foreground">Reproducible pipeline</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Raw responses, cleaned records and index series are retained so that published
                figures can be reproduced and audited.
              </p>
            </Card>
          </div>

          <div className="mt-8 rounded-sm border border-border bg-muted/50 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Latest data update
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The most recent validated observation batch is dated {formatDate(LATEST_DATE)}.
              Updated reports are published as each batch completes validation.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}