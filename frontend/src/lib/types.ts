import type { RouteIntel } from './prototype/route-intel'
import type { BacktestResult } from './prototype/backtest'

export interface Meta {
  portal: string
  count: number
  generated_at: string
}

export interface LatestIndexRow {
  date: string
  index_value: number
  route_weight: number
  advance_window_weight: number
}

export interface LatestIndexResponse {
  data: LatestIndexRow[]
  current_index: number
  observation_date: string
  meta: Meta
}

export interface WeeklyIndexRow {
  week_start: string
  source_portal: string
  apix_weekly: number
  total_fare: number
  total_base_fare: number
  total_base_period_fare: number
}

export interface WeeklyIndexResponse {
  data: WeeklyIndexRow[]
  meta: Meta
}

export interface MonthlyIndexRow {
  month_start: string
  source_portal: string
  apix_monthly: number
  total_fare: number
  total_base_fare: number
  total_base_period_fare: number
}

export interface MonthlyIndexResponse {
  data: MonthlyIndexRow[]
  meta: Meta
}

export interface ByRouteRow {
  origin: string
  destination: string
  index_value: number
  route_weight: number
  fare: number
  base_period_fare: number
}

export interface ByRouteResponse {
  data: ByRouteRow[]
  meta: Meta
}

export interface HeatmapRow {
  origin: string
  destination: string
  advance_windows: number
  index_value: number
}

export interface HeatmapResponse {
  data: HeatmapRow[]
  meta: Meta
}

export interface ElasticityRow {
  origin: string
  destination: string
  advance_windows: number
  date: string
  current_index: number
  previous_index: number
  percentage_change: number | null
}

export interface ElasticityResponse {
  data: ElasticityRow[]
  meta: Meta
}

export interface AirlineRow {
  carrier: string
  carrier_code: string
  total_fare: number
}

export interface AirlinesResponse {
  data: AirlineRow[]
  meta: Meta
}

export interface CoverageRow {
  journey_date: string
  source_portal: string
  quotes: number
  imputed: number
  imputed_pct: number
}

export interface CoverageResponse {
  data: CoverageRow[]
  meta: Meta
}

export interface RouteMeta {
  code: string
  origin: string
  destination: string
  label: string
  weight_pct: number
}

export interface AirlineMeta {
  code: string
  label: string
}

export interface ConstantsResponse {
  data: {
    routes: RouteMeta[]
    airlines: AirlineMeta[]
    portals: string[]
    lead_windows: number[]
    latest_date: string | null
    first_date: string | null
    base_period_label: string
    history_days: number
  }
  meta: Meta
}

export interface SeriesPoint {
  date: string
  index_value: number
}

export interface SeriesResponse {
  data: SeriesPoint[]
  meta: Meta
  available_days: number
  requested_days: number
}

export interface LeadtimeStat {
  advance_windows: number
  avg_fare: number
  p50_fare: number
  min_fare: number
  max_fare: number
  observations: number
}

export interface LeadtimeResponse {
  data: LeadtimeStat[]
  meta: Meta
}

export interface DataResponse<T> {
  data: T
  meta: Meta
  warning?: string
  available_depth?: number
}

export interface RouteTableRow {
  route: string
  index: number
  change: number
  avgFare: number
  weight: number
  observations: number
}

export interface LeadTimeData {
  curve: { days: number; avgFare: number }[]
  stats: {
    window: number
    label: string
    avgFare: number
    medianFare: number
    observations: number
    routes: number
    changeFromBase: number
  }[]
  airlines: { code: string; label: string; fares: number[]; spread: number }[]
}

export interface DataProvider {
  getLatestIndex(portal: string): Promise<LatestIndexResponse>
  getWeeklyIndex(portal: string, limit: number): Promise<WeeklyIndexResponse>
  getMonthlyIndex(portal: string, limit: number): Promise<MonthlyIndexResponse>
  getByRoute(date: string, portal: string): Promise<ByRouteResponse>
  getHeatmap(date: string, portal: string): Promise<HeatmapResponse>
  getElasticity(route: string, window: number, portal: string, limit: number): Promise<ElasticityResponse>
  getAirlines(route: string, date: string, portal: string): Promise<AirlinesResponse>
  getCoverage(limit: number): Promise<CoverageResponse>
  getConstants(): Promise<ConstantsResponse>
  getDailySeries(
    routeCode: string,
    airlineCode: string,
    days: number
  ): Promise<DataResponse<SeriesPoint[]>>
  getWeeklySeries(
    routeCode: string,
    airlineCode: string,
    limit: number
  ): Promise<DataResponse<SeriesPoint[]>>
  getMonthlySeries(
    routeCode: string,
    airlineCode: string,
    limit: number
  ): Promise<DataResponse<SeriesPoint[]>>
  getRouteTable(airlineCode: string): Promise<DataResponse<RouteTableRow[]>>
  getRouteIntel(airlineCode: string): Promise<DataResponse<RouteIntel[]>>
  getLeadTimeData(
    routeCode: string,
    airlineCode: string
  ): Promise<DataResponse<LeadTimeData>>
  getBacktestData(
    start: string,
    end: string,
    airlineCode: string
  ): Promise<DataResponse<BacktestResult>>
}

export type {
  Point,
  RouteRow,
} from './prototype/apix-data'
export type {
  RouteIntel,
  City,
} from './prototype/route-intel'
export type {
  LeadWindow,
  WindowStat,
  RouteLeadRow,
} from './prototype/leadtime'
export type {
  BacktestDay,
  ContributionRow,
  BacktestResult,
} from './prototype/backtest'