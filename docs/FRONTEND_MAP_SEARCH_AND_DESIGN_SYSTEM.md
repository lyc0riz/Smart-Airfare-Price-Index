# Frontend Map Engine, Smart Search & Design System

This document specifies the mathematics and algorithms powering the cartography engine, smart search parser, and design system of **FlyIndex India**.

---

## 1. Cartography & Vector Map Engine (`src/lib/map/geo.ts`, `IndiaMap.tsx`)

The domestic route network is rendered as a clean, performant SVG vector map using the **official Survey of India claimed boundary**.

```
                           MAP PROJECTION ARCHITECTURE
┌─────────────────────────────────────────────────────────────────────────────┐
│  Geographic Coordinates (lon, lat)                                          │
│  Bounds: LON [67.5° E, 98.0° E] │ LAT [6.0° N, 37.5° N]                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Linear Equirectangular Transform
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SVG Canvas Coordinates (x, y)                                              │
│  ViewBox: 0 0 620 660 (px)                                                  │
│                                                                             │
│  x = ((lon - 67.5) / (98.0 - 67.5)) * 620                                   │
│  y = 660 - ((lat - 6.0) / (37.5 - 6.0)) * 660                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Projection Mathematics
The `project(lon, lat)` function maps geographical longitude and latitude directly into SVG viewBox units:

$$\begin{aligned}
x &= \frac{\text{lon} - \text{LON\_MIN}}{\text{LON\_MAX} - \text{LON\_MIN}} \times \text{MAP\_WIDTH} \\
y &= \text{MAP\_HEIGHT} - \left(\frac{\text{lat} - \text{LAT\_MIN}}{\text{LAT\_MAX} - \text{LAT\_MIN}} \times \text{MAP\_HEIGHT}\right)
\end{aligned}$$

With constants:
* $\text{LON\_MIN} = 67.5^\circ\text{E}, \quad \text{LON\_MAX} = 98.0^\circ\text{E} \quad (\Delta\text{lon} = 30.5^\circ)$
* $\text{LAT\_MIN} = 6.0^\circ\text{N}, \quad \text{LAT\_MAX} = 37.5^\circ\text{N} \quad (\Delta\text{lat} = 31.5^\circ)$
* $\text{MAP\_WIDTH} = 620\text{px}, \quad \text{MAP\_HEIGHT} = 660\text{px}$

Scale ratio: $x\text{-scale} \approx 20.33\text{ px/deg}$, $y\text{-scale} \approx 20.95\text{ px/deg}$ (nearly equal $1:1$ aspect ratio, minimizing visual distortion).

### Official Survey of India Boundary (`INDIA_REGIONS`)
Extracted from DataMeet's authoritative `india-composite` shapefile (CC-0) and Ramer-Douglas-Peucker (RDP) simplified in pixel space ($\epsilon = 1.6\text{px}$):
* **Mainland Polygon**: 1 continuous polygon including the official claimed northern boundary (Aksai Chin and Shaksgam Valley up to $\text{lat } 37.1^\circ\text{N}$).
* **Andaman & Nicobar Archipelago**: 9 distinct true-scale polygon regions rendering the island chain in the Bay of Bengal.
* **Compound SVG Path**: Generated via `outlinePath()`, combining all regions into a single compound path (`M...Z M...Z`) rendered via a single `<path data-testid="india-outline" />`.

### Lakshadweep Sub-Pixel Marker Dots (`INDIA_LAKSHADWEEP_DOTS`)
Because genuine Lakshadweep atolls are smaller than $0.1\text{px}^2$ at national scale, true-scale polygons would be invisible. The engine emits 14 centroid coordinates rendered as distinct vector dots ($r = 1.6\text{px}$), fulfilling Indian cartographic standards.

### Curved Route Arcs (`curvedRoutePath`)
Route lines between city pairs $A(x_a, y_a)$ and $B(x_b, y_b)$ are rendered as **quadratic Bezier curves** that bow northward for visual clarity:

$$\text{mid}_x = \frac{x_a + x_b}{2}, \quad \text{mid}_y = \frac{y_a + y_b}{2} - 32\text{px}$$

$$\text{SVG Path: } M\,x_a\,y_a \;\; Q\,\text{mid}_x\,\text{mid}_y \;\; x_b\,y_b$$

### Dynamic Route Styling
* **Stroke Width**: Scaled proportionally with price change magnitude:
  $$\text{width} = \min\left(6.0, \; \max\left(1.5, \; \frac{|\Delta\%|}{1.5}\right)\right)$$
* **Dashed Stroke**: Routes with falling fares ($\Delta < 0$) render with `strokeDasharray="6 4"`.
* **Dimming on Selection**: When a specific route is selected, non-selected routes drop to `opacity = 0.12` and stroke width $0.8\text{px}$.

---

## 2. Smart Route Search Engine (`routeSearchUtils.ts`, `RouteSearchInput.tsx`)

The smart search engine provides flexible fuzzy matching across city names, airport codes, and directional flight pairs:

```
                            SMART SEARCH PARSER
┌─────────────────────────────────────────────────────────────────────────────┐
│  User Input: "Delhi to Mumbai" | "DEL BOM" | "Bangalore" | "BOM-BLR"        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Lexical Tokenization & Normalization
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. Directional Split Parser                                                │
│     Matches: "X to Y", "X-Y", "X–Y", "X Y"                                  │
│     Resolves: originCodes = ["DEL"], destCodes = ["BOM"]                    │
│     Filters: returns DEL–BOM (and reverse BOM–DEL)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  2. Alias & IATA Resolver (CITY_TO_IATA)                                    │
│     "mumbai" $\to$ ["BOM"], "bangalore" / "bengaluru" $\to$ ["BLR"]         │
│     "del" $\to$ ["DEL"], "goa" $\to$ ["GOI", "GOX"]                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  3. Substring & City Name Matcher                                           │
│     Matches origin or destination city name against query string            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Supported Query Formats

| Search Input | Resolution | Matched Routes |
|---|---|---|
| `DEL to BOM` | Directional IATA | `DEL–BOM` |
| `Delhi to Mumbai` | Directional City Name | `DEL–BOM` |
| `Mumbai Delhi` | Space-separated pair | `DEL–BOM`, `BOM–DEL` |
| `Bengaluru` / `Bangalore` | City Alias | All routes involving `BLR` (`DEL–BLR`, `BOM–BLR`, `BLR–HYD`, `BLR–CCU`) |
| `DEL-BLR` | Hyphenated IATA | `DEL–BLR` |
| `bom` | Case-insensitive IATA | All routes involving `BOM` (`DEL–BOM`, `BOM–BLR`, `BOM–DEL`, `BOM–GOI`) |

---

## 3. Design System & Theme Tokens (`src/index.css`)

The design system employs a **semantic HSL color model** tailored for official government publications.

### Color Tokens

| CSS Variable | Light Mode Value | Dark Mode Value | Semantic Role |
|---|---|---|---|
| `--background` | `0 0% 100%` (Pure White) | `222.2 84% 4.9%` (Deep Slate) | Page background |
| `--foreground` | `222.2 84% 4.9%` (Near Black) | `210 40% 98%` (Off White) | Primary text |
| `--primary` | `210 100% 25%` (MoSPI Navy) | `210 100% 45%` (Vibrant Blue) | Primary branding, buttons, active routes |
| `--saffron` | `32 95% 50%` (National Saffron) | `32 95% 50%` (National Saffron) | Secondary indicator, highlights, city dots |
| `--navy` | `210 100% 15%` (Deep Navy) | `210 100% 15%` | Institutional badges |
| `--map-land` | `214 32% 93%` (Soft Gray-Blue) | `217 33% 13%` (Dark Slate) | India landmass vector fill |
| `--map-land-stroke` | `215 20% 74%` (Mid Gray) | `216 24% 32%` (Muted Slate) | India boundary vector stroke |
| `--card` | `0 0% 100%` | `222.2 84% 4.9%` | Card background container |
| `--border` | `214.3 31.8% 91.4%` | `217.2 32.6% 17.5%` | Subtle container borders |
| `--destructive` | `0 84.2% 60.2%` (Red) | `0 62.8% 30.6%` (Deep Red) | Negative fare movements, errors |

### Typography & Tabular Figures
* **Primary Sans-Serif (`Inter`)**: Used for labels, interactive controls, tooltips, and data cells.
* **Serif (`Merriweather`)**: Used for page headings and current APIx index values (`font-serif font-bold`).
* **Tabular Lining Figures**: Forced via `tabular-nums` CSS utility on all numbers to ensure strict column alignment in data tables and tickers.
