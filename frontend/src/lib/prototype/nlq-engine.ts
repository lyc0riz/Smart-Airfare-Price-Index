import type { NLQResponse, Meta } from '../types'
import { ROUTES } from './apix-data'

export interface EntityExtraction {
  route: string | null
  origin: string | null
  destination: string | null
  carrier: string | null
  carrierCode: string | null
  advanceWindow: number | null
  intent:
    | 'cheapest_airline'
    | 'weekly_trend'
    | 'monthly_trend'
    | 'lead_time'
    | 'route_comparison'
    | 'flight_list'
    | 'carrier_intel'
    | 'security_rejection'
    | 'generic'
}

const CITY_SYNONYMS: Record<string, string> = {
  delhi: 'DEL',
  'new delhi': 'DEL',
  del: 'DEL',
  mumbai: 'BOM',
  bombay: 'BOM',
  bom: 'BOM',
  bengaluru: 'BLR',
  bangalore: 'BLR',
  blr: 'BLR',
  kolkata: 'CCU',
  calcutta: 'CCU',
  ccu: 'CCU',
  hyderabad: 'HYD',
  hyd: 'HYD',
  chennai: 'MAA',
  madras: 'MAA',
  maa: 'MAA',
  goa: 'GOI',
  pune: 'PNQ',
  ahmedabad: 'AMD',
}

const AIRLINE_SYNONYMS: Record<string, { name: string; code: string }> = {
  indigo: { name: 'IndiGo', code: '6E' },
  '6e': { name: 'IndiGo', code: '6E' },
  'air india': { name: 'Air India', code: 'AI' },
  ai: { name: 'Air India', code: 'AI' },
  'air india express': { name: 'Air India Express', code: 'IX' },
  'ai express': { name: 'Air India Express', code: 'IX' },
  ix: { name: 'Air India Express', code: 'IX' },
  akasa: { name: 'Akasa Air', code: 'QP' },
  'akasa air': { name: 'Akasa Air', code: 'QP' },
  qp: { name: 'Akasa Air', code: 'QP' },
  spicejet: { name: 'SpiceJet', code: 'SG' },
  sg: { name: 'SpiceJet', code: 'SG' },
  vistara: { name: 'Vistara', code: 'UK' },
}

const ROUTE_BASE_FARES: Record<string, number> = {
  'DEL-BOM': 5450,
  'DEL-BLR': 6480,
  'BOM-BLR': 4120,
  'DEL-CCU': 6120,
  'BLR-HYD': 3450,
  'MAA-DEL': 5890,
}

function getRouteBaseFare(route: string): number {
  if (ROUTE_BASE_FARES[route]) return ROUTE_BASE_FARES[route]!
  const matched = ROUTES.find((r) => r.code === route)
  if (matched && matched.base) return Math.round(matched.base * 52)
  return 4800
}

export function extractEntities(query: string): EntityExtraction {
  const q = query.toLowerCase().trim()

  // Security guard check
  const mutationPattern = /\b(drop|delete|truncate|update|insert|alter|grant|revoke|into)\b/i
  if (mutationPattern.test(q)) {
    return {
      route: null,
      origin: null,
      destination: null,
      carrier: null,
      carrierCode: null,
      advanceWindow: null,
      intent: 'security_rejection',
    }
  }

  // Carrier resolution
  let carrier: string | null = null
  let carrierCode: string | null = null
  for (const [alias, info] of Object.entries(AIRLINE_SYNONYMS)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(q)) {
      carrier = info.name
      carrierCode = info.code
      break
    }
  }

  // Advance window resolution
  let advanceWindow: number | null = null
  if (/\b(tomorrow|t\+1|1\s*day)\b/i.test(q)) advanceWindow = 1
  else if (/\b(next week|t\+7|7\s*days?)\b/i.test(q)) advanceWindow = 7
  else if (/\b(t\+15|15\s*days?|two weeks)\b/i.test(q)) advanceWindow = 15
  else if (/\b(t\+30|30\s*days?|month|1\s*month)\b/i.test(q)) advanceWindow = 30
  else if (/\b(t\+45|45\s*days?)\b/i.test(q)) advanceWindow = 45

  // Origin / Destination / Route resolution
  let origin: string | null = null
  let destination: string | null = null
  let route: string | null = null

  // Direct route format check (e.g. DEL-BOM, DEL to BOM, Delhi to Mumbai)
  const routeMatch = q.match(/\b([a-z]{3})[-–/to\s]+([a-z]{3})\b/i)
  if (routeMatch && routeMatch[1] && routeMatch[2]) {
    const o = routeMatch[1].toUpperCase()
    const d = routeMatch[2].toUpperCase()
    if (CITY_SYNONYMS[o.toLowerCase()] && CITY_SYNONYMS[d.toLowerCase()]) {
      origin = CITY_SYNONYMS[o.toLowerCase()] || o
      destination = CITY_SYNONYMS[d.toLowerCase()] || d
      route = `${origin}-${destination}`
    }
  }

  if (!route) {
    // Check "from X to Y" or "X to Y" with city names
    const cityPairs = q.match(
      /(?:from\s+)?([a-z\s]+?)\s+(?:to|-|–)\s+([a-z\s]+?)(?:\s+route|\s+flight|\s+window|\s*$|\?|\.)/i
    )
    if (cityPairs && cityPairs[1] && cityPairs[2]) {
      const c1 = cityPairs[1].trim()
      const c2 = cityPairs[2].trim()
      if (CITY_SYNONYMS[c1] && CITY_SYNONYMS[c2]) {
        origin = CITY_SYNONYMS[c1]!
        destination = CITY_SYNONYMS[c2]!
        route = `${origin}-${destination}`
      }
    }
  }

  // Single city check
  if (!origin || !destination) {
    for (const [city, code] of Object.entries(CITY_SYNONYMS)) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(q)) {
        if (!origin) origin = code
        else if (!destination && code !== origin) {
          destination = code
          route = `${origin}-${destination}`
        }
      }
    }
  }

  // Intent classification
  let intent: EntityExtraction['intent'] = 'generic'
  if (/\b(weekly|week trend|week-over-week)\b/i.test(q)) {
    intent = 'weekly_trend'
  } else if (/\b(monthly|month trend|month-over-month)\b/i.test(q)) {
    intent = 'monthly_trend'
  } else if (/\b(elasticity|lead[\s-]*time|advance|window|curve|surge|day-over-day)\b/i.test(q)) {
    intent = 'lead_time'
  } else if (/\b(cheapest|lowest|least expensive|best price|lowest fare|rank|cheaper)\b/i.test(q)) {
    intent = 'cheapest_airline'
  } else if (/\b(compare|all routes|basket|overview|sectors|routes|all)\b/i.test(q)) {
    intent = 'route_comparison'
  } else if (/\b(flights?|departures?|available|schedule|tickets?)\b/i.test(q)) {
    intent = 'flight_list'
  } else if (carrier) {
    intent = 'carrier_intel'
  } else if (route) {
    intent = 'cheapest_airline'
  }

  return {
    route,
    origin,
    destination,
    carrier,
    carrierCode,
    advanceWindow,
    intent,
  }
}

export function simulateNLQ(rawQuery: string, portal: string = 'Ixigo'): NLQResponse {
  const query = rawQuery.trim()
  const entities = extractEntities(query)
  const meta: Meta = {
    portal,
    count: 0,
    generated_at: new Date().toISOString(),
  }

  // Security gate rejection
  if (entities.intent === 'security_rejection') {
    return {
      query,
      sql: '-- REJECTED BY SECURITY GATE\n-- Mutation operations (DROP, DELETE, UPDATE, INSERT, ALTER) are strictly prohibited in the read-only sandbox.',
      summary:
        'Security Alert: Your query was blocked by the multi-tier sandbox gate because it contains restricted mutation keywords. Only read-only analytical queries (SELECT) are permitted.',
      columns: ['status', 'violation_type', 'security_policy'],
      table: [
        {
          status: 'BLOCKED',
          violation_type: 'MUTATION_ATTEMPT',
          security_policy: 'MoSPI Sovereign Airfare Sandbox — Zero-Mutation Read-Only Gate',
        },
      ],
      row_count: 0,
      execution_time_ms: 2.1,
      model_used: 'sandbox-security-gate',
      meta: { ...meta, count: 0 },
    }
  }

  const activeRoute = entities.route || 'DEL-BOM'
  const [orig, dest] = activeRoute.split('-')
  const baseFare = getRouteBaseFare(activeRoute)

  switch (entities.intent) {
    case 'cheapest_airline': {
      const sql = `SELECT carrier, carrier_code, ROUND(AVG(total_fare)::numeric, 0) AS avg_fare_inr, MIN(total_fare) AS lowest_fare_inr, COUNT(*) AS flight_count\nFROM flight_quotes\nWHERE route = '${activeRoute}' AND is_sold_out = FALSE AND is_imputed = FALSE\nGROUP BY carrier, carrier_code\nORDER BY avg_fare_inr ASC\nLIMIT 10;`

      const table = [
        {
          carrier: 'Air India Express',
          carrier_code: 'IX',
          avg_fare_inr: Math.round(baseFare * 0.85),
          lowest_fare_inr: Math.round(baseFare * 0.76),
          flight_count: Math.round(baseFare / 110),
        },
        {
          carrier: 'Akasa Air',
          carrier_code: 'QP',
          avg_fare_inr: Math.round(baseFare * 0.90),
          lowest_fare_inr: Math.round(baseFare * 0.80),
          flight_count: Math.round(baseFare / 95),
        },
        {
          carrier: 'SpiceJet',
          carrier_code: 'SG',
          avg_fare_inr: Math.round(baseFare * 0.94),
          lowest_fare_inr: Math.round(baseFare * 0.84),
          flight_count: Math.round(baseFare / 160),
        },
        {
          carrier: 'IndiGo',
          carrier_code: '6E',
          avg_fare_inr: baseFare,
          lowest_fare_inr: Math.round(baseFare * 0.90),
          flight_count: Math.round(baseFare / 38),
        },
        {
          carrier: 'Air India',
          carrier_code: 'AI',
          avg_fare_inr: Math.round(baseFare * 1.25),
          lowest_fare_inr: Math.round(baseFare * 1.08),
          flight_count: Math.round(baseFare / 55),
        },
      ]

      const cheapest = table[0]!
      const indigo = table[3]!
      const savingsPct = Math.round(((indigo.avg_fare_inr - cheapest.avg_fare_inr) / indigo.avg_fare_inr) * 1000) / 10

      const summary = `${cheapest.carrier} is the most economical carrier on ${activeRoute} with an average fare of ₹${cheapest.avg_fare_inr.toLocaleString('en-IN')} (lowest recorded: ₹${cheapest.lowest_fare_inr.toLocaleString('en-IN')}), offering a ${savingsPct}% discount compared to IndiGo.`

      return {
        query,
        sql,
        summary,
        columns: ['carrier', 'carrier_code', 'avg_fare_inr', 'lowest_fare_inr', 'flight_count'],
        table,
        row_count: table.length,
        execution_time_ms: 18.4,
        model_used: 'qwen2.5-coder:1.5b (local on-premise)',
        meta: { ...meta, count: table.length },
      }
    }

    case 'weekly_trend': {
      const sql = `SELECT week_start::date AS week_date, source_portal, ROUND(apix_weekly::numeric, 2) AS apix_index, ROUND(total_fare::numeric, 0) AS weekly_avg_fare_inr\nFROM view_apix_weekly\nWHERE source_portal = '${portal}'\nORDER BY week_start DESC\nLIMIT 6;`

      const table = [
        { week_date: '2026-08-25', source_portal: portal, apix_index: 104.85, weekly_avg_fare_inr: 5820 },
        { week_date: '2026-08-18', source_portal: portal, apix_index: 103.40, weekly_avg_fare_inr: 5740 },
        { week_date: '2026-08-11', source_portal: portal, apix_index: 102.15, weekly_avg_fare_inr: 5670 },
        { week_date: '2026-08-04', source_portal: portal, apix_index: 101.30, weekly_avg_fare_inr: 5620 },
        { week_date: '2026-07-28', source_portal: portal, apix_index: 100.45, weekly_avg_fare_inr: 5580 },
        { week_date: '2026-07-21', source_portal: portal, apix_index: 100.00, weekly_avg_fare_inr: 5550 },
      ]

      const summary = `The weekly APIx for ${portal} reflects an upward trend over the past 6 weeks, climbing from base 100.00 to 104.85 (+4.85%), with the composite basket average fare rising from ₹5,550 to ₹5,820.`

      return {
        query,
        sql,
        summary,
        columns: ['week_date', 'source_portal', 'apix_index', 'weekly_avg_fare_inr'],
        table,
        row_count: table.length,
        execution_time_ms: 22.8,
        model_used: 'qwen2.5-coder:1.5b (local on-premise)',
        meta: { ...meta, count: table.length },
      }
    }

    case 'monthly_trend': {
      const sql = `SELECT month_start::date AS month_date, source_portal, ROUND(apix_monthly::numeric, 2) AS apix_monthly_index, ROUND(total_fare::numeric, 0) AS monthly_avg_fare_inr\nFROM view_apix_monthly\nWHERE source_portal = '${portal}'\nORDER BY month_start DESC\nLIMIT 6;`

      const table = [
        { month_date: '2026-08-01', source_portal: portal, apix_monthly_index: 104.10, monthly_avg_fare_inr: 5780 },
        { month_date: '2026-07-01', source_portal: portal, apix_monthly_index: 101.75, monthly_avg_fare_inr: 5650 },
        { month_date: '2026-06-01', source_portal: portal, apix_monthly_index: 100.00, monthly_avg_fare_inr: 5550 },
      ]

      const summary = `The monthly macro price index on ${portal} stands at 104.10 for August 2026 (+2.31% MoM vs July's 101.75), indicating sustained seasonal price firming across the domestic route basket.`

      return {
        query,
        sql,
        summary,
        columns: ['month_date', 'source_portal', 'apix_monthly_index', 'monthly_avg_fare_inr'],
        table,
        row_count: table.length,
        execution_time_ms: 19.5,
        model_used: 'qwen2.5-coder:1.5b (local on-premise)',
        meta: { ...meta, count: table.length },
      }
    }

    case 'lead_time': {
      const window = entities.advanceWindow || 7
      const sql = `SELECT origin, destination, advance_windows, date, current_index, previous_index, ROUND(percentage_change::numeric, 2) AS percentage_change\nFROM view_route_leadtime_elasticity\nWHERE origin = '${orig || 'DEL'}' AND destination = '${dest || 'BOM'}' AND advance_windows = ${window}\nORDER BY date DESC\nLIMIT 7;`

      const table = [
        { origin: orig || 'DEL', destination: dest || 'BOM', advance_windows: window, date: '2026-08-29', current_index: 106.80, previous_index: 105.40, percentage_change: 1.33 },
        { origin: orig || 'DEL', destination: dest || 'BOM', advance_windows: window, date: '2026-08-28', current_index: 105.40, previous_index: 104.90, percentage_change: 0.48 },
        { origin: orig || 'DEL', destination: dest || 'BOM', advance_windows: window, date: '2026-08-27', current_index: 104.90, previous_index: 105.20, percentage_change: -0.29 },
        { origin: orig || 'DEL', destination: dest || 'BOM', advance_windows: window, date: '2026-08-26', current_index: 105.20, previous_index: 104.10, percentage_change: 1.06 },
        { origin: orig || 'DEL', destination: dest || 'BOM', advance_windows: window, date: '2026-08-25', current_index: 104.10, previous_index: 103.80, percentage_change: 0.29 },
        { origin: orig || 'DEL', destination: dest || 'BOM', advance_windows: window, date: '2026-08-24', current_index: 103.80, previous_index: 103.00, percentage_change: 0.78 },
        { origin: orig || 'DEL', destination: dest || 'BOM', advance_windows: window, date: '2026-08-23', current_index: 103.00, previous_index: 102.40, percentage_change: 0.59 },
      ]

      const summary = `On ${activeRoute} for ${window}-day advance booking (T+${window}), the price index currently measures 106.80 (+1.33% day-over-day), showing heightened short-term booking elasticity.`

      return {
        query,
        sql,
        summary,
        columns: ['origin', 'destination', 'advance_windows', 'date', 'current_index', 'previous_index', 'percentage_change'],
        table,
        row_count: table.length,
        execution_time_ms: 24.1,
        model_used: 'qwen2.5-coder:1.5b (local on-premise)',
        meta: { ...meta, count: table.length },
      }
    }

    case 'flight_list': {
      const sql = `SELECT carrier, flight_number, total_fare, departure::time AS dep_time, arrival::time AS arr_time, stops\nFROM flight_quotes\nWHERE route = '${activeRoute}' AND is_sold_out = FALSE AND is_imputed = FALSE\nORDER BY total_fare ASC\nLIMIT 6;`

      const table = [
        { carrier: 'Air India Express', flight_number: 'IX-1204', total_fare: Math.round(baseFare * 0.76), dep_time: '06:15', arr_time: '08:25', stops: 0 },
        { carrier: 'Akasa Air', flight_number: 'QP-1302', total_fare: Math.round(baseFare * 0.80), dep_time: '14:20', arr_time: '16:30', stops: 0 },
        { carrier: 'SpiceJet', flight_number: 'SG-8114', total_fare: Math.round(baseFare * 0.84), dep_time: '19:40', arr_time: '21:55', stops: 0 },
        { carrier: 'IndiGo', flight_number: '6E-2054', total_fare: Math.round(baseFare * 0.90), dep_time: '07:30', arr_time: '09:45', stops: 0 },
        { carrier: 'IndiGo', flight_number: '6E-5312', total_fare: baseFare, dep_time: '11:15', arr_time: '13:30', stops: 0 },
        { carrier: 'Air India', flight_number: 'AI-2977', total_fare: Math.round(baseFare * 1.08), dep_time: '18:00', arr_time: '20:15', stops: 0 },
      ]

      const minF = table[0]!.total_fare
      const maxF = table[table.length - 1]!.total_fare
      const summary = `Found 6 non-stop flights on ${activeRoute} starting from ₹${minF.toLocaleString('en-IN')} (Air India Express IX-1204 departing at 06:15) up to ₹${maxF.toLocaleString('en-IN')} for Air India.`

      return {
        query,
        sql,
        summary,
        columns: ['carrier', 'flight_number', 'total_fare', 'dep_time', 'arr_time', 'stops'],
        table,
        row_count: table.length,
        execution_time_ms: 16.2,
        model_used: 'qwen2.5-coder:1.5b (local on-premise)',
        meta: { ...meta, count: table.length },
      }
    }

    case 'carrier_intel': {
      const cName = entities.carrier || 'IndiGo'
      const sql = `SELECT route, ROUND(AVG(total_fare)::numeric, 0) AS avg_fare_inr, MIN(total_fare) AS lowest_fare_inr, COUNT(*) AS observations\nFROM flight_quotes\nWHERE carrier = '${cName}' AND is_sold_out = FALSE\nGROUP BY route\nORDER BY avg_fare_inr ASC;`

      const table = [
        { route: 'BLR-HYD', avg_fare_inr: 3450, lowest_fare_inr: 2980, observations: 92 },
        { route: 'BOM-BLR', avg_fare_inr: 4120, lowest_fare_inr: 3650, observations: 110 },
        { route: 'DEL-BOM', avg_fare_inr: 5450, lowest_fare_inr: 4890, observations: 142 },
        { route: 'MAA-DEL', avg_fare_inr: 5890, lowest_fare_inr: 5100, observations: 78 },
        { route: 'DEL-CCU', avg_fare_inr: 6120, lowest_fare_inr: 5350, observations: 84 },
        { route: 'DEL-BLR', avg_fare_inr: 6480, lowest_fare_inr: 5600, observations: 126 },
      ]

      const summary = `${cName} operates across all 6 DGCA representative routes, with its most affordable fares on BLR-HYD (avg ₹3,450) and highest pricing on DEL-BLR (avg ₹6,480).`

      return {
        query,
        sql,
        summary,
        columns: ['route', 'avg_fare_inr', 'lowest_fare_inr', 'observations'],
        table,
        row_count: table.length,
        execution_time_ms: 21.3,
        model_used: 'qwen2.5-coder:1.5b (local on-premise)',
        meta: { ...meta, count: table.length },
      }
    }

    case 'route_comparison':
    default: {
      const sql = `SELECT r.route, r.origin, r.destination, ROUND(AVG(q.total_fare)::numeric, 0) AS avg_fare_inr, ROUND((rw.weight * 100)::numeric, 1) AS traffic_weight_pct\nFROM flight_quotes q\nJOIN route_weights rw ON rw.origin = q.origin AND rw.destination = q.destination\nWHERE q.is_sold_out = FALSE AND q.is_imputed = FALSE\nGROUP BY r.route, r.origin, r.destination, rw.weight\nORDER BY traffic_weight_pct DESC;`

      const table = ROUTES.filter((r) => r.code !== 'ALL').map((r) => {
        const [o, d] = r.code.split('-')
        return {
          route: r.code,
          origin: o,
          destination: d,
          avg_fare_inr: getRouteBaseFare(r.code),
          traffic_weight_pct: r.weight,
        }
      })

      const summary = `Comparison across the 6 DGCA representative city-pairs indicates DEL-BOM carries the highest economic weight (28.0%, avg ₹5,450), while BLR-HYD offers the lowest entry price point (12.0%, avg ₹3,450).`

      return {
        query,
        sql,
        summary,
        columns: ['route', 'origin', 'destination', 'avg_fare_inr', 'traffic_weight_pct'],
        table,
        row_count: table.length,
        execution_time_ms: 25.4,
        model_used: 'qwen2.5-coder:1.5b (local on-premise)',
        meta: { ...meta, count: table.length },
      }
    }
  }
}
