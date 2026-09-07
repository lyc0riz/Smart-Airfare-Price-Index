import { describe, it, expect } from 'vitest'
import {
  project,
  outlinePath,
  curvedRoutePath,
  routeStrokeWidth,
  routeDasharray,
  INDIA_REGIONS,
  INDIA_LAKSHADWEEP_DOTS,
} from '../geo'
import { MAP_WIDTH, MAP_HEIGHT } from '../../constants'

describe('geo utilities', () => {
  it('projects lon/lat into bounded map coordinates', () => {
    const p = project(77.209, 28.6139)
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(MAP_WIDTH)
    expect(p.y).toBeGreaterThan(0)
    expect(p.y).toBeLessThan(MAP_HEIGHT)
  })

  it('maps northern latitudes to smaller y (inverted axis)', () => {
    const north = project(80, 34).y
    const south = project(80, 10).y
    expect(north).toBeLessThan(south)
  })

  it('builds a compound outline path with one closed subpath per region', () => {
    const path = outlinePath()
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith(' Z')).toBe(true)
    const subpaths = path.split(/\sZ/g).filter((s) => s.trim().length > 0)
    expect(subpaths.length).toBe(INDIA_REGIONS.length)
    expect(subpaths.length).toBeGreaterThanOrEqual(3)
    expect(path).toContain(' L')
  })

  it('outline stays within the viewBox bounds', () => {
    const xs = INDIA_REGIONS.flat().map(([x]) => x)
    const ys = INDIA_REGIONS.flat().map(([, y]) => y)
    const allDots = [...xs, ...INDIA_LAKSHADWEEP_DOTS.map(([x]) => x)]
    const allYDots = [...ys, ...INDIA_LAKSHADWEEP_DOTS.map(([, y]) => y)]
    expect(Math.min(...allDots)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...allDots)).toBeLessThanOrEqual(MAP_WIDTH)
    expect(Math.min(...allYDots)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...allYDots)).toBeLessThanOrEqual(MAP_HEIGHT)
  })

  it('includes the island territories (Andaman & Nicobar + Lakshadweep)', () => {
    expect(INDIA_REGIONS.length).toBeGreaterThanOrEqual(3)
    expect(INDIA_LAKSHADWEEP_DOTS.length).toBeGreaterThanOrEqual(10)
    // Every region is a real polygon (>= 4 points incl. closing point)
    for (const region of INDIA_REGIONS) {
      expect(region.length).toBeGreaterThanOrEqual(4)
    }
    // Southern-most polygon start: Andaman islands sit below the mainland tip
    const ys = INDIA_REGIONS.flat().map(([, y]) => y)
    expect(Math.max(...ys)).toBeGreaterThan(MAP_HEIGHT * 0.9)
  })

  it('produces a quadratic bezier curved route path', () => {
    const path = curvedRoutePath({ x: 0, y: 0 }, { x: 100, y: 100 })
    expect(path).toMatch(/^M0 0 Q/)
    expect(path).toMatch(/100 100$/)
  })

  it('scales stroke width with the magnitude of change but clamps', () => {
    expect(routeStrokeWidth(0)).toBeGreaterThanOrEqual(1.5)
    expect(routeStrokeWidth(50)).toBeLessThanOrEqual(6)
    expect(routeStrokeWidth(100)).toBeLessThanOrEqual(6)
  })

  it('uses dashed stroke for falling fares and solid for rising', () => {
    expect(routeDasharray(-2)).toBe('6 4')
    expect(routeDasharray(2)).toBeUndefined()
  })
})