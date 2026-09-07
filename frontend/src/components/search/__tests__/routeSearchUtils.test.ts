import { describe, it, expect } from 'vitest'
import { resolveIataCodes, filterRoutes } from '../routeSearchUtils'
import type { RouteRow } from '../../../lib/types'

const MOCK_ROUTES: RouteRow[] = [
  { route: 'DEL–BOM', avgFare: 4500, index: 110, change: 2.5, weight: 18.4, observations: 120 },
  { route: 'DEL–BLR', avgFare: 5200, index: 105, change: -1.2, weight: 15.7, observations: 110 },
  { route: 'BOM–BLR', avgFare: 3800, index: 98, change: 0.5, weight: 11.3, observations: 95 },
  { route: 'MAA–DEL', avgFare: 4900, index: 102, change: 1.1, weight: 5.1, observations: 80 },
]

describe('routeSearchUtils', () => {
  describe('resolveIataCodes', () => {
    it('resolves direct city names to IATA codes', () => {
      expect(resolveIataCodes('mumbai')).toContain('BOM')
      expect(resolveIataCodes('Delhi')).toContain('DEL')
      expect(resolveIataCodes('Bangalore')).toContain('BLR')
      expect(resolveIataCodes('Bengaluru')).toContain('BLR')
    })

    it('resolves direct 3-letter IATA codes', () => {
      expect(resolveIataCodes('del')).toContain('DEL')
      expect(resolveIataCodes('BOM')).toContain('BOM')
    })

    it('returns empty array on empty input', () => {
      expect(resolveIataCodes('')).toEqual([])
      expect(resolveIataCodes('   ')).toEqual([])
    })
  })

  describe('filterRoutes', () => {
    it('returns all routes when query is empty', () => {
      expect(filterRoutes(MOCK_ROUTES, '')).toEqual(MOCK_ROUTES)
      expect(filterRoutes(MOCK_ROUTES, '   ')).toEqual(MOCK_ROUTES)
    })

    it('filters by directional search (e.g. DEL to BOM)', () => {
      const results = filterRoutes(MOCK_ROUTES, 'DEL to BOM')
      expect(results).toHaveLength(1)
      expect(results[0]?.route).toBe('DEL–BOM')
    })

    it('filters by city names in directional query (e.g. Delhi to Mumbai)', () => {
      const results = filterRoutes(MOCK_ROUTES, 'Delhi to Mumbai')
      expect(results).toHaveLength(1)
      expect(results[0]?.route).toBe('DEL–BOM')
    })

    it('filters by single city name matching origin or destination', () => {
      const results = filterRoutes(MOCK_ROUTES, 'Chennai')
      expect(results).toHaveLength(1)
      expect(results[0]?.route).toBe('MAA–DEL')
    })

    it('filters by route IATA pair (e.g. BOM-BLR)', () => {
      const results = filterRoutes(MOCK_ROUTES, 'BOM-BLR')
      expect(results).toHaveLength(1)
      expect(results[0]?.route).toBe('BOM–BLR')
    })
  })
})
