export const ROUTES = [
  { code: 'ALL', label: 'All India', weight: 100, base: 108.42 },
  { code: 'DEL-BOM', label: 'DEL–BOM (Delhi–Mumbai)', weight: 18.4, base: 112.4 },
  { code: 'DEL-BLR', label: 'DEL–BLR (Delhi–Bengaluru)', weight: 15.7, base: 107.8 },
  { code: 'BOM-BLR', label: 'BOM–BLR (Mumbai–Bengaluru)', weight: 11.3, base: 103.2 },
  { code: 'DEL-CCU', label: 'DEL–CCU (Delhi–Kolkata)', weight: 8.9, base: 109.6 },
  { code: 'BOM-DEL', label: 'BOM–DEL (Mumbai–Delhi)', weight: 8.2, base: 111.1 },
  { code: 'BLR-HYD', label: 'BLR–HYD (Bengaluru–Hyderabad)', weight: 6.4, base: 99.4 },
  { code: 'DEL-HYD', label: 'DEL–HYD (Delhi–Hyderabad)', weight: 5.8, base: 105.3 },
  { code: 'MAA-DEL', label: 'MAA–DEL (Chennai–Delhi)', weight: 5.1, base: 106.7 },
  { code: 'BOM-GOI', label: 'BOM–GOI (Mumbai–Goa)', weight: 4.6, base: 96.8 },
  { code: 'DEL-PNQ', label: 'DEL–PNQ (Delhi–Pune)', weight: 4.2, base: 104.1 },
  { code: 'BLR-CCU', label: 'BLR–CCU (Bengaluru–Kolkata)', weight: 3.7, base: 101.9 },
  { code: 'AMD-DEL', label: 'AMD–DEL (Ahmedabad–Delhi)', weight: 3.4, base: 98.2 },
] as const

export type RouteCode = (typeof ROUTES)[number]['code']

export const AIRLINES = [
  { code: 'ALL', label: 'All Airlines', factor: 1 },
  { code: '6E', label: 'IndiGo', factor: 0.985 },
  { code: 'AI', label: 'Air India', factor: 1.024 },
  { code: 'IX', label: 'Air India Express', factor: 0.958 },
  { code: 'UK', label: 'Vistara', factor: 1.041 },
  { code: 'SG', label: 'SpiceJet', factor: 0.972 },
  { code: 'QP', label: 'Akasa Air', factor: 0.993 },
] as const

export type AirlineCode = (typeof AIRLINES)[number]['code']

export const PORTALS = ['Ixigo', 'Google Flights'] as const
export type Portal = (typeof PORTALS)[number]

export const LEAD_WINDOWS = [1, 7, 15, 30, 45] as const
export type LeadWindow = (typeof LEAD_WINDOWS)[number]

export const RANGE_OPTIONS = [
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: '3m', label: '3 Months', days: 91 },
  { key: '6m', label: '6 Months', days: 182 },
  { key: '1y', label: '1 Year', days: 365 },
] as const

export type RangeKey = (typeof RANGE_OPTIONS)[number]['key']

export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const CITIES = [
  { code: 'DEL', name: 'Delhi', lat: 28.61, lon: 77.21 },
  { code: 'BOM', name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { code: 'BLR', name: 'Bengaluru', lat: 12.97, lon: 77.59 },
  { code: 'CCU', name: 'Kolkata', lat: 22.57, lon: 88.36 },
  { code: 'HYD', name: 'Hyderabad', lat: 17.39, lon: 78.49 },
  { code: 'MAA', name: 'Chennai', lat: 13.08, lon: 80.27 },
  { code: 'GOI', name: 'Goa', lat: 15.38, lon: 73.83 },
  { code: 'PNQ', name: 'Pune', lat: 18.52, lon: 73.86 },
  { code: 'AMD', name: 'Ahmedabad', lat: 23.02, lon: 72.57 },
] as const

export const TOTAL_TRAFFIC = 152_400_000

export const MAP_WIDTH = 620
export const MAP_HEIGHT = 660
export const LON_MIN = 67.5
export const LON_MAX = 98.0
export const LAT_MIN = 6.0
export const LAT_MAX = 37.5

export const BASE_PERIOD = 'January 2024 (monthly average)'
export const LATEST_DATE = '2026-08-29'
export const BACKTEST_DURATION_DAYS = 30
export const BASE_INDEX = 100

export const AVAILABLE_PERIODS = [
  { start: '2026-07-31', end: '2026-08-29', label: '31 Jul 2026 – 29 Aug 2026' },
  { start: '2026-06-30', end: '2026-07-29', label: '30 Jun 2026 – 29 Jul 2026' },
  { start: '2026-05-31', end: '2026-06-29', label: '31 May 2026 – 29 Jun 2026' },
  { start: '2026-04-30', end: '2026-05-29', label: '30 Apr 2026 – 29 May 2026' },
] as const