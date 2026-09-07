import { describe, it, expect } from 'vitest'
import { routeLeadTime, windowStats, airlineLeadTime, leadCurve, windowLabel, LEAD_WINDOWS, OBSERVATION_PERIOD } from '../leadtime'

describe('leadtime', () => {
  it('exposes the expected windows and observation period', () => {
    expect(LEAD_WINDOWS).toEqual([1, 7, 15, 30, 45])
    expect(OBSERVATION_PERIOD).toContain('2026')
  })

  it('labels windows', () => {
    expect(windowLabel(7)).toBe('T+7')
  })

  it('builds route lead-time rows with five windows', () => {
    const rows = routeLeadTime('ALL', 'ALL')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.fares).toHaveLength(5)
      expect(row.fares[0]! > row.fares[4]!).toBe(true)
      expect(row.code.length).toBeGreaterThan(0)
    }
  })

  it('filters to a single route', () => {
    const rows = routeLeadTime('DEL-BOM', 'ALL')
    expect(rows[0]!.route).toBe('DEL–BOM')
  })

  it('computes monotonic window statistics', () => {
    const stats = windowStats('ALL', 'ALL')
    expect(stats).toHaveLength(5)
    for (const s of stats) {
      expect(s.avgFare).toBeGreaterThan(0)
      expect(s.medianFare).toBeGreaterThan(0)
      expect(s.observations).toBeGreaterThan(0)
      expect(s.routes).toBeGreaterThan(0)
      expect(Number.isFinite(s.changeFromBase)).toBe(true)
    }
  })

  it('produces an airline comparison list', () => {
    const airlines = airlineLeadTime('ALL')
    expect(airlines.length).toBeGreaterThan(0)
    for (const a of airlines) {
      expect(a.fares).toHaveLength(5)
      expect(a.label).toBeTruthy()
    }
  })

  it('computes a lead-time curve including interpolated days', () => {
    const curve = leadCurve('ALL', 'ALL')
    expect(curve.length).toBeGreaterThan(5)
    expect(curve[0]!.days).toBe(1)
    expect(curve.some((p) => p.days === 3)).toBe(true)
    for (const p of curve) {
      expect(p.avgFare).toBeGreaterThan(0)
    }
  })

  it('interpolates between the nearest windows', () => {
    const curve = leadCurve('DEL-BOM', 'ALL')
    const day3 = curve.find((p) => p.days === 3)!
    const day1 = curve.find((p) => p.days === 1)!
    const day7 = curve.find((p) => p.days === 7)!
    expect(day3.avgFare).toBeGreaterThanOrEqual(Math.min(day1.avgFare, day7.avgFare))
    expect(day3.avgFare).toBeLessThanOrEqual(Math.max(day1.avgFare, day7.avgFare))
  })
})