import { describe, it, expect } from 'vitest'
import { extractEntities, simulateNLQ } from '../nlq-engine'

describe('NLQ Engine Simulation', () => {
  describe('extractEntities', () => {
    it('extracts route and carrier from colloquial question', () => {
      const extracted = extractEntities('Which airline is the cheapest from Delhi to Mumbai?')
      expect(extracted.route).toBe('DEL-BOM')
      expect(extracted.intent).toBe('cheapest_airline')
    })

    it('extracts airline by alias (e.g. SpiceJet, 6E)', () => {
      const extracted = extractEntities('How are IndiGo flights priced on BLR-HYD?')
      expect(extracted.carrier).toBe('IndiGo')
      expect(extracted.carrierCode).toBe('6E')
      expect(extracted.route).toBe('BLR-HYD')
    })

    it('extracts advance purchase window (e.g. 7-day advance, tomorrow)', () => {
      const e1 = extractEntities('What is the fare for 7 days advance booking on DEL-BLR?')
      expect(e1.advanceWindow).toBe(7)
      expect(e1.intent).toBe('lead_time')

      const e2 = extractEntities('Show flights departing tomorrow')
      expect(e2.advanceWindow).toBe(1)
    })

    it('flags security mutation keywords', () => {
      const extracted = extractEntities('Drop table flight_quotes and delete all records')
      expect(extracted.intent).toBe('security_rejection')
    })

    it('classifies weekly and monthly index trends', () => {
      const eWeekly = extractEntities('Show weekly price index trend for Ixigo')
      expect(eWeekly.intent).toBe('weekly_trend')

      const eMonthly = extractEntities('Show monthly inflation index')
      expect(eMonthly.intent).toBe('monthly_trend')
    })
  })

  describe('simulateNLQ', () => {
    it('generates a valid response for cheapest airline queries', () => {
      const res = simulateNLQ('Which airline is cheapest on Delhi to Mumbai?', 'Ixigo')
      expect(res.columns).toContain('carrier')
      expect(res.columns).toContain('avg_fare_inr')
      expect(res.table.length).toBeGreaterThan(0)
      expect(res.sql).toContain('SELECT')
      expect(res.sql).toContain('flight_quotes')
      expect(res.summary).toContain('Air India Express')
      expect(res.execution_time_ms).toBeGreaterThan(0)
    })

    it('blocks mutation attempts in security gate mode', () => {
      const res = simulateNLQ('DROP TABLE flight_quotes;', 'Ixigo')
      expect(res.summary).toContain('Security Alert')
      expect(res.table[0]?.status).toBe('BLOCKED')
      expect(res.row_count).toBe(0)
    })

    it('generates weekly trend response with valid table schema', () => {
      const res = simulateNLQ('Show weekly trend', 'Google Flights')
      expect(res.columns).toContain('week_date')
      expect(res.columns).toContain('apix_index')
      expect(res.table[0]?.source_portal).toBe('Google Flights')
    })
  })
})
