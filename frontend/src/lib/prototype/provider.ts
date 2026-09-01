import {
  buildSeries,
  aggregate,
  routeTable,
  ROUTES,
} from './apix-data'
import type { DataProvider } from '../types'

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

export const prototypeProvider: DataProvider = {
  async getLatestIndex(portal: string) {
    const daily = buildSeries('ALL', 'ALL', 8)
    const data = daily.slice(-8).map((p) => ({
      date: p.date,
      index_value: p.index,
      route_weight: 1,
      advance_window_weight: 1,
    }))
    const current = data.reduce((sum, d) => sum + d.index_value * d.route_weight * d.advance_window_weight, 0)
    return { data, meta: mockMeta(portal, data.length), current_index: Math.round(current * 100) / 100, observation_date: data[data.length - 1]!.date }
  },

  async getWeeklyIndex(portal: string, limit: number) {
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

  async getMonthlyIndex(portal: string, limit: number) {
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

  async getByRoute(_date: string, portal: string) {
    const rows = routeTable('ALL')
    const data = rows.map((row) => ({
      origin: row.route.split('–')[0],
      destination: row.route.split('–')[1],
      index_value: row.index,
      route_weight: row.weight / 100,
      fare: row.avgFare,
      base_period_fare: Math.round(row.avgFare / (row.index / 100)),
    }))
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getHeatmap(date: string, portal: string) {
    const data = mockHeatmapData(date)
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getElasticity(route: string, window: number, portal: string, limit: number) {
    const data = mockElasticityData(route, window).slice(0, limit)
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getAirlines(route: string, date: string, portal: string) {
    const data = mockAirlinesData(route, date)
    return { data, meta: mockMeta(portal, data.length) }
  },

  async getCoverage(limit: number) {
    const data = mockCoverageData(limit)
    return { data, meta: mockMeta('Ixigo', data.length) }
  },
}