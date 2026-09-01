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
]