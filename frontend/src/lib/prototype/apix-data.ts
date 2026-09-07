function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export type Frequency = 'daily' | 'weekly' | 'monthly'
export type RangeKey = '7d' | '30d' | '3m' | '6m' | '1y'

export const RANGE_OPTIONS = [
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: '3m', label: '3 Months', days: 91 },
  { key: '6m', label: '6 Months', days: 182 },
  { key: '1y', label: '1 Year', days: 365 },
] as const

export const ROUTES = [
  { code: 'ALL', label: 'All India', weight: 100, base: 108.42 },
  { code: 'DEL-BOM', label: 'DEL–BOM (Delhi–Mumbai)', weight: 18.4, base: 112.4 },
  { code: 'DEL-BLR', label: 'DEL–BLR (Delhi–Bengaluru)', weight: 15.7, base: 107.8 },
  { code: 'BOM-BLR', label: 'BOM–BLR (Mumbai–Bengaluru)', weight: 11.3, base: 103.2 },
  { code: 'DEL-CCU', label: 'DEL–CCU (Delhi–Kolkata)', weight: 8.9, base: 109.6 },
  { code: 'BOM-DEL', label: 'BOM–DEL (Mumbai–Delhi)', weight: 8.2, base: 111.1 },
  { code: 'BLR-HYD', label: 'BLR–HYD (Bengaluru–Hyderabad)', weight: 6.4, base: 99.4 },
  { code: 'DEL-HYD', label: 'DEL–HYD (Delhi–Hyderabad)', weight: 5.8, base: 105.3 },
  { code: 'MAA-DEL', label: 'MAA–DEL (Chennai–Delhi)', weight: 5.1, base: 106.7 },
  { code: 'BOM-GOI', label: 'BOM–GOI (Mumbai–Goa)', weight: 4.6, base: 96.8 },
  { code: 'DEL-PNQ', label: 'DEL–PNQ (Delhi–Pune)', weight: 4.2, base: 104.1 },
  { code: 'BLR-CCU', label: 'BLR–CCU (Bengaluru–Kolkata)', weight: 3.7, base: 101.9 },
  { code: 'AMD-DEL', label: 'AMD–DEL (Ahmedabad–Delhi)', weight: 3.4, base: 98.2 },
]

export const AIRLINES = [
  { code: 'ALL', label: 'All Airlines', factor: 1 },
  { code: '6E', label: 'IndiGo', factor: 0.985 },
  { code: 'AI', label: 'Air India', factor: 1.024 },
  { code: 'IX', label: 'Air India Express', factor: 0.958 },
  { code: 'UK', label: 'Vistara', factor: 1.041 },
  { code: 'SG', label: 'SpiceJet', factor: 0.972 },
  { code: 'QP', label: 'Akasa Air', factor: 0.993 },
]

export const LATEST_DATE = '2026-08-29'
export const BASE_PERIOD = 'January 2024 (monthly average)'

export type Point = { date: string; index: number }

export function buildSeries(routeCode: string, airlineCode: string, days: number): Point[] {
  const route = ROUTES.find((r) => r.code === routeCode) ?? ROUTES[0]!
  const airline = AIRLINES.find((a) => a.code === airlineCode) ?? AIRLINES[0]!
  const end = new Date(`${LATEST_DATE}T00:00:00Z`)
  const seed = route.code.length * 7 + airline.code.length * 3
  const points: Point[] = []

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400000)
    const t = (days - 1 - i) / Math.max(days - 1, 1)
    const drift = (route.base - 100) * (0.35 + 0.65 * t)
    const seasonal = 2.1 * Math.sin((d.getUTCDate() / 31) * Math.PI * 2 + seed)
    const weekly = 1.4 * Math.sin((d.getUTCDay() / 7) * Math.PI * 2)
    const noise = (hash(d.getTime() / 86400000 + seed) - 0.5) * 1.6
    const value = (100 + drift + seasonal + weekly + noise) * airline.factor
    points.push({ date: d.toISOString().slice(0, 10), index: Math.round(value * 100) / 100 })
  }
  return points
}

export function aggregate(points: Point[], frequency: Frequency): Point[] {
  if (frequency === 'daily') return points
  const buckets = new Map<string, number[]>()
  for (const p of points) {
    const key = frequency === 'monthly' ? p.date.slice(0, 7) : weekKey(p.date)
    const arr = buckets.get(key) ?? []
    arr.push(p.index)
    buckets.set(key, arr)
  }
  return [...buckets.entries()].map(([key, values]) => ({
    date: key,
    index: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
  }))
}

function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay()
  const monday = new Date(d.getTime() - ((day + 6) % 7) * 86400000)
  return monday.toISOString().slice(0, 10)
}

export type RouteRow = {
  route: string
  index: number
  change: number
  avgFare: number
  weight: number
  observations: number
}

export function routeTable(airlineCode: string): RouteRow[] {
  const airline = AIRLINES.find((a) => a.code === airlineCode) ?? AIRLINES[0]!
  return ROUTES.filter((r) => r.code !== 'ALL').map((r, i) => {
    const index = Math.round(r.base * airline.factor * 100) / 100
    return {
      route: r.code.replace('-', '–'),
      index,
      change: Math.round((index - 100 + (hash(i + 4) - 0.5) * 1.2) * 10) / 10,
      avgFare: Math.round((3600 + r.weight * 92 + hash(i + 9) * 900) / 10) * 10,
      weight: r.weight,
      observations: 480 + Math.round(r.weight * 44 + hash(i + 2) * 180),
    }
  })
}

export function formatDate(value: string): string {
  if (value.length === 7) {
    return new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}