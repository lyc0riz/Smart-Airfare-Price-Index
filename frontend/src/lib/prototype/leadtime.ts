import { AIRLINES, ROUTES, routeTable } from './apix-data'
import { LEAD_WINDOWS } from '../constants'

export { LEAD_WINDOWS }

export type LeadWindow = (typeof LEAD_WINDOWS)[number]

export const TRAVEL_DATE_AVAILABLE = true
export const OBSERVATION_PERIOD = '1 January 2024 – 29 August 2026'

function hash(n: number): number {
  const x = Math.sin(n * 7.1237) * 19483.7561
  return x - Math.floor(x)
}

function windowFactor(window: LeadWindow, seed: number): number {
  const base: Record<LeadWindow, number> = {
    1: 1.42,
    7: 1.18,
    15: 1.06,
    30: 0.97,
    45: 0.93,
  }
  return base[window] * (1 + (hash(seed + window) - 0.5) * 0.06)
}

export type WindowStat = {
  window: LeadWindow
  label: string
  avgFare: number
  medianFare: number
  observations: number
  routes: number
  changeFromBase: number
}

export function windowLabel(window: LeadWindow): string {
  return `T+${window}`
}

const ROUTE_LIST = ROUTES.filter((r) => r.code !== 'ALL')

export function routeLeadTime(routeCode: string, airlineCode: string) {
  const rows = routeTable(airlineCode)
  const list = routeCode === 'ALL' ? rows : rows.filter((r) => r.route === routeCode.replace('-', '–'))
  return (list.length ? list : rows).map((row, i) => {
    const seed = row.route.length + i * 3
    const fares = LEAD_WINDOWS.map((w) => Math.round((row.avgFare * windowFactor(w, seed)) / 10) * 10)
    const first = fares[0]!
    const last = fares[fares.length - 1]!
    return {
      route: row.route,
      code: ROUTE_LIST[i]?.code ?? row.route.replace('–', '-'),
      weight: row.weight,
      observations: row.observations,
      fares,
      spread: ((first - last) / last) * 100,
    }
  })
}

export type RouteLeadRow = ReturnType<typeof routeLeadTime>[number]

export function windowStats(routeCode: string, airlineCode: string): WindowStat[] {
  const rows = routeLeadTime(routeCode, airlineCode)
  return LEAD_WINDOWS.map((w, wi) => {
    const fares = rows.map((r) => r.fares[wi]!)
    const avg = fares.reduce((a, b) => a + b, 0) / fares.length
    const sorted = [...fares].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
    const observations = rows.reduce(
      (sum, r) => sum + Math.round(r.observations * (0.16 + hash(w + r.route.length) * 0.06)),
      0,
    )
    const baseline = rows.reduce((sum, r) => sum + r.fares[3]!, 0) / rows.length
    return {
      window: w,
      label: windowLabel(w),
      avgFare: Math.round(avg),
      medianFare: Math.round(median),
      observations,
      routes: rows.length,
      changeFromBase: ((avg - baseline) / baseline) * 100,
    }
  })
}

export function airlineLeadTime(routeCode: string) {
  return AIRLINES.filter((a) => a.code !== 'ALL').map((airline) => {
    const rows = routeLeadTime(routeCode, airline.code)
    const fares = LEAD_WINDOWS.map((_, wi) =>
      Math.round(rows.reduce((sum, r) => sum + r.fares[wi]!, 0) / rows.length),
    )
    const first = fares[0]!
    const last = fares[fares.length - 1]!
    return {
      code: airline.code,
      label: airline.label,
      fares,
      spread: ((first - last) / last) * 100,
    }
  })
}

export function leadCurve(routeCode: string, airlineCode: string) {
  const rows = routeLeadTime(routeCode, airlineCode)
  const avgAt = (w: number) => {
    const idx = LEAD_WINDOWS.findIndex((x) => x === w)
    if (idx >= 0) return rows.reduce((s, r) => s + r.fares[idx]!, 0) / rows.length
    const lowerIdx = Math.max(0, LEAD_WINDOWS.filter((x) => x < w).length - 1)
    const upperIdx = Math.min(LEAD_WINDOWS.length - 1, lowerIdx + 1)
    const lo = LEAD_WINDOWS[lowerIdx]!
    const hi = LEAD_WINDOWS[upperIdx]!
    const loV = rows.reduce((s, r) => s + r.fares[lowerIdx]!, 0) / rows.length
    const hiV = rows.reduce((s, r) => s + r.fares[upperIdx]!, 0) / rows.length
    const t = hi === lo ? 0 : (w - lo) / (hi - lo)
    return loV + (hiV - loV) * t
  }
  const days = [1, 3, 5, 7, 10, 15, 20, 25, 30, 37, 45]
  return days.map((d) => ({ days: d, avgFare: Math.round(avgAt(d)) }))
}