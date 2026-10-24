# Architecture

## Principle

The model interprets and ranks; it never reaches a screen on its own. All
authority — hard rules, parameter/evidence validation, the deterministic
verification gate — lives outside the model, so live and fallback behaviour are
identical and auditable. The application core sees only a canonical model;
adapters translate every external feed into it.

## Packages

- **`packages/core`** — the shared brain, usable by server and browser:
  - `model.ts` — canonical entities (Flight, FlightEvent, Zone/Checkpoint/
    QueueMeasurement, Screen, Advertiser/Outlet, Campaign/Creative/PromoCode,
    Impression/Redemption, ZonePresence, CrowdProfile, Decision, Incident).
  - `adapters.ts` — `FlightSource` / `QueueSource` / `CreativeProvider` contracts.
  - `decision.ts` — `audienceMatch`, `hardFilterReason`, `boostFor`, `verify`,
    and `decide()` (the full pipeline producing an auditable `Decision`).
  - `presence.ts` — `catchmentWeight` + `rollupProfile` (the derived signal).

- **`apps/api`** — Fastify server:
  - `adapters/` — AODB CSV, AIDX XML, ACRIS NGSI, creative provider.
  - `data/` — reference data, per-flight profile generator, full-day generator,
    campaign generator.
  - `db/` — Drizzle schema, connection + boot-time DDL, repository, seed.
  - `sim/` — `clock.ts` (sim time), `engine.ts` (tick loop: presence →
    decisions → impressions/revenue → incidents → WS deltas; event injection).
  - `routes.ts`, `server.ts` — REST + WebSocket + static SPA hosting.

- **`apps/web`** — React + Vite SPA: role shell + sim bar, the five roles, the
  passenger screen, split-screen demo, the mobile claim page, a Zustand store
  fed by the WebSocket.

## Request / tick flow

- **HTTP**: the SPA calls REST under `/api`; the backend reads live engine state.
- **WebSocket** `/ws`: the engine broadcasts a `delta` every tick (KPIs +
  per-zone presence), plus `event`/`redeem`/`clock` messages. Dashboards
  re-fetch on each delta, so updates land within ~2 s of a feed event.
- **Sim tick** (250 ms real × speed): recompute live flight status → rebuild
  per-zone presence (with evidence) → run the decision pipeline per online
  screen on a 15-s slot cadence → record impressions/revenue → detect incidents
  → broadcast. Injected events re-run decisions immediately for instant
  cause-and-effect.

## Single-service deployment

The backend serves the REST API, the WebSocket feed and the built SPA from one
port, with SQLite seeded on first boot. One container → one public URL,
preconfigured for reviewers (see `docs/DEPLOYMENT.md`). Local `docker compose up`
runs the identical image.

## Scale & performance

- 900 flights, 180 screens, ~6 zones: a full decision cycle over all online
  screens runs each tick in a few milliseconds (pure functions over in-memory
  state). 60× simulation runs without UI lag; dashboards update < 2 s.
- State is in-memory for speed; the embedded SQLite holds the seed and live
  redemptions. For production, the same Drizzle schema targets Postgres and the
  engine state externalises to Redis (see deployment doc).
