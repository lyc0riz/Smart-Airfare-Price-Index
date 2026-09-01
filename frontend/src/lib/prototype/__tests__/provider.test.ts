import { describe, it, expect } from 'vitest'
import { prototypeProvider } from '../provider'

describe('prototypeProvider', () => {
  it('returns latest index rows and an observation date', async () => {
    const result = await prototypeProvider.getLatestIndex('Ixigo')
    expect(result.data.length).toBeGreaterThan(0)
    expect(result.observation_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.current_index).toBeGreaterThan(0)
  })

  it('returns weekly data at the requested limit', async () => {
    const result = await prototypeProvider.getWeeklyIndex('Ixigo', 4)
    expect(result.data.length).toBe(4)
    expect(result.data[0]!.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns monthly data at the requested limit', async () => {
    const result = await prototypeProvider.getMonthlyIndex('Ixigo', 3)
    expect(result.data.length).toBe(3)
  })

  it('returns per-route deltas', async () => {
    const result = await prototypeProvider.getByRoute('2026-08-31', 'Ixigo')
    expect(result.data.length).toBeGreaterThan(0)
    for (const row of result.data) {
      expect(row.origin).toBeTruthy()
      expect(row.destination).toBeTruthy()
      expect(row.index_value).toBeGreaterThan(0)
    }
  })

  it('returns heatmap cells for every route-window pair', async () => {
    const result = await prototypeProvider.getHeatmap('2026-08-31', 'Ixigo')
    expect(result.data.length).toBeGreaterThan(20)
    const windowKeys = new Set(result.data.map((c) => c.advance_windows))
    expect([1, 7, 15, 30, 45].every((w) => windowKeys.has(w))).toBe(true)
  })

  it('respects the limit on elasticity', async () => {
    const result = await prototypeProvider.getElasticity('DEL-BOM', 7, 'Ixigo', 10)
    expect(result.data.length).toBe(10)
  })

  it('returns airline fares', async () => {
    const result = await prototypeProvider.getAirlines('DEL-BOM', '2026-08-31', 'Ixigo')
    expect(result.data.length).toBeGreaterThanOrEqual(5)
    for (const a of result.data) {
      expect(a.total_fare).toBeGreaterThan(0)
      expect(a.carrier_code).toBeTruthy()
    }
  })

  it('returns dual-portal coverage rows', async () => {
    const result = await prototypeProvider.getCoverage(3)
    expect(result.data.length).toBe(6)
    const portals = new Set(result.data.map((r) => r.source_portal))
    expect(portals.has('Ixigo')).toBe(true)
    expect(portals.has('Google Flights')).toBe(true)
  })
})