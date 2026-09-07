import { useEffect, useState } from 'react'
import { useDataProvider } from '../hooks/useDataProvider'
import type { RouteMeta, AirlineMeta } from '../lib/types'
import { ROUTES as STATIC_ROUTES, AIRLINES as STATIC_AIRLINES } from '../lib/constants'

const DEFAULT_ROUTES: RouteMeta[] = STATIC_ROUTES.map((r) => ({
  code: r.code,
  origin: r.code.split('-')[0] || '',
  destination: r.code.split('-')[1] || '',
  label: r.label,
  weight_pct: r.weight,
}))

export function useMetadata() {
  const { provider } = useDataProvider()
  const [routes, setRoutes] = useState<RouteMeta[]>(DEFAULT_ROUTES)
  const [airlines, setAirlines] = useState<AirlineMeta[]>([...STATIC_AIRLINES] as AirlineMeta[])
  const [latestDate, setLatestDate] = useState<string>('2026-08-29')
  const [basePeriodLabel, setBasePeriodLabel] = useState<string>('January 2024 (monthly average)')
  const [historyDays, setHistoryDays] = useState<number>(365)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    provider.getConstants().then((res) => {
      if (cancelled) return
      if (res.data.routes?.length) setRoutes(res.data.routes)
      if (res.data.airlines?.length) setAirlines(res.data.airlines)
      if (res.data.latest_date) setLatestDate(res.data.latest_date)
      if (res.data.base_period_label) setBasePeriodLabel(res.data.base_period_label)
      if (res.data.history_days) setHistoryDays(res.data.history_days)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [provider])

  return { routes, airlines, latestDate, basePeriodLabel, historyDays, loading }
}
