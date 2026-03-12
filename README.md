# HiBob → Webflow CMS Job Sync

Serverless sync service that keeps a Webflow CMS **Jobs** collection in sync with active job ads from the HiBob Hiring API. Runs hourly on Vercel Cron and can also be triggered manually.

---

## Architecture

```
┌─────────────┐   POST /search   ┌────────────────┐
│  HiBob API  │ ◄──────────────► │  lib/hibob.ts  │
└─────────────┘                  └────────┬───────┘
                                          │ HiBobJob[]
                                 ┌────────▼───────┐
                                 │  lib/sync.ts   │  ← orchestrates everything
                                 └────────┬───────┘
                                          │ CRUD
                                 ┌────────▼───────┐   Webflow v2 API
                                 │ lib/webflow.ts │ ◄──────────────────
                                 └────────────────┘

Vercel Cron (hourly)  →  api/cron/sync.ts  →  runSync()
Manual trigger (POST) →  api/sync-jobs.ts  →  runSync()
```

---

## File structure

```
.
├── api/
│   ├── sync-jobs.ts        # Manual trigger: POST /api/sync-jobs
│   └── cron/
│       └── sync.ts         # Vercel Cron handler: GET /api/cron/sync
├── lib/
│   ├── hibob.ts            # HiBob Hiring API client
│   ├── webflow.ts          # Webflow CMS API client (v2)
│   ├── sync.ts             # Core sync orchestration logic
│   ├── auth.ts             # Request authentication middleware
│   └── logger.ts           # Structured JSON logger
├── types/
│   └── jobs.ts             # Shared TypeScript interfaces
├── .env.example            # Required environment variables
├── vercel.json             # Cron schedule + function config
├── tsconfig.json
└── package.json
```

---

## Webflow collection setup

Create a CMS collection called **Jobs** (or any name — you'll use its ID) with these fields:

| Field label    | Slug           | Type          | Notes                              |
|----------------|----------------|---------------|------------------------------------|
| Name           | `name`         | Plain text    | Built-in — used as the item title  |
| HiBob ID       | `hibob-id`     | Plain text    | **Required** — idempotency key     |
| Location       | `location`     | Plain text    |                                    |
| Description    | `description`  | Rich text     |                                    |
| Apply URL      | `apply-url`    | Link          |                                    |
| Job URL        | `job-url`      | Plain text    | e.g. `/careers/{hibob-id}`         |
| Is Active      | `is-active`    | Switch        | Set false when job removed         |
| Last Seen At   | `last-seen-at` | Plain text    | ISO timestamp                      |
| Synced At      | `synced-at`    | Plain text    | ISO timestamp                      |

> **Slug naming matters.** The slugs above must match exactly what you configure in Webflow Designer. Webflow auto-generates slugs from field labels; double-check them under each field's settings.

---

## Local development

### Prerequisites

- Node.js 20+
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`

### Setup

```bash
git clone <repo>
cd hibob-webflow-sync
npm install

cp .env.example .env
# Fill in all values in .env
```

### Run locally

```bash
vercel dev
```

This starts a local server at `http://localhost:3000` that mirrors the Vercel runtime.

### Trigger a manual sync locally

```bash
curl -X POST http://localhost:3000/api/sync-jobs \
  -H "Authorization: Bearer <your SYNC_SECRET>"
```

Expected response (success):

```json
{
  "ok": true,
  "result": {
    "jobsFetched": 12,
    "created": 2,
    "updated": 3,
    "deactivated": 1,
    "skipped": 6,
    "errors": [],
    "durationMs": 4821,
    "timestamp": "2025-01-15T10:00:00.000Z"
  }
}
```

### Enable verbose logging locally

```bash
LOG_LEVEL=debug vercel dev
```

---

## Vercel deployment

### 1. Create a new Vercel project

```bash
vercel link   # or connect via vercel.com dashboard
```

### 2. Set environment variables

Go to **Vercel → Project → Settings → Environment Variables** and add:

| Variable               | Value                        |
|------------------------|------------------------------|
| `HIBOB_API_ID`         | Your HiBob service account ID |
| `HIBOB_API_TOKEN`      | Your HiBob API token          |
| `WEBFLOW_API_TOKEN`    | Your Webflow API token        |
| `WEBFLOW_COLLECTION_ID`| Your Webflow collection ID    |
| `SYNC_SECRET`          | A strong random secret (`openssl rand -base64 32`) |
| `CRON_SECRET`          | Another strong random secret  |

Set all variables for **Production** (and optionally Preview/Development).

### 3. Deploy

```bash
vercel --prod
```

### 4. Verify cron is registered

After deploying, visit **Vercel → Project → Cron Jobs**. You should see:

```
/api/cron/sync   0 * * * *   (every hour)
```

Vercel Pro or Enterprise plans are required for cron jobs. On the Hobby plan, you can only use daily or less frequent schedules.

---

## Vercel Cron configuration

The schedule is defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 * * * *"
    }
  ]
}
```

Common schedule values:

| Schedule         | Cron expression |
|------------------|-----------------|
| Every hour       | `0 * * * *`     |
| Every 30 minutes | `*/30 * * * *`  |
| Daily at 9am UTC | `0 9 * * *`     |

Vercel authenticates its own cron invocations using `CRON_SECRET` — set it in the dashboard and Vercel will inject it automatically.

---

## Manual production trigger

```bash
curl -X POST https://your-app.vercel.app/api/sync-jobs \
  -H "Authorization: Bearer <SYNC_SECRET>"
```

Or with query string (useful for quick browser checks):

```
https://your-app.vercel.app/api/sync-jobs?token=<SYNC_SECRET>
```

---

## Sync behaviour

| Scenario                                   | Action                                                  |
|--------------------------------------------|---------------------------------------------------------|
| HiBob job not in Webflow                   | Create new CMS item, publish immediately                |
| HiBob job exists in Webflow, data changed  | PATCH updated fields, re-publish                        |
| HiBob job exists in Webflow, data same     | Skip (no API call made)                                 |
| Webflow job not in HiBob response          | Set `is-active = false`, set `isDraft = true` (unpublish) |
| HiBob returns 0 jobs                       | **Abort upsert + deactivation** (safety guard)          |

The zero-jobs guard prevents a misconfigured HiBob request from wiping your entire jobs board.

---

## Webflow publish/unpublish notes

- Webflow's API requires a **separate publish call** after create/update for changes to appear on the live site. This service makes that call automatically after each write.
- Setting `isDraft: true` on an already-published item **removes it from the live site** without deleting the CMS record — this is how deactivation works.
- Webflow rate limit is **60 requests/minute** on standard API tokens. The service adds a ~1.1 s delay between write operations to stay within this limit.
- If you have many jobs (> ~50), the first sync run will be slower due to rate limiting. Subsequent runs will mostly hit the "skipped" path.

---

## Logs

All log entries are newline-delimited JSON, readable in **Vercel → Project → Logs** or any log drain (Datadog, Axiom, Logtail, etc.):

```json
{"level":"info","message":"sync: completed","jobsFetched":14,"created":1,"updated":2,"deactivated":0,"skipped":11,"errorCount":0,"durationMs":6320,"timestamp":"2025-01-15T10:00:06.320Z"}
```

Set `LOG_LEVEL=debug` in environment variables to see per-item and per-page details.
