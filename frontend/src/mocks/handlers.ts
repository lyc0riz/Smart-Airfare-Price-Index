import { HttpResponse, http } from 'msw'
import type { Meta } from '../lib/types'

export const route = (p: string) => `*/api/v1${p}`

const meta = (portal: string, count: number): Meta => ({
  portal,
  count,
  generated_at: new Date().toISOString(),
})

export const handlers = [
  http.get(route('/health'), () => {
    return HttpResponse.json({ status: 'ok', database: 'connected' })
  }),

  http.get(route('/apix/latest'), ({ request }) => {
    const portal = new URL(request.url).searchParams.get('portal') || 'Ixigo'
    const data = [
      { date: '2026-08-17', index_value: 132.1, route_weight: 0.051, advance_window_weight: 0.2 },
      { date: '2026-08-24', index_value: 135.74, route_weight: 0.051, advance_window_weight: 0.2 },
      { date: '2026-08-31', index_value: 137.42, route_weight: 0.051, advance_window_weight: 0.2 },
    ]
    return HttpResponse.json({
      data,
      meta: meta(portal, data.length),
      current_index: 137.42,
      observation_date: '2026-08-31',
    })
  }),

  http.get(route('/apix/weekly'), ({ request }) => {
    const url = new URL(request.url)
    const portal = url.searchParams.get('portal') || 'Ixigo'
    const limit = Number(url.searchParams.get('limit') || 52)
    const data = Array.from({ length: Math.min(limit, 52) }, (_, i) => ({
      week_start: `2026-0${(i % 9) + 1}-0${(i % 7) + 1}`,
      source_portal: portal,
      apix_weekly: 130 + i * 0.4,
      total_fare: 4200 + i * 12,
      total_base_fare: 3600 + i * 10,
      total_base_period_fare: 3500,
    }))
    return HttpResponse.json({ data, meta: meta(portal, data.length) })
  }),

  http.get(route('/apix/monthly'), ({ request }) => {
    const url = new URL(request.url)
    const portal = url.searchParams.get('portal') || 'Ixigo'
    const limit = Number(url.searchParams.get('limit') || 24)
    const data = Array.from({ length: Math.min(limit, 24) }, (_, i) => ({
      month_start: `2026-${String(12 - i).padStart(2, '0')}-01`,
      source_portal: portal,
      apix_monthly: 120 + i * 1.1,
      total_fare: 4100 + i * 30,
      total_base_fare: 3550 + i * 20,
      total_base_period_fare: 3500,
    }))
    return HttpResponse.json({ data, meta: meta(portal, data.length) })
  }),

  http.get(route('/apix/by-route'), ({ request }) => {
    const url = new URL(request.url)
    const portal = url.searchParams.get('portal') || 'Ixigo'
    const data = [
      { origin: 'DEL', destination: 'BOM', index_value: 141.2, route_weight: 11.2, fare: 5240, base_period_fare: 3710 },
      { origin: 'DEL', destination: 'BLR', index_value: 133.8, route_weight: 9.8, fare: 4870, base_period_fare: 3640 },
    ]
    return HttpResponse.json({ data, meta: meta(portal, data.length) })
  }),

  http.get(route('/apix/heatmap'), ({ request }) => {
    const url = new URL(request.url)
    const portal = url.searchParams.get('portal') || 'Ixigo'
    const cells = [1, 7, 15, 30, 45].flatMap((w) =>
      ['DEL-BOM', 'DEL-BLR'].map((r) => {
        const [origin, destination] = r.split('-')
        return { origin, destination, advance_windows: w, index_value: 125 + w * 0.5 }
      }),
    )
    return HttpResponse.json({ data: cells, meta: meta(portal, cells.length) })
  }),

  http.get(route('/apix/elasticity'), ({ request }) => {
    const url = new URL(request.url)
    const portal = url.searchParams.get('portal') || 'Ixigo'
    const limit = Number(url.searchParams.get('limit') || 30)
    const data = Array.from({ length: Math.min(limit, 90) }, (_, i) => ({
      origin: 'DEL',
      destination: 'BOM',
      advance_windows: 7,
      date: `2026-08-${String(31 - i).padStart(2, '0')}`,
      current_index: 130 + (i % 3),
      previous_index: 130 + ((i + 1) % 3),
      percentage_change: (i % 3) - 1,
    }))
    return HttpResponse.json({ data, meta: meta(portal, data.length) })
  }),

  http.get(route('/apix/airlines'), ({ request }) => {
    const url = new URL(request.url)
    const portal = url.searchParams.get('portal') || 'Ixigo'
    const data = [
      { carrier: 'IndiGo', carrier_code: '6E', total_fare: 4980 },
      { carrier: 'Air India', carrier_code: 'UK', total_fare: 5610 },
    ]
    return HttpResponse.json({ data, meta: meta(portal, data.length) })
  }),

  http.get(route('/admin/coverage'), ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get('limit') || 14)
    const days = Array.from({ length: Math.max(limit, 0) }, (_, i) => ({
      journey_date: `2026-08-${String(31 - i).padStart(2, '0')}`,
      source_portal: 'Ixigo',
      quotes: 620,
      imputed: 4,
      imputed_pct: 0.6,
    }))
    return HttpResponse.json({ data: days, meta: meta('Ixigo', days.length) })
  }),

  http.get(route('/apix/series'), ({ request }) => {
    const url = new URL(request.url)
    const days = Number(url.searchParams.get('days') || 60)
    const portal = url.searchParams.get('portal') || 'Ixigo'
    const data = Array.from({ length: Math.min(days, 60) }, (_, i) => ({
      date: `2026-08-${String(Math.max(1, 31 - i)).padStart(2, '0')}`,
      index_value: 105 + i * 0.2,
    }))
    return HttpResponse.json({
      data,
      meta: meta(portal, data.length),
      available_days: data.length,
      requested_days: days,
    })
  }),

  http.get(route('/apix/leadtime'), ({ request }) => {
    const url = new URL(request.url)
    const portal = url.searchParams.get('portal') || 'Ixigo'
    const data = [1, 7, 15, 30, 45].map((w) => ({
      advance_windows: w,
      avg_fare: 4500 + (45 - w) * 40,
      p50_fare: 4400 + (45 - w) * 38,
      min_fare: 3500,
      max_fare: 7000,
      observations: 120,
    }))
    return HttpResponse.json({ data, meta: meta(portal, data.length) })
  }),

  http.get(route('/admin/metadata'), () => {
    return HttpResponse.json({
      data: {
        routes: [
          { code: 'ALL', origin: '', destination: '', label: 'All India', weight_pct: 100 },
          { code: 'DEL-BOM', origin: 'DEL', destination: 'BOM', label: 'DEL–BOM (Delhi–Mumbai)', weight_pct: 18.4 },
          { code: 'DEL-BLR', origin: 'DEL', destination: 'BLR', label: 'DEL–BLR (Delhi–Bengaluru)', weight_pct: 15.7 },
        ],
        airlines: [
          { code: 'ALL', label: 'All Airlines' },
          { code: '6E', label: 'IndiGo' },
          { code: 'AI', label: 'Air India' },
        ],
        portals: ['Ixigo', 'Google Flights'],
        lead_windows: [1, 7, 15, 30, 45],
        latest_date: '2026-08-31',
        first_date: '2026-08-01',
        base_period_label: 'January 2024 (monthly average)',
        history_days: 31,
      },
      meta: meta('API', 1),
    })
  }),
]