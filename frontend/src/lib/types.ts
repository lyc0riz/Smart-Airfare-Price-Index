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

export interface DataProvider {
  getLatestIndex(portal: string): Promise<LatestIndexResponse>
  getWeeklyIndex(portal: string, limit: number): Promise<WeeklyIndexResponse>
  getMonthlyIndex(portal: string, limit: number): Promise<MonthlyIndexResponse>
  getByRoute(date: string, portal: string): Promise<ByRouteResponse>
  getHeatmap(date: string, portal: string): Promise<HeatmapResponse>
  getElasticity(route: string, window: number, portal: string, limit: number): Promise<ElasticityResponse>
  getAirlines(route: string, date: string, portal: string): Promise<AirlinesResponse>
  getCoverage(limit: number): Promise<CoverageResponse>
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