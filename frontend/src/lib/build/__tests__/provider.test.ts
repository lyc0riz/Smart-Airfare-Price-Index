import { describe, it, expect, vi } from 'vitest'
import { HttpResponse, http } from 'msw'
import { server } from '../../../mocks/server'
import { buildProvider } from '../provider'

describe('buildProvider', () => {
  it('fetches the latest index with the requested portal', async () => {
    const result = await buildProvider.getLatestIndex('Ixigo')
    expect(result.meta.portal).toBe('Ixigo')
    expect(result.current_index).toBeGreaterThan(0)
    expect(result.observation_date).toBe('2026-08-31')
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data[0]!.date).toBeTruthy()
  })

  it('fetches weekly index within the limit', async () => {
    const result = await buildProvider.getWeeklyIndex('Ixigo', 5)
    expect(result.data.length).toBe(5)
    expect(result.data[0]!.apix_weekly).toBeGreaterThan(0)
  })

  it('fetches monthly index', async () => {
    const result = await buildProvider.getMonthlyIndex('Ixigo', 3)
    expect(result.data.length).toBe(3)
    expect(result.data[0]!.apix_monthly).toBeGreaterThan(0)
  })

  it('fetches route rows for a date', async () => {
    const result = await buildProvider.getByRoute('2026-08-31', 'Ixigo')
    expect(result.data.length).toBeGreaterThan(0)
    expect(result.data[0]!.origin).toBe('DEL')
  })

  it('fetches the heatmap matrix', async () => {
    const result = await buildProvider.getHeatmap('2026-08-31', 'Ixigo')
    expect(result.data.length).toBeGreaterThan(0)
    expect(result.data[0]!.advance_windows).toBe(1)
  })

  it('fetches elasticity daily series', async () => {
    const result = await buildProvider.getElasticity('DEL-BOM', 7, 'Ixigo', 10)
    expect(result.data.length).toBe(10)
    expect(result.data[0]!.date).toBeTruthy()
  })

  it('fetches airline breakdown', async () => {
    const result = await buildProvider.getAirlines('DEL-BOM', '2026-08-31', 'Ixigo')
    expect(result.data.length).toBeGreaterThan(0)
    expect(result.data[0]!.carrier_code).toBeTruthy()
  })

  it('fetches admin coverage', async () => {
    const result = await buildProvider.getCoverage(3)
    expect(result.data.length).toBe(3)
    expect(result.data[0]!.quotes).toBeGreaterThan(0)
  })

  it('sends the X-API-Key header on every request', async () => {
    let captured: string | null = null
    server.use(
      http.get('*/api/v1/apix/latest', ({ request }) => {
        captured = request.headers.get('X-API-Key')
        return HttpResponse.json({ data: [], meta: { portal: 'Ixigo', count: 0, generated_at: '' }, current_index: 100, observation_date: '2026-08-31' })
      })
    )
    await buildProvider.getLatestIndex('Ixigo')
    expect(captured).not.toBeNull()
  })

  it('encodes query parameters', async () => {
    let rawUrl = ''
    server.use(
      http.get('*/api/v1/apix/elasticity', ({ request }) => {
        rawUrl = request.url
        return HttpResponse.json({ data: [], meta: { portal: 'Ixigo', count: 0, generated_at: '' } })
      })
    )
    await buildProvider.getElasticity('DEL-BOM', 7, 'Ixigo', 15)
    const url = new URL(rawUrl)
    expect(url.searchParams.get('route')).toBe('DEL-BOM')
    expect(url.searchParams.get('window')).toBe('7')
    expect(url.searchParams.get('limit')).toBe('15')
  })

  it('throws an error with the API message on failure', async () => {
    server.use(
      http.get('*/api/v1/apix/latest', () => HttpResponse.json({ message: 'Rate limit exceeded' }, { status: 429 }))
    )
    await expect(buildProvider.getLatestIndex('Ixigo')).rejects.toThrow('Rate limit exceeded')
  })

  it('throws a generic error when the body is not JSON', async () => {
    server.use(
      http.get('*/api/v1/apix/latest', () => new HttpResponse(null, { status: 500 }))
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(buildProvider.getLatestIndex('Ixigo')).rejects.toThrow('Unknown error')
    spy.mockRestore()
  })
})