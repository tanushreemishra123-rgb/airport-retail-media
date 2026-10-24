# SkyReach — Airport Retail Media Platform (POC)

A locally runnable, demo-ready prototype of an **airport retail media platform**:
ads and promotions on airport screens, timed to the passengers actually in
front of each screen using live flight and passenger-flow data. Built for the
fictional two-terminal hub **Meridian International (MQI)**.

> One flight event → the passenger screen changes → a traveller scans a code →
> revenue appears on the retailer's dashboard, all within a couple of seconds
> and visible across five role dashboards.

---

   **Live playground:** https://airport-retail-media-488g.onrender.com
   

## Quick start (one command, offline)

```bash
docker compose up
# then open http://localhost:8080
```

That builds one image (frontend + backend), seeds a full fictional day into an
embedded database on first boot, and serves everything — REST API, WebSocket
live feed, and the UI — from a single port. No API keys, no cloud services.

### Without Docker (Node ≥ 20)

```bash
npm install
npm run build
npm start            # http://localhost:8080  (seeds on first boot)
# or for development with hot reload (web on :5173, api on :8080):
npm run dev
```

The deployed playground is the same single service — see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Render / Railway / Fly / AWS.

---

## Why this stack

Open, widely used, actively maintained, and chosen so the whole product runs on
a clean laptop with one command and deploys as one container:

- **TypeScript end to end** — one language across the canonical model, the
  decision engine, the API and the UI. The `@arm/core` package is shared by
  server and browser, so the audience-matching types and logic can't drift.
- **React + Vite** (frontend) — fast builds, standard tooling, a single static
  bundle the backend serves.
- **Fastify** (backend) — high-performance REST + first-class WebSocket, serves
  the SPA too, so it's **one deployable service → one public URL**.
- **SQLite via better-sqlite3 + Drizzle ORM** — a zero-dependency embedded
  database with a typed schema and a seed script; no server to run, trivial to
  deploy, and swappable for Postgres in production (same Drizzle schema).
- **Native WebSocket** for sub-2-second live updates; no message broker needed
  at POC scale.

The **adapter layer** isolates all three external feed formats from the core, so
going live means writing one new adapter and changing one env value — not
touching business logic.

---

## Architecture (one service, adapters at the edges)

```
Browser (React SPA, 5 roles + passenger screen + mobile claim)
        │  REST + WebSocket (same origin)
┌───────▼─────────────────────────────────────────────────┐
│ Fastify server  — serves API, WS live feed, and the SPA  │
│  ┌─────────────┐   ┌───────────────────────────────────┐ │
│  │ Sim clock   │──►│ Sim engine (tick loop)            │ │
│  │ play/speed/ │   │  presence → decision pipeline →   │ │
│  │ jump/inject │   │  impressions/revenue/incidents    │ │
│  └─────────────┘   └───────────────┬───────────────────┘ │
│                                     │ @arm/core (shared)   │
│   Adapters  ─────────────┐          ▼                      │
│   AODB (CSV) ─┐          │   evidence-gated matching:      │
│   AIDX (XML) ─┼─► canonical model ─ profile→filter→score→  │
│   ACRIS(NGSI)─┘          │          rules→verify→log       │
│                          ▼                                  │
│                 SQLite (seed + redemptions)                 │
└─────────────────────────────────────────────────────────┘
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/architecture.svg`](docs/architecture.svg). Data adapters:
[`docs/ADAPTERS.md`](docs/ADAPTERS.md). API: [`docs/openapi.yaml`](docs/openapi.yaml).

---

## The AI decision pipeline (evidence-first)

Every ad decision runs per screen, per slot (~15 simulation seconds):

1. **Profile** the crowd for the screen's catchment (flights at nearby gates ×
   time-to-boarding, plus ACRIS queue data), as aggregated shares only.
2. **Filter** out campaigns failing a hard rule (schedule, placement, approval,
   brand safety, domestic/international, destination, min crowd, budget).
3. **Score** each remaining campaign's audience match (0–1) against the crowd.
4. **Apply business rules** — delay/boarding/festival triggers, airline priority
   in its own boarding window, competitor separation, frequency cap, budget
   pacing.
5. **Choose** the top-ranked campaign (the "AI pick").
6. **Verify deterministically** — the pick executes **only if** every cited
   input exists in a trusted feed and is fresh enough, every hard rule passes,
   and the score recomputes identically from the logged inputs. If any check
   fails, the AI pick is rejected and the screen falls back to a rule-based
   default. **Nothing the AI asserts reaches a screen unless it traces back to a
   recorded data point**, so a hallucinated fact cannot play.

Every decision is logged with its full evidence trail and is auditable from the
Admin decision log and the passenger screen's **"Why this ad?"** overlay. The
pipeline and its verification gate are unit-tested (`npm test`), including the
reproducible worked example (delay-boosted duty-free perfume beats the family
toy store beats the filtered business lounge).

A real LLM agent can set the "AI pick" instead of the deterministic ranker; the
same verification gate polices it unchanged (see `CREATIVE_PROVIDER` and the
`aiProposedCampaignId` hook).

---

## Roles (role switcher in the header)

- **Platform Admin** — live terminal network map with presence heat, KPI strip,
  incident tracker, master data, data-feed health, performance.
- **Retailer** — live outlet KPIs, passenger flow near the store, campaign
  builder with a **live audience-match preview**, GenAI creative assistant
  (EN + Arabic), promo codes, campaign history + ROI with one-click re-run.
- **Media Manager** — inventory calendar (zone × hour, premium slots), yield &
  pricing from predicted footfall, approval queue, advertiser overview, segment
  heatmap.
- **Airline Representative** — flights today, aggregated crowd profile of their
  own passengers, gate-area messaging, delay-goodwill automation.
- **Passenger screen** — full-screen 16:9 / 9:16 render of a chosen screen with
  a FIDS context strip, a scannable **QR with live countdown** (opens a mobile
  claim page that records a redemption), and the "Why this ad?" overlay.

**WOW / demo:** a simulation control bar on every screen (play/pause, 1×/10×/60×,
jump, inject delay / gate change / screen offline / feed lag), a **split-screen
demo** mode, live cause-and-effect, the GenAI creative assistant, and
"best 3 slots tomorrow" recommendations. See
[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the 15-minute run.

---

## Mock data

`npm run seed` (also run automatically on first boot) generates one fictional day
at MQI, in the exact feed formats under `aodb-samples/`:

- **~900 flight legs** (AODB 33-column CSV shape), **180 screens**, **40
  outlets**, **11 airlines**, **25 campaigns** with **30 days of history**,
  plausible per-flight crowd profiles.
- Fictional airlines, airports, brands and outlets — no real marks, no
  per-passenger data (targeting is aggregated by flight, zone and time window).

---

## Project layout

```
packages/core        shared canonical model, adapter contracts, decision pipeline, presence rollup
apps/api             Fastify server, sim clock + engine, adapters, DB (Drizzle/SQLite), seed, routes
apps/web             React + Vite SPA (5 roles, passenger screen, mobile claim, sim bar)
aodb-samples         reference feed samples (AODB CSV, AIDX XML) + notes
docs                 architecture, adapters, API spec, deployment, demo script
Dockerfile           single-service image (serves API + WS + SPA)
docker-compose.yml   one-command local start
deploy/render.yaml   one-click cloud blueprint
```

## Scripts

| Command | What |
|---|---|
| `docker compose up` | build + run everything on :8080 |
| `npm run dev` | hot-reload dev (web :5173 proxied to api :8080) |
| `npm run build` | build core → web → api |
| `npm start` | run the built server |
| `npm run seed` | seed the database |
| `npm run db:generate -w @arm/api` | generate a Drizzle SQL migration from the schema |
| `npm run db:migrate -w @arm/api` | apply migrations to `DB_PATH` (managed-DB path) |
| `npm test` | run the decision-pipeline, core + adapter unit tests |

> **Storage & migrations:** the embedded demo creates its schema idempotently on
> boot (zero setup) and seeds a full day. Versioned Drizzle migrations live in
> `apps/api/drizzle/` for a managed database (SQLite/Postgres) — the same schema,
> no code changes.

## Configuration

All via environment (`.env.example`). Highlights: `FLIGHT_SOURCE` /
`QUEUE_SOURCE` / `CREATIVE_PROVIDER` (adapter selection), `BRAND_NAME` /
`BRAND_COLOR` / `SECOND_LANGUAGE` / `CURRENCY` (white-label + i18n),
`PUBLIC_BASE_URL` (QR claim links for phones on the LAN), `SIM_START` /
`SIM_SPEED`.

## Out of scope (by the brief)

Real authentication, payments, real screen hardware, production hosting, and any
per-passenger data. Targeting is aggregated by flight, zone and time window only.
