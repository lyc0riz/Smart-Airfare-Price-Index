// Shared computation utilities used by both prototype and build data paths.
// Pure, mode-agnostic helpers only — mock data generators stay in `prototype/`.
export { aggregate, type Point, type Frequency } from '../prototype/apix-data'
export { RANGE_OPTIONS, LEAD_WINDOWS, FREQUENCIES } from '../constants'
export type { RangeKey, LeadWindow } from '../constants'