import {
  buildSeries,
  aggregate,
  routeTable,
  ROUTES,
} from './apix-data'
import { routeIntel } from './route-intel'
import { windowStats, airlineLeadTime, leadCurve } from './leadtime'
import { runBacktest } from './backtest'
import type {
  DataProvider,
  DataResponse,
  ConstantsResponse,
  SeriesPoint,
  RouteTableRow,
  RouteIntel,
  LeadTimeData,
  BacktestResult,
  LatestIndexResponse,
  WeeklyIndexResponse,
  MonthlyIndexResponse,
  ByRouteResponse,
  HeatmapResponse,
  ElasticityResponse,
  AirlinesResponse,
  CoverageResponse,
} from '../types'

function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function mockMeta(portal: string, count: number) {
  return { portal, count, generated_at: new Date().toISOString() }
}

function mockHeatmapData(_date: string) {
  const data = []
  for (const route of ROUTES.filter((r) => r.code !== 'ALL')) {
    for (const w of [1, 7, 15, 30, 45]) {
      const seed = route.code.length + w
      const baseIdx = route.base
      const noise = (hash(seed) - 0.5) * 2
      data.push({
        origin: route.code.split('-')[0],
        destination: route.code.split('-')[1],
        advance_windows: w,
        index_value: Math.round((baseIdx + noise) * 100) / 100,
      })
    }
  }
  return data
}

function mockElasticityData(route: string, window: number) {
  const data = []
  const start = new Date('2026-08-01')
  for (let i = 0; i < 30; i++) {
    const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10)
    const base = 100 + (hash(route.length + window + i) - 0.5) * 5
    const current = Math.round(base * 100) / 100
    const previous = i > 0 ? Math.round((base + (hash(route.length + window + i - 1) - 0.5) * 2) * 100) / 100 : current
    data.push({
      origin: route.split('-')[0],
      destination: route.split('-')[1],
      advance_windows: window,
      date,
      current_index: current,
      previous_index: previous,
      percentage_change: previous ? Math.round(((current / previous - 1) * 100) * 100) / 100 : null,
    })
  }
  return data
}

function mockAirlinesData(route: string, date: string) {
  const carriers = [
    { carrier: 'IndiGo', carrier_code: '6E', base: 5000 },
    { carrier: 'Air India', carrier_code: 'AI', base: 5500 },
    { carrier: 'SpiceJet', carrier_code: 'SG', base: 4700 },
    { carrier: 'Akasa Air', carrier_code: 'QP', base: 4500 },
    { carrier: 'Air India Express', carrier_code: 'IX', base: 4800 },
  ]
  const seed = route.length + date.length
  return carriers.map((c) => ({
    ...c,
    total_fare: Math.round((c.base + (hash(seed + c.carrier.length) - 0.5) * 400) / 10) * 10,
  }))
}

function mockCoverageData(limit: number) {
  const data = []
  const portals = ['Ixigo', 'Google Flights']
  for (let i = 0; i < limit; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    for (const portal of portals) {
      data.push({
        journey_date: date,
        source_portal: portal,
        quotes: portal === 'Ixigo' ? 5800 + Math.round(hash(i) * 400) : 2800 + Math.round(hash(i + 10) * 300),
        imputed: portal === 'Google Flights' ? Math.round(hash(i + 20) * 15) : 0,
        imputed_pct: portal === 'Google Flights' ? Math.round(hash(i + 20) * 0.5 * 100) / 100 : 0,
      })
    }
  }
  return data
}

function mockConstants(): ConstantsResponse['data'] {
  return {
    routes: [
      { code: 'ALL', origin: '', destination: '', label: 'All India', weight_pct: 100 },
      { code: 'DEL-BOM', origin: 'DEL', destination: 'BOM', label: 'DEL–BOM (Delhi–Mumbai)', weight_pct: 18.4 },
      { code: 'DEL-BLR', origin: 'DEL', destination: 'BLR', label: 'DEL–BLR (Delhi–Bengaluru)', weight_pct: 15.7 },
      { code: 'BOM-BLR', origin: 'BOM', destination: 'BLR', label: 'BOM–BLR (Mumbai–Bengaluru)', weight_pct: 11.3 },
      { code: 'DEL-CCU', origin: 'DEL', destination: 'CCU', label: 'DEL–CCU (Delhi–Kolkata)', weight_pct: 8.9 },
      { code: 'BOM-DEL', origin: 'BOM', destination: 'DEL', label: 'BOM–DEL (Mumbai–Delhi)', weight_pct: 8.2 },
      { code: 'BLR-HYD', origin: 'BLR', destination: 'HYD', label: 'BLR–HYD (Bengaluru–Hyderabad)', weight_pct: 6.4 },
      { code: 'DEL-HYD', origin: 'DEL', destination: 'HYD', label: 'DEL–HYD (Delhi–Hyderabad)', weight_pct: 5.8 },
      { code: 'MAA-DEL', origin: 'MAA', destination: 'DEL', label: 'MAA–DEL (Chennai–Delhi)', weight_pct: 5.1 },
      { code: 'BOM-GOI', origin: 'BOM', destination: 'GOI', label: 'BOM–GOI (Mumbai–Goa)', weight_pct: 4.6 },
      { code: 'DEL-PNQ', origin: 'DEL', destination: 'PNQ', label: 'DEL–PNQ (Delhi–Pune)', weight_pct: 4.2 },
      { code: 'BLR-CCU', origin: 'BLR', destination: 'CCU', label: 'BLR–CCU (Bengaluru–Kolkata)', weight_pct: 3.7 },
      { code: 'AMD-DEL', origin: 'AMD', destination: 'DEL', label: 'AMD–DEL (Ahmedabad–Delhi)', weight_pct: 3.4 },
    ],
    airlines: [
      { code: 'ALL', label: 'All Airlines' },
      { code: '6E', label: 'IndiGo' },
      { code: 'AI', label: 'Air India' },
      { code: 'IX', label: 'Air India Express' },
      { code: 'UK', label: 'Vistara' },
      { code: 'SG', label: 'SpiceJet' },
      { code: 'QP', label: 'Akasa Air' },
    ],
    portals: ['Ixigo', 'Google Flights'],
    lead_windows: [1, 7, 15, 30, 45],
    latest_date: '2026-08-29',
    first_date: '2026-08-29',
    base_period_label: 'January 2024 (monthly average)',
    history_days: 1,
  }
}

function makeResponse<T>(data: T, portal = 'Ixigo'): DataResponse<T> {
  return {
    data,
    meta: {
      portal,
      count: Array.isArray(data) ? data.length : 1,
      generated_at: new Date().toISOString(),
    },
  }
}

function addWarningIfLimited<T>(
  response: DataResponse<T>,
  requested: number,
  available: number,
  label: string
): DataResponse<T> {
  if (available > 0 && available < requested) {
    response.warning = `Limited live history: only ${available} ${label} available (requested ${requested})`
    response.available_depth = available
  } else if (available === 0) {
    response.warning = 'No live data available for this query'
  }
  return response
}

export const prototypeProvider: DataProvider = {
  async getLatestIndex(portal: string): Promise<LatestIndexResponse> {
    const daily = buildSeries('ALL', 'ALL', 8)
    const data = daily.slice(-8).map((p) => ({
      date: p.date,
      index_value: p.index,
      route_weight: 1,
      advance_window_weight: 1,
    }))
    const current = data.reduce(
      (sum, d) => sum + d.index_value * d.route_weight * d.advance_window_weight,
      0
    )
    return {
      data,
      meta: mockMeta(portal, data.length),
      current_index: Math.round(current * 100) / 100,
      observation_date: data[data.length - 1]!.date,
    }
  },

  async getWeeklyIndex(portal: string, limit: number): Promise<WeeklyIndexResponse> {
    const daily = buildSeries('ALL', 'ALL', limit * 7)
    const weekly = aggregate(daily, 'weekly')
    const data = weekly.slice(-limit).map((p) => ({
      week_start: p.date,
      source_portal: portal,
      apix_weekly: p.index,
      total_fare: p.index * 1000,
      total_base_fare: p.index * 1000,
      total_base_period_fare: 100 * 1000,
    }))
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getMonthlyIndex(portal: string, limit: number): Promise<MonthlyIndexResponse> {
    const daily = buildSeries('ALL', 'ALL', limit * 30)
    const monthly = aggregate(daily, 'monthly')
    const data = monthly.slice(-limit).map((p) => ({
      month_start: p.date,
      source_portal: portal,
      apix_monthly: p.index,
      total_fare: p.index * 5000,
      total_base_fare: p.index * 5000,
      total_base_period_fare: 100 * 5000,
    }))
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getByRoute(_date: string, portal: string): Promise<ByRouteResponse> {
    const rows = routeTable('ALL')
    const data = rows.map((row) => {
      const parts = row.route.includes('–') ? row.route.split('–') : row.route.split('-')
      const origin = parts[0] || ''
      const destination = parts[1] || ''
      return {
        origin,
        destination,
        index_value: row.index,
        route_weight: row.weight / 100,
        fare: row.avgFare,
        base_period_fare: Math.round(row.avgFare / (row.index / 100)),
      }
    })
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getHeatmap(date: string, portal: string): Promise<HeatmapResponse> {
    const data = mockHeatmapData(date)
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getElasticity(
    route: string,
    window: number,
    portal: string,
    limit: number
  ): Promise<ElasticityResponse> {
    const data = mockElasticityData(route, window).slice(0, limit)
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getAirlines(route: string, date: string, portal: string): Promise<AirlinesResponse> {
    const data = mockAirlinesData(route, date)
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getCoverage(limit: number): Promise<CoverageResponse> {
    const data = mockCoverageData(limit)
    return { data, meta: mockMeta('Ixigo', data.length) }
  },

  async getConstants(): Promise<ConstantsResponse> {
    return { data: mockConstants(), meta: mockMeta('Ixigo', 1) }
  },

  async getDailySeries(
    routeCode: string,
    airlineCode: string,
    days: number
  ): Promise<DataResponse<SeriesPoint[]>> {
    const series = buildSeries(routeCode, airlineCode, Math.max(days, 60))
      .slice(-days)
      .map((p) => ({ date: p.date, index_value: p.index }))
    return addWarningIfLimited(makeResponse(series), days, series.length, 'days')
  },

  async getWeeklySeries(
    _routeCode: string,
    _airlineCode: string,
    limit: number
  ): Promise<DataResponse<SeriesPoint[]>> {
    const daily = buildSeries('ALL', 'ALL', limit * 7)
    const weekly = aggregate(daily, 'weekly')
    const series = weekly.slice(-limit).map((p) => ({ date: p.date, index_value: p.index }))
    return addWarningIfLimited(makeResponse(series), limit, series.length, 'weeks')
  },

  async getMonthlySeries(
    _routeCode: string,
    _airlineCode: string,
    limit: number
  ): Promise<DataResponse<SeriesPoint[]>> {
    const daily = buildSeries('ALL', 'ALL', limit * 30)
    const monthly = aggregate(daily, 'monthly')
    const series = monthly.slice(-limit).map((p) => ({ date: p.date, index_value: p.index }))
    return addWarningIfLimited(makeResponse(series), limit, series.length, 'months')
  },

  async getRouteTable(airlineCode: string): Promise<DataResponse<RouteTableRow[]>> {
    const rows = routeTable(airlineCode)
    const table = rows.map((r) => ({
      route: r.route,
      index: r.index,
      change: r.change,
      avgFare: r.avgFare,
      weight: r.weight,
      observations: r.observations,
    }))
    return makeResponse(table)
  },

  async getRouteIntel(airlineCode: string): Promise<DataResponse<RouteIntel[]>> {
    const intel = routeIntel(airlineCode)
    return makeResponse(intel)
  },

  async getLeadTimeData(
    routeCode: string,
    airlineCode: string
  ): Promise<DataResponse<LeadTimeData>> {
    const curve = leadCurve(routeCode, airlineCode)
    const stats = windowStats(routeCode, airlineCode)
    const airlines = airlineLeadTime(routeCode)
    return makeResponse({ curve, stats, airlines })
  },

  async getBacktestData(
    start: string,
    end: string,
    airlineCode: string
  ): Promise<DataResponse<BacktestResult>> {
    const result = runBacktest(start, end, airlineCode)
    return makeResponse(result)
  },
}
