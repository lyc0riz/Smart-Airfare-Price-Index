import { describe, it, expect } from 'vitest'
import { project, routeIntel, cityOf, formatTraffic } from '../route-intel'
import { CITIES } from '../../constants'

describe('route-intel', () => {
  it('projects lon/lat into map coordinates within bounds', () => {
    const { x, y } = project(77.209, 28.6139)
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
  })

  it('maps latitude to an inverted y-axis', () => {
    const north = project(80, 32).y
    const south = project(80, 8).y
    expect(north).toBeLessThan(south)
  })

  it('builds per-route intelligence with derived fields', () => {
    const rows = routeIntel('ALL')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.code.split('-')).toHaveLength(2)
      expect(row.traffic).toBeGreaterThan(0)
      expect(row.baseFare).toBeGreaterThan(0)
      expect(row.contribution).toBeGreaterThan(0)
    }
  })

  it('resolves a known city', () => {
    expect(cityOf('DEL')?.name).toBeTruthy()
    expect(cityOf('DEL')?.lat).toBeCloseTo(28.6139, 1)
  })

  it('returns undefined for unknown city codes', () => {
    expect(cityOf('XYZ')).toBeUndefined()
  })

  it('formats traffic magnitudes in Indian notation', () => {
    expect(formatTraffic(150_000)).toBe('1.5 Lakh')
    expect(formatTraffic(12_500_000)).toBe('1.25 Cr')
    expect(formatTraffic(999)).toBe('999')
  })

  it('all CITY codes resolve', () => {
    for (const city of CITIES) {
      expect(cityOf(city.code)?.name).toBe(city.name)
    }
  })
})