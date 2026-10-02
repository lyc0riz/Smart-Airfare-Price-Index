import { Suspense, lazy, ReactElement } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ModeProvider } from './hooks/useDataProvider'
import { ThemeProvider } from './hooks/useTheme'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PageError } from './components/PageError'
import { PageSkeleton } from './components/PageSkeleton'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'

const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })))
const AirfareIndex = lazy(() => import('./pages/AirfareIndex').then((m) => ({ default: m.AirfareIndex })))
const RouteAnalytics = lazy(() => import('./pages/RouteAnalytics').then((m) => ({ default: m.RouteAnalytics })))
const PriceTrends = lazy(() => import('./pages/PriceTrends').then((m) => ({ default: m.PriceTrends })))
const LeadTimeAnalysis = lazy(() => import('./pages/LeadTimeAnalysis').then((m) => ({ default: m.LeadTimeAnalysis })))
const Backtesting = lazy(() => import('./pages/Backtesting').then((m) => ({ default: m.Backtesting })))
const DataExplorer = lazy(() => import('./pages/DataExplorer').then((m) => ({ default: m.DataExplorer })))
const DataQuality = lazy(() => import('./pages/DataQuality').then((m) => ({ default: m.DataQuality })))
const DataSources = lazy(() => import('./pages/DataSources').then((m) => ({ default: m.DataSources })))
const QueryExplorer = lazy(() => import('./pages/QueryExplorer').then((m) => ({ default: m.QueryExplorer })))
const AboutApix = lazy(() => import('./pages/AboutApix').then((m) => ({ default: m.AboutApix })))
const ApiDocs = lazy(() => import('./pages/ApiDocs').then((m) => ({ default: m.ApiDocs })))

function PageOutlet({ children }: { children: ReactElement }) {
  return (
    <ErrorBoundary
      onError={(error) => console.error('Route error:', error)}
      fallback={(error, reset) => <PageError error={error} onRetry={reset} />}
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

function App() {
  return (
    <ModeProvider>
      <ThemeProvider>
        <div className="flex min-h-screen flex-col bg-background">
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <Header />
          <main id="main-content" className="flex-1">
            <Routes>
              <Route path="/" element={<PageOutlet><Home /></PageOutlet>} />
              <Route path="/airfare-index" element={<PageOutlet><AirfareIndex /></PageOutlet>} />
              <Route path="/route-analytics" element={<PageOutlet><RouteAnalytics /></PageOutlet>} />
              <Route path="/price-trends" element={<PageOutlet><PriceTrends /></PageOutlet>} />
              <Route path="/lead-time" element={<PageOutlet><LeadTimeAnalysis /></PageOutlet>} />
              <Route path="/backtesting" element={<PageOutlet><Backtesting /></PageOutlet>} />
              <Route path="/data-explorer" element={<PageOutlet><DataExplorer /></PageOutlet>} />
              <Route path="/query-explorer" element={<PageOutlet><QueryExplorer /></PageOutlet>} />
              <Route path="/query" element={<PageOutlet><QueryExplorer /></PageOutlet>} />
              <Route path="/data-quality" element={<PageOutlet><DataQuality /></PageOutlet>} />
              <Route path="/data-sources" element={<PageOutlet><DataSources /></PageOutlet>} />
              <Route path="/about-apix" element={<PageOutlet><AboutApix /></PageOutlet>} />
              <Route path="/api-docs" element={<PageOutlet><ApiDocs /></PageOutlet>} />
            </Routes>
          </main>
          <Footer />
        </div>
      </ThemeProvider>
    </ModeProvider>
  )
}

export default App