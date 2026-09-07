import { Link } from 'react-router-dom'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-muted/30" role="contentinfo">
      <div className="container-gov py-8">
        <div className="grid gap-6 md:grid-cols-4">
          <div>
            <p className="font-serif text-lg font-bold text-foreground">FlyIndex India</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Real-time Airfare Price Index for India
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Ministry of Statistics and Programme Implementation (MoSPI), Government of India
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-foreground">Platform</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/airfare-index" className="hover:text-foreground">Airfare Index</Link></li>
              <li><Link to="/route-analytics" className="hover:text-foreground">Route Intelligence</Link></li>
              <li><Link to="/price-trends" className="hover:text-foreground">Price Trends</Link></li>
              <li><Link to="/lead-time" className="hover:text-foreground">Lead-Time Analysis</Link></li>
              <li><Link to="/backtesting" className="hover:text-foreground">Backtesting</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground">Data & Tools</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/data-explorer" className="hover:text-foreground">Data Explorer</Link></li>
              <li><Link to="/data-quality" className="hover:text-foreground">Data Quality</Link></li>
              <li><Link to="/data-sources" className="hover:text-foreground">Data Sources</Link></li>
              <li><Link to="/api-docs" className="hover:text-foreground">API Documentation</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground">Resources</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/about-apix" className="hover:text-foreground">About FlyIndex India</Link></li>
              <li><Link to="/data-sources" className="hover:text-foreground">Methodology</Link></li>
              <li><Link to="/api-docs" className="hover:text-foreground">API Documentation</Link></li>
              <li><Link to="/data-quality" className="hover:text-foreground">Data Quality</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 md:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {year} Ministry of Statistics & Programme Implementation, Government of India.
          </p>
          <p className="text-xs text-muted-foreground">
            FlyIndex India is an experimental statistical indicator platform. Not official statistics.
          </p>
        </div>
      </div>
    </footer>
  )
}