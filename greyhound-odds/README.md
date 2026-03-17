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
│   ├── mock-provider.ts    # Mock data with realistic scenarios
│   ├── composite-provider.ts # Merges Betfair + bookmaker odds
│   └── betfair/
│       ├── index.ts        # Public exports
│       ├── client.ts       # Betfair API client (auth, JSON-RPC, session mgmt)
│       ├── provider.ts     # OddsDataProvider implementation for Betfair
│       ├── price-cache.ts  # Rolling in-memory price history cache
│       └── types.ts        # Betfair API type definitions
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

## Live Data: Betfair Integration

The Betfair Exchange integration is fully built. To switch from mock data to live Betfair data:

### 1. Get Betfair API credentials

1. Create a Betfair account (if you don't have one)
2. Register for a developer app key at [developer.betfair.com](https://developer.betfair.com/)
3. Generate a self-signed SSL certificate for automated (non-interactive) login:

```bash
openssl req -x509 -newkey rsa:2048 -keyout betfair.key -out betfair.crt -days 365 -nodes
```

4. Upload `betfair.crt` at the Betfair developer portal under your app key settings

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
ODDS_PROVIDER=betfair
BETFAIR_APP_KEY=your-app-key
BETFAIR_USERNAME=your-username
BETFAIR_PASSWORD=your-password
BETFAIR_CERT_PATH=./betfair.crt
BETFAIR_KEY_PATH=./betfair.key
```

### 3. Run

```bash
npm run dev
```

The app will now fetch live greyhound WIN markets from Betfair Exchange for UK and Irish tracks.

### How it works

| Component | Role |
|---|---|
| `betfair/client.ts` | Handles cert-based or interactive login, session keep-alive, JSON-RPC transport |
| `betfair/provider.ts` | Maps Betfair API responses → `Race[]` / `Runner[]`, manages catalogue caching |
| `betfair/price-cache.ts` | Stores rolling 15-minute price snapshots per runner for movement calculations |
| `betfair/types.ts` | Full TypeScript definitions for Betfair API schemas |

### Rate limits

- Free tier: **5 requests/second** per app key
- `listMarketCatalogue` is cached for 60 seconds
- `listMarketBook` supports up to 40 markets per call (batched automatically)
- At 5s polling with ~10 races, you'll use ~1 req/s well within limits

### Providers

| `ODDS_PROVIDER` | What it does |
|---|---|
| `mock` (default) | Demo data, no API needed |
| `betfair` | Live Betfair Exchange prices only (bookmaker odds blank) |
| `composite` | Betfair + bookmaker overlay (once a BookmakerOddsSource is plugged in) |

## Bookmaker Odds (Phase 2)

The `CompositeProvider` in `src/data/composite-provider.ts` is ready to accept a `BookmakerOddsSource`:

```typescript
interface BookmakerOddsSource {
  name: string;
  getOddsForRace(track: string, raceTime: string): Promise<Map<string, { odds: number; source: string }>>;
}
```

Options to implement:
- [The Odds API](https://the-odds-api.com/) — cleanest option if greyhound coverage is sufficient
- Oddschecker scraper
- Direct bookmaker feeds

The composite provider handles runner name matching (normalised + fuzzy) between Betfair and bookmaker sources automatically.

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
