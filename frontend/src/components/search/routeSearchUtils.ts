import { CITIES } from '../../lib/constants'
import type { RouteRow } from '../../lib/prototype/apix-data'

export const CITY_TO_IATA: Record<string, string[]> = {
  delhi: ['DEL'],
  mumbai: ['BOM'],
  bengaluru: ['BLR'],
  bangalore: ['BLR'],
  kolkata: ['CCU'],
  chennai: ['MAA'],
  hyderabad: ['HYD'],
  goa: ['GOI', 'GOX'],
  pune: ['PNQ'],
  ahmedabad: ['AMD'],
}

// Helper to get city name for an IATA code
const IATA_TO_CITY_NAME: Record<string, string> = {
  DEL: 'Delhi',
  BOM: 'Mumbai',
  BLR: 'Bengaluru',
  CCU: 'Kolkata',
  MAA: 'Chennai',
  HYD: 'Hyderabad',
  GOI: 'Goa',
  GOX: 'Goa',
  PNQ: 'Pune',
  AMD: 'Ahmedabad',
}

// Populate IATA_TO_CITY_NAME dynamically from CITIES constant as well
CITIES.forEach((c) => {
  IATA_TO_CITY_NAME[c.code] = c.name
})

/**
 * Maps an input query string (city name or IATA code) to matching IATA codes
 */
export function resolveIataCodes(input: string): string[] {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return []

  const codes: string[] = []

  // Direct match in cityToIata map
  if (CITY_TO_IATA[normalized]) {
    codes.push(...CITY_TO_IATA[normalized])
  }

  // Partial match in cityToIata keys (e.g. "mumb" -> "mumbai")
  Object.keys(CITY_TO_IATA).forEach((cityName) => {
    if (cityName.includes(normalized) || normalized.includes(cityName)) {
      CITY_TO_IATA[cityName]?.forEach((code) => {
        if (!codes.includes(code)) codes.push(code)
      })
    }
  })

  // Direct uppercase IATA code check (e.g. "del", "bom")
  const upper = normalized.toUpperCase()
  if (upper.length === 3 && !codes.includes(upper)) {
    codes.push(upper)
  }

  return codes
}

/**
 * Smart filter for RouteRow items supporting IATA codes, city names, and route pairs
 */
export function filterRoutes(routes: RouteRow[], query: string): RouteRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return routes

  // Check for directional search formats: "X to Y", "X-Y", "X–Y", or two space-separated words "X Y"
  let origPart: string | null = null
  let destPart: string | null = null

  const toSplit = q.split(/\s+to\s+|-|–/)
  if (toSplit.length === 2 && toSplit[0] && toSplit[1]) {
    origPart = toSplit[0].trim()
    destPart = toSplit[1].trim()
  } else {
    const spaceSplit = q.split(/\s+/).filter(Boolean)
    if (spaceSplit.length === 2 && spaceSplit[0] && spaceSplit[1]) {
      // Check if both words resolve to IATA codes (e.g. "DEL BOM" or "Delhi Mumbai")
      const c1 = resolveIataCodes(spaceSplit[0])
      const c2 = resolveIataCodes(spaceSplit[1])
      if (c1.length > 0 && c2.length > 0) {
        origPart = spaceSplit[0]
        destPart = spaceSplit[1]
      }
    }
  }

  if (origPart && destPart) {
    const origCodes = resolveIataCodes(origPart)
    const destCodes = resolveIataCodes(destPart)

    if (origCodes.length > 0 && destCodes.length > 0) {
      return routes.filter((r) => {
        const [rOrig, rDest] = r.route.split(/–|-/).map((s) => s.trim().toUpperCase())
        if (!rOrig || !rDest) return false

        const directMatch = origCodes.includes(rOrig) && destCodes.includes(rDest)
        const reverseMatch = origCodes.includes(rDest) && destCodes.includes(rOrig)
        return directMatch || reverseMatch
      })
    }
  }

  // Target IATA codes resolved from query
  const targetIatas = resolveIataCodes(q)

  return routes.filter((r) => {
    // Standardize route representation: e.g. "DEL–BOM" -> ["DEL", "BOM"]
    const parts = r.route.split(/–|-/).map((s) => s.trim().toUpperCase())
    const origCode = parts[0] || ''
    const destCode = parts[1] || ''

    const origCity = (IATA_TO_CITY_NAME[origCode] || '').toLowerCase()
    const destCity = (IATA_TO_CITY_NAME[destCode] || '').toLowerCase()

    // 1. Check if route string itself includes query (e.g. "del-bom", "del–bom")
    const routeNormalized = r.route.toLowerCase().replace('–', '-')
    if (routeNormalized.includes(q) || r.route.toLowerCase().includes(q)) {
      return true
    }

    // 2. Check if resolved IATA codes match origin or destination
    if (targetIatas.includes(origCode) || targetIatas.includes(destCode)) {
      return true
    }

    // 3. Check if origin or destination city names match query
    if (origCity.includes(q) || destCity.includes(q)) {
      return true
    }

    return false
  })
}
