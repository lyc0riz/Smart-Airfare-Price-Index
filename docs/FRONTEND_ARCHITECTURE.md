# Frontend Architecture & Technical Design

This document details the software architecture, state lifecycle, component hierarchy, and data layer of the React 18 frontend dashboard (**FlyIndex India** / **APIx**).

---

## 1. Architectural Principles

1. **Dual-Mode Operation**: Seamless switching between offline simulated data (`prototype` mode) and live Supabase PostgreSQL API (`build` mode) without modifying page logic.
2. **Deterministic Fallbacks**: Every live API method degrades gracefully to local computation on network or server failure.
3. **Institutional UI Design**: Built according to Government of India (MoSPI) / RBI economic research guidelines with high accessibility, tabular lining figures, and responsive layouts.
4. **Strict Type Safety**: End-to-end TypeScript interfaces matching FastAPI response models.
5. **Zero Lint Warnings & High Coverage**: Strictly enforced ESLint (0 warnings allowed) and Vitest coverage thresholds ($>70\%$).

---

## 2. Directory Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── charts/        # Recharts wrappers (LineChart, BarChart, Heatmap, ComposedChart)
│   │   ├── data/          # Data UX primitives (LimitedHistoryBanner, loading states)
│   │   ├── layout/        # Header, Footer, navigation, skip links
│   │   ├── map/           # IndiaMap (Survey of India SVG vector map), MapTooltip
│   │   ├── mode-toggle/   # Prototype vs Live API mode switcher
│   │   ├── search/        # RouteSearchInput & fuzzy routeSearchUtils parser
│   │   └── ui/            # Design system primitives (Card, Table, Select, Button, Modal, Tabs)
│   ├── hooks/             # Custom React hooks (useDataProvider, useMetadata, useTheme)
│   ├── lib/
│   │   ├── build/         # buildProvider (Live REST client with TTL cache & fallbacks)
│   │   ├── computations/  # Pure mode-agnostic mathematical algorithms (aggregation, filters)
│   │   ├── map/           # geo.ts (Survey of India equirectangular projection & compound paths)
│   │   ├── prototype/     # prototypeProvider (Deterministic simulated data engine)
│   │   ├── constants.ts   # Baseline geographic, route, and time constants
│   │   ├── types.ts       # Canonical TypeScript models and DataProvider interface
│   │   └── utils.ts       # Formatting utilities (INR currency, dates, percentages, clsx)
│   ├── mocks/             # Mock Service Worker (MSW) network interception handlers
│   ├── pages/             # 10 dashboard pages
│   ├── test/              # Vitest setup, observer mocks, renderWithProviders helper
│   ├── App.tsx            # Root router, query client, and mode/theme providers
│   ├── index.css          # Tailwind directives, CSS variables (light/dark theme tokens)
│   └── main.tsx           # React DOM root mounting
├── vite.config.ts         # Vite bundler configuration, path aliases, proxy rules
├── tsconfig.json          # TypeScript compiler configuration (strict mode)
└── package.json           # Scripts and dependencies
```

---

## 3. State Management & Hooks Architecture

The dashboard avoids heavy external state libraries (Redux/Zustand) in favor of React Context for global state and localized hooks for data lifecycles:

```
┌─────────────────────────────────────────────────────────────┐
│                       QueryClientProvider                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    ModeProvider                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │                 ThemeProvider                   │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │              BrowserRouter                │  │  │  │
│  │  │  │  ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │  │            Page View                │  │  │  │  │
│  │  │  │  │  - useDataProvider()                │  │  │  │  │
│  │  │  │  │  - useMetadata()                    │  │  │  │  │
│  │  │  │  │  - Local useState / useMemo         │  │  │  │  │
│  │  │  │  └─────────────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Core Custom Hooks

#### `useDataProvider()` (`src/hooks/useDataProvider.tsx`)
* Exposes `mode` (`'prototype'` | `'build'`), `setMode()`, and the active `provider` object.
* Persists mode selection in `localStorage` under key `apix_mode`.
* Components call `const { provider } = useDataProvider()` to fetch data without needing to know which mode is active.

#### `useMetadata()` (`src/hooks/useMetadata.ts`)
* Calls `provider.getConstants()` on mount to dynamically retrieve:
  * Route basket with DGCA weights (`routes`).
  * Carrier registry (`airlines`).
  * Latest observation date (`latestDate`).
  * Base period label (`basePeriodLabel`).
  * Live historical depth in days (`historyDays`).
* Automatically initializes with default constants so initial render is instantaneous.

#### `useTheme()` (`src/hooks/useTheme.tsx`)
* Manages Light / Dark theme toggling, synchronizing with `localStorage` (`theme` key) and the `dark` class on `document.documentElement`.
* Respects OS `prefers-color-scheme` on first visit.

---

## 4. Routing & Page Hierarchy

The application uses `react-router-dom` with 10 primary analytical views:

| Route Path | Page Component | Category | Purpose |
|---|---|---|---|
| `/` | `Home.tsx` | Overview | Executive summary, headline index, metric cards |
| `/airfare-index` | `AirfareIndex.tsx` | Core Index | Laspeyres trend chart, filters, route table with smart search |
| `/route-analytics` | `RouteAnalytics.tsx` | Network Analysis | Survey of India vector map, top movement metrics, route table |
| `/price-trends` | `PriceTrends.tsx` | Trend Comparison | All-India vs Route comparison, rebased index ($base = 100$) |
| `/lead-time` | `LeadTimeAnalysis.tsx` | Elasticity | Advance purchase windows ($T+1 \dots T+45$), carrier comparison |
| `/backtesting` | `Backtesting.tsx` | Validation | Historical index reconstruction vs reference base |
| `/data-explorer` | `DataExplorer.tsx` | Open Data | Cleaned route records, portal quotes, CSV export |
| `/data-quality` | `DataQuality.tsx` | Assurance | 4-stage cleaning pipeline metrics, portal imputation monitoring |
| `/api-docs` | `ApiDocs.tsx` | Developer | Interactive API playground with live query runner |
| `/about-apix` | `AboutApix.tsx` | Institutional | Methodology, MoSPI mandate, statistical reference |

---

## 5. Build and Bundle Optimization

* **Code Splitting**: Chunks are split in `vite.config.ts` into isolated vendor bundles:
  * `vendor-react` (`react`, `react-dom`, `react-router-dom`) $\approx 154\text{ KB}$
  * `vendor-charts` (`recharts`) $\approx 383\text{ KB}$
  * `vendor-ui` (`lucide-react`, `clsx`, `tailwind-merge`) $\approx 36\text{ KB}$
  * `vendor-query` (`@tanstack/react-query`) $\approx 36\text{ KB}$
* **Build Verification**: Production builds execute `tsc && vite build`, creating optimized assets in `dist/` with full source maps.
