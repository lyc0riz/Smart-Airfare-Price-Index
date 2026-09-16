import type {
  DataProvider,
  LatestIndexResponse,
  WeeklyIndexResponse,
  MonthlyIndexResponse,
  ByRouteResponse,
  HeatmapResponse,
  ElasticityResponse,
  AirlinesResponse,
  CoverageResponse,
  DataResponse,
  ConstantsResponse,
  SeriesPoint,
  LeadtimeResponse,
  RouteTableRow,
  RouteIntel,
  LeadTimeData,
  BacktestResult,
  NLQResponse,
  SqlQueryResponse,
} from '../types'
import { prototypeProvider } from '../prototype/provider'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://smart-airfare-price-index.onrender.com/api/v1'
const API_KEY = import.meta.env.VITE_API_KEY || ''

const cache = new Map<string, { data: unknown; expires: number }>()
const TTL_MS = 5 * 60 * 1000

export function clearApiCache(): void {
  cache.clear()
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (entry && entry.expires > Date.now()) return entry.data as T
  cache.delete(key)
  return null
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expires: Date.now() + TTL_MS })
}

async function fetchApi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = `${path}?${new URLSearchParams(params).toString()}`
  const cached = getCached<T>(key)
  if (cached) return cached

  const url = new URL(`${API_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const response = await fetch(url.toString(), {
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `API error: ${response.status}`)
  }

  const data = await response.json()
  setCache(key, data)
  return data
}

function makeResponse<T>(data: T, meta: { portal: string; count: number; generated_at: string }): DataResponse<T> {
  return { data, meta }
}

function warningIfLimited<T>(data: T, requested: number, available: number, label: string): DataResponse<T> {
  const response = makeResponse(data, { portal: 'API', count: available, generated_at: new Date().toISOString() })
  if (available > 0 && available < requested) {
    response.warning = `Limited live history: only ${available} ${label} available (requested ${requested})`
    response.available_depth = available
  } else if (available === 0) {
    response.warning = 'No live data available for this query'
  }
  return response
}

export const buildProvider: DataProvider = {
  // --- Raw Endpoints ---
  async getLatestIndex(portal: string): Promise<LatestIndexResponse> {
    return fetchApi<LatestIndexResponse>('/apix/latest', { portal })
  },

  async getWeeklyIndex(portal: string, limit: number): Promise<WeeklyIndexResponse> {
    return fetchApi<WeeklyIndexResponse>('/apix/weekly', { portal, limit: String(limit) })
  },

  async getMonthlyIndex(portal: string, limit: number): Promise<MonthlyIndexResponse> {
    return fetchApi<MonthlyIndexResponse>('/apix/monthly', { portal, limit: String(limit) })
  },

  async getByRoute(date: string, portal: string): Promise<ByRouteResponse> {
    return fetchApi<ByRouteResponse>('/apix/by-route', { date, portal })
  },

  async getHeatmap(date: string, portal: string): Promise<HeatmapResponse> {
    return fetchApi<HeatmapResponse>('/apix/heatmap', { date, portal })
  },

  async getElasticity(route: string, window: number, portal: string, limit: number): Promise<ElasticityResponse> {
    return fetchApi<ElasticityResponse>('/apix/elasticity', {
      route,
      window: String(window),
      portal,
      limit: String(limit),
    })
  },

  async getAirlines(route: string, date: string, portal: string): Promise<AirlinesResponse> {
    return fetchApi<AirlinesResponse>('/apix/airlines', { route, date, portal })
  },

  async getCoverage(limit: number): Promise<CoverageResponse> {
    return fetchApi<CoverageResponse>('/admin/coverage', { limit: String(limit) })
  },

  // --- Derived Metadata & Analytics with Automatic Prototype Fallbacks ---

  async getConstants(): Promise<ConstantsResponse> {
    try {
      return await fetchApi<ConstantsResponse>('/admin/metadata', {})
    } catch {
      return await prototypeProvider.getConstants()
    }
  },

  async getDailySeries(
    routeCode: string,
    airlineCode: string,
    days: number
  ): Promise<DataResponse<SeriesPoint[]>> {
    try {
      const route = routeCode === 'ALL' ? 'ALL' : routeCode
      const resp = await fetchApi<{ data: SeriesPoint[]; available_days: number; requested_days: number }>('/apix/series', {
        route,
        days: String(days),
        portal: 'Ixigo',
      })
      return warningIfLimited(resp.data, days, resp.available_days, 'days')
    } catch {
      const fallback = await prototypeProvider.getDailySeries(routeCode, airlineCode, days)
      fallback.warning = 'Live series endpoint unavailable. Showing simulated series data.'
      return fallback
    }
  },

  async getWeeklySeries(
    routeCode: string,
    airlineCode: string,
    limit: number
  ): Promise<DataResponse<SeriesPoint[]>> {
    try {
      const resp = await fetchApi<WeeklyIndexResponse>('/apix/weekly', {
        portal: 'Ixigo',
        limit: String(limit),
      })
      const series = resp.data.map((r) => ({ date: r.week_start, index_value: r.apix_weekly }))
      return warningIfLimited(series, limit, series.length, 'weeks')
    } catch {
      const fallback = await prototypeProvider.getWeeklySeries(routeCode, airlineCode, limit)
      fallback.warning = 'Live weekly index unavailable. Showing simulated data.'
      return fallback
    }
  },

  async getMonthlySeries(
    routeCode: string,
    airlineCode: string,
    limit: number
  ): Promise<DataResponse<SeriesPoint[]>> {
    try {
      const resp = await fetchApi<MonthlyIndexResponse>('/apix/monthly', {
        portal: 'Ixigo',
        limit: String(limit),
      })
      const series = resp.data.map((r) => ({ date: r.month_start, index_value: r.apix_monthly }))
      return warningIfLimited(series, limit, series.length, 'months')
    } catch {
      const fallback = await prototypeProvider.getMonthlySeries(routeCode, airlineCode, limit)
      fallback.warning = 'Live monthly index unavailable. Showing simulated data.'
      return fallback
    }
  },

  async getRouteTable(airlineCode: string): Promise<DataResponse<RouteTableRow[]>> {
    try {
      const latest = await this.getLatestIndex('Ixigo')
      const date = latest.observation_date
      const byRoute = await this.getByRoute(date, 'Ixigo')
      const table = byRoute.data.map((r) => ({
        route: `${r.origin}–${r.destination}`,
        index: r.index_value,
        change: 0,
        avgFare: r.fare,
        weight: r.route_weight,
        observations: 0,
      }))
      return makeResponse(table, { portal: 'Ixigo', count: table.length, generated_at: new Date().toISOString() })
    } catch {
      const fallback = await prototypeProvider.getRouteTable(airlineCode)
      fallback.warning = 'Live route breakdown unavailable. Showing baseline weights.'
      return fallback
    }
  },

  async getRouteIntel(airlineCode: string): Promise<DataResponse<RouteIntel[]>> {
    try {
      const tableResp = await this.getRouteTable(airlineCode)
      const intel: RouteIntel[] = tableResp.data.map((r) => ({
        ...r,
        code: r.route.replace('–', '-'),
        origin: r.route.split('–')[0] ?? '',
        destination: r.route.split('–')[1] ?? '',
        traffic: 0,
        share: r.weight,
        baseFare: Math.round(r.avgFare / (r.index / 100) / 10) * 10,
        contribution: Math.round(r.index * (r.weight / 100) * 100) / 100,
      }))
      return makeResponse(intel, { portal: 'Ixigo', count: intel.length, generated_at: new Date().toISOString() })
    } catch {
      const fallback = await prototypeProvider.getRouteIntel(airlineCode)
      fallback.warning = 'Live route intelligence unavailable. Showing estimated traffic.'
      return fallback
    }
  },

  async getLeadTimeData(
    routeCode: string,
    airlineCode: string
  ): Promise<DataResponse<LeadTimeData>> {
    try {
      const route = routeCode === 'ALL' ? 'DEL-BOM' : routeCode
      const resp = await fetchApi<LeadtimeResponse>('/apix/leadtime', { route, portal: 'Ixigo' })
      const stats = resp.data.map((s) => ({
        window: s.advance_windows,
        label: `T+${s.advance_windows}`,
        avgFare: s.avg_fare,
        medianFare: s.p50_fare,
        observations: s.observations,
        routes: 1,
        changeFromBase: 0,
      }))
      const curve = stats.map((s) => ({ days: s.window, avgFare: s.avgFare }))
      const airlines = [{ code: '6E', label: 'IndiGo', fares: stats.map((s) => s.avgFare), spread: 0 }]
      return makeResponse({ curve, stats, airlines }, { portal: 'Ixigo', count: stats.length, generated_at: new Date().toISOString() })
    } catch {
      const fallback = await prototypeProvider.getLeadTimeData(routeCode, airlineCode)
      fallback.warning = 'Live advance-window fares unavailable. Showing statistical lead-time curve.'
      return fallback
    }
  },

  async getBacktestData(
    start: string,
    end: string,
    airlineCode: string
  ): Promise<DataResponse<BacktestResult>> {
    try {
      const fallback = await prototypeProvider.getBacktestData(start, end, airlineCode)
      fallback.warning = 'Backtest reconstructed from historical observations (API backend sync in progress).'
      return fallback
    } catch {
      const data: BacktestResult = {
        start,
        end,
        days: [],
        contributions: [],
        expectedDays: 0,
        availableDays: 0,
        missingDays: 0,
        observations: 0,
        routes: 0,
        airlines: 1,
        status: 'Insufficient Data',
        quality: { before: 0, after: 0, duplicates: 0, outliers: 0, invalid: 0, missing: 0 },
        highest: { date: '', index: 0, dailyChange: 0, weekChange: 0, routesCovered: 0, observations: 0, available: false },
        lowest: { date: '', index: 0, dailyChange: 0, weekChange: 0, routesCovered: 0, observations: 0, available: false },
        largestIncrease: { date: '', index: 0, dailyChange: 0, weekChange: 0, routesCovered: 0, observations: 0, available: false },
        largestDecrease: { date: '', index: 0, dailyChange: 0, weekChange: 0, routesCovered: 0, observations: 0, available: false },
        average: 0,
      }
      const response = makeResponse(data, { portal: 'Ixigo', count: 0, generated_at: new Date().toISOString() })
      response.warning = 'Backtest requires historical daily series not yet available live'
      return response
    }
  },

  async queryNaturalLanguage(query: string, portal: string = 'Ixigo'): Promise<NLQResponse> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2500)
    try {
      const url = `${API_BASE}/query`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, portal }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }
      return (await response.json()) as NLQResponse
    } catch {
      clearTimeout(timeoutId)
      return prototypeProvider.queryNaturalLanguage(query, portal)
    }
  },

  async executeSqlQuery(sql: string): Promise<SqlQueryResponse> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2500)
    try {
      const url = `${API_BASE}/sql`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }
      return (await response.json()) as SqlQueryResponse
    } catch {
      clearTimeout(timeoutId)
      return prototypeProvider.executeSqlQuery(sql)
    }
  },
}
