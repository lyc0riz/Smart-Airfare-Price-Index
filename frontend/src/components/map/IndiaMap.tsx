import { useState } from 'react'
import { CITIES, MAP_WIDTH, MAP_HEIGHT } from '../../lib/constants'
import {
  project,
  outlinePath,
  curvedRoutePath,
  routeStrokeWidth,
  routeDasharray,
  INDIA_LAKSHADWEEP_DOTS,
} from '../../lib/map/geo'
import { formatTraffic } from '../../lib/prototype/route-intel'
import { pct } from '../../lib/utils'
import { MapTooltip, type TooltipData } from './MapTooltip'
import type { RouteIntel } from '../../lib/prototype/route-intel'

export function IndiaMap({
  intel,
  selectedRoute,
  onSelectRoute,
}: {
  intel: RouteIntel[]
  selectedRoute: string | null
  onSelectRoute: (code: string | null) => void
}) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState<string | null>(null)

  const maxTraffic = Math.max(...intel.map((r) => r.traffic), 1)
  const filterActive = selectedRoute !== null

  const routes = intel
    .filter((r) => r.code !== 'ALL')
    .map((r) => {
      const o = CITIES.find((c) => c.code === r.origin)
      const d = CITIES.find((c) => c.code === r.destination)
      if (!o || !d) return null
      return { key: r.code, a: project(o.lon, o.lat), b: project(d.lon, d.lat), r }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className="w-full h-auto select-none"
      role="img"
      aria-label="India domestic route map"
      onMouseLeave={() => { setTooltip(null); setHovered(null) }}
    >
      <path
        d={outlinePath()}
        fill="hsl(var(--map-land))"
        stroke="hsl(var(--map-land-stroke))"
        strokeWidth="1.2"
        data-testid="india-outline"
      />

      {/* Lakshadweep union territory — marker dots (true scale is sub-pixel) */}
      <g data-testid="india-lakshadweep">
        {INDIA_LAKSHADWEEP_DOTS.map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={1.6}
            fill="hsl(var(--map-land-stroke))"
            stroke="hsl(var(--map-land-stroke))"
            strokeWidth="0.4"
          />
        ))}
      </g>

      {/* Routes */}
      <g>
        {routes.map(({ key, a, b, r }) => {
          const dimmed = filterActive && key !== selectedRoute
          const isHovered = hovered === key
          return (
            <path
              key={key}
              d={curvedRoutePath(a, b)}
              data-route={key}
              fill="none"
              stroke={r.change < 0 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'}
              strokeWidth={dimmed ? 0.8 : isHovered ? routeStrokeWidth(r.change) + 1.5 : routeStrokeWidth(r.change)}
              opacity={dimmed ? 0.12 : isHovered ? 0.95 : 0.55}
              strokeDasharray={dimmed ? undefined : routeDasharray(r.change)}
              strokeLinecap="round"
              className="cursor-pointer transition-opacity"
              onMouseEnter={() => {
                setHovered(key)
                setTooltipPos({ x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 10 })
                setTooltip({
                  kind: 'route',
                  title: `${r.route}`,
                  negative: r.change < 0,
                  rows: [
                    { label: 'APIx', value: r.index.toFixed(1) },
                    { label: 'Change', value: pct(r.change) },
                    { label: 'Traffic', value: formatTraffic(r.traffic) },
                  ],
                })
              }}
              onClick={() => onSelectRoute(key === selectedRoute ? null : key)}
            />
          )
        })}
      </g>

      {/* Cities */}
      <g>
        {CITIES.map((city) => {
          const p = project(city.lon, city.lat)
          const traffic = intel
            .filter((r) => r.origin === city.code || r.destination === city.code)
            .reduce((s, r) => s + (r.traffic || 0), 0)
          const radius = 3 + (traffic / maxTraffic) * 6
          return (
            <g key={city.code} className="cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r={radius}
                fill="hsl(var(--saffron))"
                stroke="hsl(var(--card))"
                strokeWidth="1.5"
                onMouseEnter={() => {
                  setTooltipPos({ x: p.x, y: p.y - radius - 6 })
                  setTooltip({
                    kind: 'city',
                    title: `${city.name} (${city.code})`,
                    rows: [{ label: 'Total traffic', value: formatTraffic(traffic) }],
                  })
                }}
              />
              <text
                x={p.x}
                y={p.y - radius - 3}
                textAnchor="middle"
                fontSize="9"
                fill="hsl(var(--foreground))"
                style={{ pointerEvents: 'none' }}
              >
                {city.code}
              </text>
            </g>
          )
        })}
      </g>

      {tooltip && <MapTooltip x={tooltipPos.x} y={tooltipPos.y} data={tooltip} />}
    </svg>
  )
}
