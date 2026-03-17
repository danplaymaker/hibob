# Greyhound Odds — Market Discrepancy Scanner

A lightweight betting analysis dashboard for identifying pricing discrepancies between Betfair Exchange and soft bookmakers (Sky Bet, Coral, etc.) for greyhound racing.

**This is not a tipster app.** It does not predict winners. It detects potential market inefficiencies based on price alone.

## Core Concept

> Find runners where bookmaker odds are significantly above Betfair odds, with additional emphasis on recent Betfair downward movement.

Betfair Exchange is treated as the best proxy for "true" market price. When a bookmaker price is materially larger than the Betfair price — especially when Betfair is shortening and the bookmaker hasn't adjusted — that's a potential value opportunity.

## Getting Started

```bash
cd greyhound-odds
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app runs with **mock data** by default — no API keys needed for the MVP.

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── races/          # GET /api/races — dashboard & opportunities data
│   │   │   └── [raceId]/   # GET /api/races/:id — runner detail data
│   │   └── alerts/         # POST /api/alerts — evaluate alert rules
│   ├── layout.tsx          # Root layout (dark theme, nav)
│   ├── page.tsx            # Main client page (dashboard/opportunities/alerts)
│   └── globals.css         # Tailwind + CSS variables
├── components/             # UI components
│   ├── RaceTable.tsx       # Race monitor dashboard table
│   ├── OpportunityList.tsx # Ranked opportunity cards
│   ├── RunnerDetail.tsx    # Runner detail modal
│   ├── PriceChart.tsx      # Recharts line chart (BF back/lay/mid + bookie)
│   ├── AlertPanel.tsx      # Alert rules + active alerts
│   ├── FilterBar.tsx       # Edge/liquidity/time filters
│   ├── SignalBadge.tsx     # Signal status badges
│   ├── EdgeCell.tsx        # Edge % display
│   ├── MovementCell.tsx    # Price movement display
│   ├── OddsCell.tsx        # Odds display
│   └── ConfidenceBadge.tsx # Confidence score display
├── data/
│   ├── provider.ts         # Data provider registry & factory
│   └── mock-provider.ts    # Mock data with realistic scenarios
├── hooks/
│   ├── useMarketData.ts    # Polling hook for race/opportunity data
│   └── useAlerts.ts        # Alert evaluation + browser notifications
└── lib/
    ├── types.ts            # All TypeScript types + OddsDataProvider interface
    └── calculations.ts     # Core maths: midpoint, edge, movement, confidence, signals
```

## Key Calculations

| Calculation | Formula |
|---|---|
| Betfair midpoint | `(best_back + best_lay) / 2` |
| Edge % | `((bookie_odds - reference) / reference) × 100` |
| Movement | `((current_mid - past_mid) / past_mid) × 100` |

## Signal Engine

| Signal | Conditions |
|---|---|
| **Strong Value** | Edge ≥ 15%, BF shortened ≥ 5% in 5m, decent liquidity, tight spread |
| **Watch** | Edge ≥ 8%, some shortening or good edge with moderate liquidity |
| **No Edge** | Discrepancy too small |
| **Drifting** | BF price moving out (getting longer) |
| **Low Liquidity** | Insufficient volume or wide spread |

All thresholds are configurable in `src/lib/types.ts` (`DEFAULT_SETTINGS`).

## Confidence Score (0–100)

Based on: matched volume, back/lay spread width, consistency of shortening across time windows, and proximity to race off time.

## Features

- **Race Monitor** — All upcoming races with full price grid, edge %, movement columns, signal badges
- **Opportunity Ranking** — Runners sorted by composite opportunity score
- **Runner Detail** — Click any runner for price chart, full analysis, and plain-English explanation
- **Alerts** — Configurable rules (edge threshold + shortening), browser notifications, sound toggle
- **Filters** — Min edge %, min liquidity, max minutes to off
- **Watchlist** — Star runners to track

## Plugging In Live Data (Phase 2)

The `OddsDataProvider` interface in `src/lib/types.ts` is the abstraction layer:

```typescript
interface OddsDataProvider {
  id: string;
  name: string;
  getRaces(): Promise<Race[]>;
  getRace(raceId: string): Promise<Race | null>;
  getRunnerHistory(runnerId: string): Promise<PriceSnapshot[]>;
}
```

### Betfair Exchange

Create `src/data/betfair-provider.ts`:
- Use the Betfair Exchange Streaming API or polling API
- Map `listMarketCatalogue` → `Race[]`
- Map `listMarketBook` → runner back/lay prices + matched volume
- Requires: `BETFAIR_APP_KEY`, `BETFAIR_USERNAME`, `BETFAIR_PASSWORD`, `BETFAIR_CERT_PATH`

### Bookmaker Odds

Options:
- [The Odds API](https://the-odds-api.com/) — aggregated bookmaker odds
- Oddschecker scraping
- Direct bookmaker feeds

Recommended approach: create a `CompositeProvider` that uses Betfair as primary and overlays bookmaker odds from a secondary source.

Register new providers in `src/data/provider.ts` and set `ODDS_PROVIDER` env var.

## Deployment

Deployable to Vercel:

```bash
cd greyhound-odds
npx vercel
```

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Recharts
- Vercel-ready

## Environment Variables

See `.env.example` — not needed for MVP (mock data).
