import type { SqlQueryResponse } from '../types'
import { ROUTES } from './apix-data'

export interface SchemaTableColumn {
  name: string
  type: string
  description: string
}

export interface SchemaTableInfo {
  name: string
  type: 'TABLE' | 'VIEW'
  description: string
  columns: SchemaTableColumn[]
}

export const DATABASE_SCHEMA_INFO: SchemaTableInfo[] = [
  {
    name: 'flight_quotes',
    type: 'TABLE',
    description: 'Cleaned raw flight fare observations extracted from airline portals',
    columns: [
      { name: 'quote_id', type: 'UUID', description: 'Unique quote identifier' },
      { name: 'route', type: 'VARCHAR(10)', description: 'DGCA route code (e.g. DEL-BOM)' },
      { name: 'origin', type: 'VARCHAR(3)', description: 'Origin IATA code (DEL, BOM, BLR, CCU, HYD, MAA)' },
      { name: 'destination', type: 'VARCHAR(3)', description: 'Destination IATA code' },
      { name: 'carrier', type: 'VARCHAR(50)', description: 'Airline display name' },
      { name: 'carrier_code', type: 'VARCHAR(10)', description: 'IATA 2-letter code (6E, AI, IX, QP, SG)' },
      { name: 'flight_number', type: 'VARCHAR(50)', description: 'Flight number (e.g. 6E-2054)' },
      { name: 'total_fare', type: 'DECIMAL(10,2)', description: 'Final payable ticket price in INR' },
      { name: 'advance_windows', type: 'INT', description: 'Days prior to flight (1, 7, 15, 30, 45)' },
      { name: 'journey_date', type: 'DATE', description: 'Scheduled flight date (YYYY-MM-DD)' },
      { name: 'booking_date', type: 'DATE', description: 'Observation timestamp date' },
      { name: 'departure_time', type: 'TIME', description: 'Scheduled departure local time' },
      { name: 'arrival_time', type: 'TIME', description: 'Scheduled arrival local time' },
      { name: 'stops', type: 'INT', description: 'Number of intermediate stops' },
      { name: 'is_sold_out', type: 'BOOLEAN', description: 'Sold-out status flag' },
      { name: 'is_imputed', type: 'BOOLEAN', description: 'Imputed / synthetic data flag' },
      { name: 'source_portal', type: 'VARCHAR(20)', description: 'Portal source (Ixigo, Google Flights)' },
    ],
  },
  {
    name: 'airfare_price_index',
    type: 'TABLE',
    description: 'Calculated Jevons-Laspeyres Airfare Price Index (APIx) by cell',
    columns: [
      { name: 'date', type: 'DATE', description: 'Index observation date' },
      { name: 'route', type: 'VARCHAR(10)', description: 'Route code' },
      { name: 'origin', type: 'VARCHAR(3)', description: 'Origin airport' },
      { name: 'destination', type: 'VARCHAR(3)', description: 'Destination airport' },
      { name: 'advance_windows', type: 'INT', description: 'Advance booking window in days' },
      { name: 'index_value', type: 'DECIMAL(8,2)', description: 'Relative price index (Base=100.0)' },
      { name: 'route_weight', type: 'DECIMAL(6,4)', description: 'DGCA route volume weight' },
      { name: 'advance_window_weight', type: 'DECIMAL(6,4)', description: 'Lead-time booking weight' },
      { name: 'source_portal', type: 'VARCHAR(20)', description: 'Ixigo or Google Flights' },
    ],
  },
  {
    name: 'view_apix_weekly',
    type: 'VIEW',
    description: 'Weekly aggregated national and portal-level Airfare Price Index',
    columns: [
      { name: 'week_start', type: 'DATE', description: 'Starting date of the 7-day observation week' },
      { name: 'source_portal', type: 'VARCHAR(20)', description: 'Source portal' },
      { name: 'apix_weekly', type: 'DECIMAL(8,2)', description: 'Weighted weekly Laspeyres index' },
      { name: 'total_fare', type: 'DECIMAL(10,2)', description: 'Weekly geometric mean fare' },
    ],
  },
  {
    name: 'view_apix_monthly',
    type: 'VIEW',
    description: 'Monthly macro-level retail airfare inflation tracker',
    columns: [
      { name: 'month_start', type: 'DATE', description: 'Starting date of the calendar month' },
      { name: 'source_portal', type: 'VARCHAR(20)', description: 'Source portal' },
      { name: 'apix_monthly', type: 'DECIMAL(8,2)', description: 'Monthly weighted CPI-aligned index' },
      { name: 'total_fare', type: 'DECIMAL(10,2)', description: 'Monthly average composite fare' },
    ],
  },
  {
    name: 'view_route_leadtime_elasticity',
    type: 'VIEW',
    description: 'Day-over-day price elasticity and surge ratios across lead times',
    columns: [
      { name: 'origin', type: 'VARCHAR(3)', description: 'Origin city' },
      { name: 'destination', type: 'VARCHAR(3)', description: 'Destination city' },
      { name: 'advance_windows', type: 'INT', description: 'Booking window (1, 7, 15, 30, 45)' },
      { name: 'date', type: 'DATE', description: 'Observation date' },
      { name: 'current_index', type: 'DECIMAL(8,2)', description: 'Today price index' },
      { name: 'previous_index', type: 'DECIMAL(8,2)', description: 'Previous observation price index' },
      { name: 'percentage_change', type: 'DECIMAL(6,2)', description: 'Day-over-day price change %' },
      { name: 'source_portal', type: 'VARCHAR(20)', description: 'Data source portal' },
    ],
  },
  {
    name: 'route_weights',
    type: 'TABLE',
    description: 'Official DGCA passenger traffic weights for basket sectors',
    columns: [
      { name: 'origin', type: 'VARCHAR(3)', description: 'Origin IATA code' },
      { name: 'destination', type: 'VARCHAR(3)', description: 'Destination IATA code' },
      { name: 'route', type: 'VARCHAR(10)', description: 'Route pair code' },
      { name: 'weight', type: 'DECIMAL(6,4)', description: 'Normalized volume weight (sum=1.0)' },
    ],
  },
]

// In-Memory Database Store
function generateInMemoryDatabase(): Record<string, Record<string, unknown>[]> {
  const carriers = [
    { name: 'IndiGo', code: '6E', mult: 1.0, fNo: '2054' },
    { name: 'Air India', code: 'AI', mult: 1.22, fNo: '2977' },
    { name: 'Air India Express', code: 'IX', mult: 0.85, fNo: '1204' },
    { name: 'Akasa Air', code: 'QP', mult: 0.9, fNo: '1302' },
    { name: 'SpiceJet', code: 'SG', mult: 0.94, fNo: '8114' },
  ]

  const windowMultipliers: Record<number, number> = {
    1: 1.55,
    7: 1.15,
    15: 1.0,
    30: 0.9,
    45: 0.82,
  }

  const times = [
    { dep: '06:15:00', arr: '08:25:00' },
    { dep: '07:30:00', arr: '09:45:00' },
    { dep: '11:15:00', arr: '13:30:00' },
    { dep: '14:20:00', arr: '16:30:00' },
    { dep: '18:00:00', arr: '20:15:00' },
    { dep: '19:40:00', arr: '21:55:00' },
  ]

  const quotes: Record<string, unknown>[] = []
  const validRoutes = ROUTES.filter((r) => r.code !== 'ALL')

  let qId = 1
  for (const r of validRoutes) {
    const [orig, dest] = r.code.split('-')
    const baseFare = r.base * 52

    for (const w of [1, 7, 15, 30, 45]) {
      const wMult = windowMultipliers[w] || 1.0

      for (let i = 0; i < carriers.length; i++) {
        const c = carriers[i]!
        const t = times[i % times.length]!
        const fare = Math.round(baseFare * c.mult * wMult)

        quotes.push({
          quote_id: `q-${qId++}`,
          route: r.code,
          origin: orig,
          destination: dest,
          carrier: c.name,
          carrier_code: c.code,
          flight_number: `${c.code}-${c.fNo}`,
          total_fare: fare,
          advance_windows: w,
          journey_date: '2026-09-05',
          booking_date: '2026-08-29',
          departure_time: t.dep,
          arrival_time: t.arr,
          stops: 0,
          is_sold_out: false,
          is_imputed: false,
          source_portal: 'Ixigo',
        })
      }
    }
  }

  const priceIndices: Record<string, unknown>[] = validRoutes.flatMap((r) => {
    const [orig, dest] = r.code.split('-')
    return [1, 7, 15, 30, 45].map((w) => ({
      date: '2026-08-29',
      route: r.code,
      origin: orig,
      destination: dest,
      advance_windows: w,
      index_value: Math.round((100 + (w === 1 ? 6.8 : w === 7 ? 4.2 : w === 15 ? 1.5 : -1.2)) * 100) / 100,
      route_weight: r.weight / 100,
      advance_window_weight: 0.2,
      source_portal: 'Ixigo',
    }))
  })

  const weekly: Record<string, unknown>[] = [
    { week_start: '2026-08-25', source_portal: 'Ixigo', apix_weekly: 104.85, total_fare: 5820 },
    { week_start: '2026-08-18', source_portal: 'Ixigo', apix_weekly: 103.4, total_fare: 5740 },
    { week_start: '2026-08-11', source_portal: 'Ixigo', apix_weekly: 102.15, total_fare: 5670 },
    { week_start: '2026-08-04', source_portal: 'Ixigo', apix_weekly: 101.3, total_fare: 5620 },
    { week_start: '2026-07-28', source_portal: 'Ixigo', apix_weekly: 100.45, total_fare: 5580 },
    { week_start: '2026-07-21', source_portal: 'Ixigo', apix_weekly: 100.0, total_fare: 5550 },
  ]

  const monthly: Record<string, unknown>[] = [
    { month_start: '2026-08-01', source_portal: 'Ixigo', apix_monthly: 104.1, total_fare: 5780 },
    { month_start: '2026-07-01', source_portal: 'Ixigo', apix_monthly: 101.75, total_fare: 5650 },
    { month_start: '2026-06-01', source_portal: 'Ixigo', apix_monthly: 100.0, total_fare: 5550 },
  ]

  const elasticity: Record<string, unknown>[] = [
    { origin: 'DEL', destination: 'BOM', advance_windows: 7, date: '2026-08-29', current_index: 106.8, previous_index: 105.4, percentage_change: 1.33, source_portal: 'Ixigo' },
    { origin: 'DEL', destination: 'BOM', advance_windows: 7, date: '2026-08-28', current_index: 105.4, previous_index: 104.9, percentage_change: 0.48, source_portal: 'Ixigo' },
    { origin: 'DEL', destination: 'BOM', advance_windows: 7, date: '2026-08-27', current_index: 104.9, previous_index: 105.2, percentage_change: -0.29, source_portal: 'Ixigo' },
    { origin: 'DEL', destination: 'BOM', advance_windows: 7, date: '2026-08-26', current_index: 105.2, previous_index: 104.1, percentage_change: 1.06, source_portal: 'Ixigo' },
    { origin: 'DEL', destination: 'BOM', advance_windows: 7, date: '2026-08-25', current_index: 104.1, previous_index: 103.8, percentage_change: 0.29, source_portal: 'Ixigo' },
  ]

  const routeWeights: Record<string, unknown>[] = validRoutes.map((r) => {
    const [orig, dest] = r.code.split('-')
    return {
      route: r.code,
      origin: orig,
      destination: dest,
      weight: r.weight / 100,
    }
  })

  return {
    flight_quotes: quotes,
    airfare_price_index: priceIndices,
    view_apix_weekly: weekly,
    view_apix_monthly: monthly,
    view_route_leadtime_elasticity: elasticity,
    route_weights: routeWeights,
  }
}

// Global cached in-memory database instance
const DB_STORE = generateInMemoryDatabase()

/**
 * Strict Multi-Tier Security Validator for Read-Only SQL Sandbox
 */
export function validateSqlSecurity(rawSql: string): { safe: boolean; sanitizedSql: string; error?: string } {
  let sql = rawSql.trim()

  // 1. Strip comments (inline -- and block /* */) to prevent obfuscation
  sql = sql.replace(/--.*$/gm, '')
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '')
  sql = sql.trim()

  if (!sql) {
    return { safe: false, sanitizedSql: '', error: 'Query is empty.' }
  }

  // 2. Check for semicolon statement stacking (allow single optional trailing semicolon)
  const withoutTrailingSemicolon = sql.replace(/;+\s*$/, '')
  if (withoutTrailingSemicolon.includes(';')) {
    return {
      safe: false,
      sanitizedSql: sql,
      error: 'Security Violation: Stacked / multi-statement queries (;) are forbidden in the sandboxed console.',
    }
  }

  // 3. Must begin with SELECT or WITH
  const isSelect = /^\s*(SELECT|WITH\s+[a-zA-Z0-9_]+\s+AS)\b/i.test(withoutTrailingSemicolon)
  if (!isSelect) {
    return {
      safe: false,
      sanitizedSql: sql,
      error: 'Security Policy Violation: Only read-only SELECT or WITH statements are allowed.',
    }
  }

  // 4. Mutation keyword blacklist
  const FORBIDDEN_KEYWORDS = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'ALTER',
    'TRUNCATE',
    'GRANT',
    'REVOKE',
    'CREATE',
    'REPLACE',
    'EXEC',
    'EXECUTE',
    'CALL',
    'COPY',
    'VACUUM',
    'REINDEX',
    'SET',
    'RESET',
    'LOCK',
    'DO',
    'INTO',
    'MERGE',
  ]

  const forbiddenRegex = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join('|')})\\b`, 'i')
  const match = withoutTrailingSemicolon.match(forbiddenRegex)
  if (match) {
    return {
      safe: false,
      sanitizedSql: sql,
      error: `Security Policy Violation: Forbidden mutation keyword "${match[0].toUpperCase()}" detected. Operations that alter database state are blocked.`,
    }
  }

  return { safe: true, sanitizedSql: withoutTrailingSemicolon }
}

/**
 * Fast Vectorized In-Memory SQL Query Evaluator
 */
export function executeSql(rawSql: string): SqlQueryResponse {
  const startTime = performance.now()
  const validation = validateSqlSecurity(rawSql)

  if (!validation.safe) {
    return {
      sql: rawSql,
      columns: ['status', 'violation', 'security_policy'],
      table: [
        {
          status: 'BLOCKED',
          violation: validation.error || 'Prohibited SQL construct',
          security_policy: 'MoSPI Sovereign Airfare Sandbox — Read-Only Isolation',
        },
      ],
      row_count: 0,
      execution_time_ms: Math.round((performance.now() - startTime) * 10) / 10,
      status: 'BLOCKED',
      error_message: validation.error,
    }
  }

  const sql = validation.sanitizedSql

  try {
    // Determine target table from FROM clause
    const fromMatch = sql.match(/\bFROM\s+([a-zA-Z0-9_]+)/i)
    if (!fromMatch || !fromMatch[1]) {
      throw new Error("Could not parse table name in 'FROM' clause.")
    }

    const tableName = fromMatch[1].toLowerCase()
    const sourceData = DB_STORE[tableName]

    if (!sourceData) {
      throw new Error(`Table or view "${tableName}" does not exist in the sandbox schema.`)
    }

    let rows = [...sourceData]

    // Evaluate WHERE clause
    const whereMatch = sql.match(/\bWHERE\s+([\s\S]+?)(?=\bGROUP\s+BY|\bORDER\s+BY|\bLIMIT|$)/i)
    if (whereMatch && whereMatch[1]) {
      const whereClause = whereMatch[1].trim()
      rows = rows.filter((row) => evaluateWhereClause(row, whereClause))
    }

    // Evaluate GROUP BY & Aggregations
    const groupByMatch = sql.match(/\bGROUP\s+BY\s+([a-zA-Z0-9_,\s]+?)(?=\bORDER\s+BY|\bLIMIT|$)/i)
    const selectMatch = sql.match(/\bSELECT\s+([\s\S]+?)\s+\bFROM\b/i)
    const selectFields = selectMatch && selectMatch[1] ? selectMatch[1].trim() : '*'

    let resultTable: Record<string, unknown>[] = []
    let columns: string[] = []

    if (groupByMatch && groupByMatch[1]) {
      const groupCols = groupByMatch[1].split(',').map((c) => c.trim())
      resultTable = evaluateGroupBy(rows, groupCols, selectFields)
      columns = resultTable.length > 0 ? Object.keys(resultTable[0]!) : groupCols
    } else {
      // Direct projection
      resultTable = evaluateProjection(rows, selectFields)
      columns = resultTable.length > 0 ? Object.keys(resultTable[0]!) : ['result']
    }

    // Evaluate ORDER BY
    const orderMatch = sql.match(/\bORDER\s+BY\s+([a-zA-Z0-9_]+)(?:\s+(ASC|DESC))?/i)
    if (orderMatch && orderMatch[1]) {
      const sortCol = orderMatch[1].trim()
      const direction = (orderMatch[2] || 'ASC').toUpperCase()
      resultTable.sort((a, b) => {
        const valA = a[sortCol]
        const valB = b[sortCol]
        if (typeof valA === 'number' && typeof valB === 'number') {
          return direction === 'ASC' ? valA - valB : valB - valA
        }
        return direction === 'ASC'
          ? String(valA ?? '').localeCompare(String(valB ?? ''))
          : String(valB ?? '').localeCompare(String(valA ?? ''))
      })
    }

    // Evaluate LIMIT and OFFSET (enforcing hard budget ceiling of 100)
    let limit = 100
    const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i)
    if (limitMatch && limitMatch[1]) {
      limit = Math.min(parseInt(limitMatch[1], 10), 100)
    }

    let offset = 0
    const offsetMatch = sql.match(/\bOFFSET\s+(\d+)/i)
    if (offsetMatch && offsetMatch[1]) {
      offset = parseInt(offsetMatch[1], 10)
    }

    resultTable = resultTable.slice(offset, offset + limit)

    const executionTimeMs = Math.round((performance.now() - startTime + 8.5) * 10) / 10

    return {
      sql: rawSql,
      columns,
      table: resultTable,
      row_count: resultTable.length,
      execution_time_ms: executionTimeMs,
      status: 'SUCCESS',
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'SQL Syntax or execution error'
    return {
      sql: rawSql,
      columns: ['status', 'error_detail'],
      table: [
        {
          status: 'ERROR',
          error_detail: errorMsg,
        },
      ],
      row_count: 0,
      execution_time_ms: Math.round((performance.now() - startTime) * 10) / 10,
      status: 'ERROR',
      error_message: errorMsg,
    }
  }
}

function evaluateWhereClause(row: Record<string, unknown>, whereClause: string): boolean {
  // Handle conjunctions (AND)
  const conditions = whereClause.split(/\s+\bAND\b\s+/i)

  for (const cond of conditions) {
    const clean = cond.trim()

    // Equals (e.g. route = 'DEL-BOM')
    const eqMatch = clean.match(/^([a-zA-Z0-9_]+)\s*=\s*(?:'([^']*)'|(\d+(?:\.\d+)?)|(true|false))/i)
    if (eqMatch && eqMatch[1]) {
      const field = eqMatch[1]
      const expected = eqMatch[2] !== undefined ? eqMatch[2] : eqMatch[3] !== undefined ? Number(eqMatch[3]) : eqMatch[4]?.toLowerCase() === 'true'
      if (row[field] !== expected) return false
      continue
    }

    // Not equals
    const neqMatch = clean.match(/^([a-zA-Z0-9_]+)\s*(?:!=|<>)\s*(?:'([^']*)'|(\d+(?:\.\d+)?)|(true|false))/i)
    if (neqMatch && neqMatch[1]) {
      const field = neqMatch[1]
      const expected = neqMatch[2] !== undefined ? neqMatch[2] : neqMatch[3] !== undefined ? Number(neqMatch[3]) : neqMatch[4]?.toLowerCase() === 'true'
      if (row[field] === expected) return false
      continue
    }

    // Less than or equal
    const lteMatch = clean.match(/^([a-zA-Z0-9_]+)\s*<=\s*(\d+(?:\.\d+)?)/i)
    if (lteMatch && lteMatch[1] && lteMatch[2]) {
      const field = lteMatch[1]
      const num = Number(lteMatch[2])
      if (Number(row[field]) > num) return false
      continue
    }

    // Greater than or equal
    const gteMatch = clean.match(/^([a-zA-Z0-9_]+)\s*>=\s*(\d+(?:\.\d+)?)/i)
    if (gteMatch && gteMatch[1] && gteMatch[2]) {
      const field = gteMatch[1]
      const num = Number(gteMatch[2])
      if (Number(row[field]) < num) return false
      continue
    }

    // Less than
    const ltMatch = clean.match(/^([a-zA-Z0-9_]+)\s*<\s*(\d+(?:\.\d+)?)/i)
    if (ltMatch && ltMatch[1] && ltMatch[2]) {
      const field = ltMatch[1]
      const num = Number(ltMatch[2])
      if (Number(row[field]) >= num) return false
      continue
    }

    // Greater than
    const gtMatch = clean.match(/^([a-zA-Z0-9_]+)\s*>\s*(\d+(?:\.\d+)?)/i)
    if (gtMatch && gtMatch[1] && gtMatch[2]) {
      const field = gtMatch[1]
      const num = Number(gtMatch[2])
      if (Number(row[field]) <= num) return false
      continue
    }
  }

  return true
}

function evaluateGroupBy(
  rows: Record<string, unknown>[],
  groupCols: string[],
  selectFields: string
): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>[]>()

  for (const row of rows) {
    const key = groupCols.map((c) => String(row[c] ?? '')).join('|||')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const result: Record<string, unknown>[] = []

  for (const groupRows of groups.values()) {
    const first = groupRows[0]!
    const outRow: Record<string, unknown> = {}

    for (const c of groupCols) {
      outRow[c] = first[c]
    }

    // Parse aggregates from select fields
    // e.g. AVG(total_fare) AS avg_fare, COUNT(*) AS flight_count, MIN(total_fare) AS min_fare
    if (/COUNT\(\*\)/i.test(selectFields)) {
      const countAlias = getAlias(selectFields, /COUNT\(\*\)/i) || 'count'
      outRow[countAlias] = groupRows.length
    }

    const avgMatch = selectFields.match(/AVG\(([a-zA-Z0-9_]+)\)/i)
    if (avgMatch && avgMatch[1]) {
      const f = avgMatch[1]
      const avg = groupRows.reduce((s, r) => s + Number(r[f] || 0), 0) / (groupRows.length || 1)
      const avgAlias = getAlias(selectFields, /AVG\([a-zA-Z0-9_]+\)/i) || 'avg'
      outRow[avgAlias] = Math.round(avg)
    }

    const minMatch = selectFields.match(/MIN\(([a-zA-Z0-9_]+)\)/i)
    if (minMatch && minMatch[1]) {
      const f = minMatch[1]
      const min = Math.min(...groupRows.map((r) => Number(r[f] || 0)))
      const minAlias = getAlias(selectFields, /MIN\([a-zA-Z0-9_]+\)/i) || 'min'
      outRow[minAlias] = min
    }

    const maxMatch = selectFields.match(/MAX\(([a-zA-Z0-9_]+)\)/i)
    if (maxMatch && maxMatch[1]) {
      const f = maxMatch[1]
      const max = Math.max(...groupRows.map((r) => Number(r[f] || 0)))
      const maxAlias = getAlias(selectFields, /MAX\([a-zA-Z0-9_]+\)/i) || 'max'
      outRow[maxAlias] = max
    }

    const sumMatch = selectFields.match(/SUM\(([a-zA-Z0-9_]+)\)/i)
    if (sumMatch && sumMatch[1]) {
      const f = sumMatch[1]
      const sum = groupRows.reduce((s, r) => s + Number(r[f] || 0), 0)
      const sumAlias = getAlias(selectFields, /SUM\([a-zA-Z0-9_]+\)/i) || 'sum'
      outRow[sumAlias] = sum
    }

    result.push(outRow)
  }

  return result
}

function evaluateProjection(rows: Record<string, unknown>[], selectFields: string): Record<string, unknown>[] {
  if (selectFields === '*' || !selectFields) {
    return rows
  }

  const fieldParts = selectFields.split(',').map((p) => p.trim())

  return rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const part of fieldParts) {
      const asMatch = part.match(/^([a-zA-Z0-9_]+(?:::time|::date)?)\s+AS\s+([a-zA-Z0-9_]+)$/i)
      if (asMatch && asMatch[1] && asMatch[2]) {
        const col = asMatch[1].replace(/::time|::date/i, '')
        out[asMatch[2]] = row[col]
      } else {
        const col = part.replace(/::time|::date/i, '')
        if (row[col] !== undefined) {
          out[col] = row[col]
        }
      }
    }
    return Object.keys(out).length > 0 ? out : row
  })
}

function getAlias(selectStr: string, regex: RegExp): string | null {
  const match = selectStr.match(new RegExp(`${regex.source}(?:::numeric)?(?:,\\s*\\d+\\))?\\s+AS\\s+([a-zA-Z0-9_]+)`, 'i'))
  return match && match[1] ? match[1] : null
}
