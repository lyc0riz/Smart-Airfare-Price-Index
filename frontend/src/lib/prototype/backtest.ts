import { AIRLINES, ROUTES, buildSeries, routeTable } from './apix-data'
import { BASE_INDEX } from '../constants'

function hash(n: number): number {
  const x = Math.sin(n * 3.7431) * 27644.8123
  return x - Math.floor(x)
}

const BASKET = ROUTES.filter((r) => r.code !== 'ALL').slice(0, 10)

export type BacktestDay = {
  date: string
  index: number
  dailyChange: number
  weekChange: number
  routesCovered: number
  observations: number
  available: boolean
}

export type ContributionRow = {
  route: string
  weight: number
  baseFare: number
  avgFare: number
  index: number
  contribution: number
  fareChange: number
}

export type BacktestResult = {
  start: string
  end: string
  days: BacktestDay[]
  contributions: ContributionRow[]
  expectedDays: number
  availableDays: number
  missingDays: number
  observations: number
  routes: number
  airlines: number
  status: 'Completed' | 'Partial Coverage' | 'Insufficient Data'
  quality: {
    before: number
    after: number
    duplicates: number
    outliers: number
    invalid: number
    missing: number
  }
  highest: BacktestDay
  lowest: BacktestDay
  largestIncrease: BacktestDay
  largestDecrease: BacktestDay
  average: number
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
  ) + 1
}

export function runBacktest(start: string, end: string, airlineCode: string): BacktestResult {
  const airline = AIRLINES.find((a) => a.code === airlineCode) ?? AIRLINES[0]!
  const expectedDays = Math.max(daysBetween(start, end), 1)
  const seedBase = start.length + airline.code.length * 5

  const perRoute = BASKET.map((r) => buildSeries(r.code, airlineCode, expectedDays))
  const totalWeight = BASKET.reduce((s, r) => s + r.weight, 0)
  const startMs = Date.parse(`${start}T00:00:00Z`)

  const raw: BacktestDay[] = []
  for (let i = 0; i < expectedDays; i++) {
    const date = new Date(startMs + i * 86400000).toISOString().slice(0, 10)
    const weighted =
      BASKET.reduce((sum, r, ri) => {
        const point = perRoute[ri]![i] ?? perRoute[ri]![perRoute[ri]!.length - 1]!
        return sum + point.index * r.weight
      }, 0) / totalWeight
    const missing = hash(i + seedBase) > 0.94
    raw.push({
      date,
      index: Math.round(weighted * 100) / 100,
      dailyChange: 0,
      weekChange: 0,
      routesCovered: missing ? BASKET.length - 2 : BASKET.length,
      observations: missing ? 0 : 620 + Math.round(hash(i * 3 + seedBase) * 240),
      available: !missing,
    })
  }

  const baseValue = raw[0]!.index
  const days = raw.map((d) => {
    const index = Math.round((d.index / baseValue) * BASE_INDEX * 100) / 100
    return { ...d, index }
  })
  for (let i = 0; i < days.length; i++) {
    const prev = days[i - 1]
    const week = days[i - 7]
    days[i]!.dailyChange = prev ? Math.round(((days[i]!.index / prev.index - 1) * 100) * 100) / 100 : 0
    days[i]!.weekChange = week ? Math.round(((days[i]!.index / week.index - 1) * 100) * 100) / 100 : 0
  }

  const rows = routeTable(airlineCode)
  const contributions: ContributionRow[] = BASKET.map((r, i) => {
    const row = rows.find((x) => x.route === r.code.replace('-', '–')) ?? rows[i]!
    const baseFare = Math.round((row.avgFare / (row.index / 100)) / 10) * 10
    return {
      route: row.route,
      weight: r.weight,
      baseFare,
      avgFare: row.avgFare,
      index: row.index,
      contribution: Math.round(((row.index * r.weight) / totalWeight) * 100) / 100,
      fareChange: Math.round(((row.avgFare / baseFare - 1) * 100) * 10) / 10,
    }
  })

  const availableDays = days.filter((d) => d.available).length
  const missingDays = expectedDays - availableDays
  const observations = days.reduce((s, d) => s + d.observations, 0)
  const after = observations
  const duplicates = Math.round(after * 0.017)
  const outliers = Math.round(after * 0.009)
  const invalid = Math.round(after * 0.006)

  const sortedByIndex = [...days].sort((a, b) => a.index - b.index)
  const sortedByChange = [...days].sort((a, b) => a.dailyChange - b.dailyChange)

  return {
    start,
    end,
    days,
    contributions,
    expectedDays,
    availableDays,
    missingDays,
    observations,
    routes: BASKET.length,
    airlines: airlineCode === 'ALL' ? AIRLINES.length - 1 : 1,
    status:
      availableDays < expectedDays * 0.6
        ? 'Insufficient Data'
        : missingDays > 0
        ? 'Partial Coverage'
        : 'Completed',
    quality: {
      before: after + duplicates + outliers + invalid,
      after,
      duplicates,
      outliers,
      invalid,
      missing: missingDays,
    },
    highest: sortedByIndex[sortedByIndex.length - 1]!,
    lowest: sortedByIndex[0]!,
    largestIncrease: sortedByChange[sortedByChange.length - 1]!,
    largestDecrease: sortedByChange[0]!,
    average: Math.round((days.reduce((s, d) => s + d.index, 0) / days.length) * 100) / 100,
  }
}

export const CPI_OVERLAP_AVAILABLE = false