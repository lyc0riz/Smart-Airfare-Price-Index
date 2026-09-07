import { ROUTES, routeTable, type RouteRow } from './apix-data'
import { CITIES, TOTAL_TRAFFIC } from '../constants'

export { project } from '../map/geo'

export type City = { code: string; name: string; lat: number; lon: number }

export type RouteIntel = RouteRow & {
  code: string
  origin: string
  destination: string
  traffic: number
  share: number
  baseFare: number
  contribution: number
}

export function routeIntel(airlineCode: string): RouteIntel[] {
  const rows = routeTable(airlineCode)
  return rows.map((row, i) => {
    const meta = ROUTES.filter((r) => r.code !== 'ALL')[i]!
    const [origin, destination] = meta.code.split('-') as [string, string]
    const traffic = Math.round((row.weight / 100) * TOTAL_TRAFFIC)
    return {
      ...row,
      code: meta.code,
      origin,
      destination,
      traffic,
      share: row.weight,
      baseFare: Math.round((row.avgFare / (row.index / 100)) / 10) * 10,
      contribution: Math.round(row.index * (row.weight / 100) * 100) / 100,
    }
  })
}

export function cityOf(code: string): City | undefined {
  return CITIES.find((c) => c.code === code)
}

export function formatTraffic(value: number): string {
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(2)} Cr`
  if (value >= 100_000) return `${(value / 100_000).toFixed(1)} Lakh`
  return value.toLocaleString('en-IN')
}