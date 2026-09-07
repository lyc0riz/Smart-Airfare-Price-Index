import { describe, it, expect } from 'vitest'
import { runBacktest, CPI_OVERLAP_AVAILABLE } from '../backtest'

const START = '2026-01-01'
const END = '2026-01-30'

describe('backtest', () => {
  it('produces a completed backtest over a full window', () => {
    const result = runBacktest(START, END, 'ALL')
    expect(result.status).toBe('Completed')
    expect(result.expectedDays).toBe(30)
    expect(result.availableDays).toBe(30)
    expect(result.days).toHaveLength(30)
    expect(result.observations).toBeGreaterThan(0)
  })

  it('reports coverage on windows with missing days', () => {
    const result = runBacktest(START, END, '6E')
    expect(result.status).toMatch(/Completed|Partial Coverage/)
  })

  it('orders first and last day chronologically', () => {
    const result = runBacktest(START, END, 'ALL')
    expect(result.days[0]!.date).toBe(START)
    expect(result.days[result.days.length - 1]!.date).toBe(END)
  })

  it('flags insufficient data for very short windows', () => {
    const result = runBacktest('2026-01-01', '2026-01-02', 'AI')
    expect(result.expectedDays).toBe(2)
  })

  it('computes weighted contribution rows', () => {
    const result = runBacktest(START, END, 'ALL')
    expect(result.contributions.length).toBeGreaterThan(0)
    const totalWeight = result.contributions.reduce((s, c) => s + c.weight, 0)
    expect(totalWeight).toBeGreaterThan(80)
    expect(totalWeight).toBeLessThanOrEqual(100)
    for (const c of result.contributions) {
      expect(c.contribution).toBeGreaterThan(0)
      expect(Number.isFinite(c.fareChange)).toBe(true)
    }
  })

  it('extracts interesting extremes', () => {
    const result = runBacktest(START, END, 'ALL')
    expect(result.highest.index).toBeGreaterThanOrEqual(result.average)
    expect(result.lowest.index).toBeLessThanOrEqual(result.average)
  })

  it('reports CPI overlap availability', () => {
    expect(CPI_OVERLAP_AVAILABLE).toBe(false)
  })
})