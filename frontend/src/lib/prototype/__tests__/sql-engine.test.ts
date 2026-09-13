import { describe, it, expect } from 'vitest'
import { validateSqlSecurity, executeSql } from '../sql-engine'

describe('SQL Engine & Security Sandbox', () => {
  describe('validateSqlSecurity', () => {
    it('allows valid read-only SELECT queries', () => {
      const res = validateSqlSecurity("SELECT * FROM flight_quotes WHERE route = 'DEL-BOM'")
      expect(res.safe).toBe(true)
      expect(res.sanitizedSql).toContain('SELECT')
    })

    it('strips inline and block SQL comments cleanly', () => {
      const res = validateSqlSecurity("SELECT carrier /* inline comment */ FROM flight_quotes -- trailing comment")
      expect(res.safe).toBe(true)
      expect(res.sanitizedSql).not.toContain('inline comment')
      expect(res.sanitizedSql).not.toContain('trailing comment')
    })

    it('blocks DROP TABLE mutation attempts', () => {
      const res = validateSqlSecurity('DROP TABLE flight_quotes;')
      expect(res.safe).toBe(false)
      expect(res.error).toContain('Security Policy Violation')
    })

    it('blocks DELETE and UPDATE mutation attempts', () => {
      const res1 = validateSqlSecurity('DELETE FROM airfare_price_index;')
      expect(res1.safe).toBe(false)
      expect(res1.error).toContain('Security Policy Violation')

      const res2 = validateSqlSecurity("UPDATE flight_quotes SET total_fare = 0 WHERE carrier = 'IndiGo';")
      expect(res2.safe).toBe(false)
      expect(res2.error).toContain('Security Policy Violation')
    })

    it('blocks stacked / multi-statement semicolon injections', () => {
      const res = validateSqlSecurity("SELECT * FROM flight_quotes; SELECT * FROM route_weights;")
      expect(res.safe).toBe(false)
      expect(res.error).toContain('Stacked / multi-statement')
    })

    it('blocks non-SELECT statements like ALTER or INSERT', () => {
      const res = validateSqlSecurity("INSERT INTO flight_quotes (route) VALUES ('DEL-BOM')")
      expect(res.safe).toBe(false)
      expect(res.error).toContain('Security Policy Violation')
    })
  })

  describe('executeSql', () => {
    it('executes SELECT query with WHERE filtering', () => {
      const res = executeSql("SELECT route, carrier, total_fare FROM flight_quotes WHERE route = 'DEL-BOM' LIMIT 5")
      expect(res.status).toBe('SUCCESS')
      expect(res.columns).toContain('route')
      expect(res.columns).toContain('carrier')
      expect(res.columns).toContain('total_fare')
      expect(res.table.length).toBe(5)
      expect(res.table.every((r) => r.route === 'DEL-BOM')).toBe(true)
    })

    it('executes GROUP BY with aggregations (AVG, COUNT, MIN)', () => {
      const res = executeSql("SELECT carrier, carrier_code, AVG(total_fare) AS avg_fare, MIN(total_fare) AS min_fare, COUNT(*) AS flight_count FROM flight_quotes WHERE route = 'DEL-BOM' GROUP BY carrier, carrier_code")
      expect(res.status).toBe('SUCCESS')
      expect(res.columns).toContain('carrier')
      expect(res.columns).toContain('avg_fare')
      expect(res.columns).toContain('flight_count')
      expect(res.table.length).toBeGreaterThan(0)
    })

    it('executes ORDER BY with DESC sorting', () => {
      const res = executeSql("SELECT route, total_fare FROM flight_quotes ORDER BY total_fare DESC LIMIT 5")
      expect(res.status).toBe('SUCCESS')
      expect(Number(res.table[0]?.total_fare)).toBeGreaterThanOrEqual(Number(res.table[1]?.total_fare))
    })

    it('returns structured BLOCKED status when security violation occurs', () => {
      const res = executeSql("DROP TABLE flight_quotes;")
      expect(res.status).toBe('BLOCKED')
      expect(res.table[0]?.status).toBe('BLOCKED')
    })

    it('queries view_apix_weekly view correctly', () => {
      const res = executeSql("SELECT week_start, apix_weekly, total_fare FROM view_apix_weekly ORDER BY week_start DESC LIMIT 4")
      expect(res.status).toBe('SUCCESS')
      expect(res.table.length).toBe(4)
      expect(res.columns).toContain('apix_weekly')
    })
  })
})
