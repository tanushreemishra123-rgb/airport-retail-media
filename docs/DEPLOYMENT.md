# Deployment

The platform is **one Docker image** that serves the API, the WebSocket feed and
the built SPA on one port, seeding demo data on first boot. That makes the
required public playground URL a single service with **no reviewer setup, no API
keys**.

## Local (technical validation)

```bash
docker compose up          # http://localhost:8080
```

## Public playground — recommended: Render (free, Docker-native, WebSocket)

A blueprint is included at `deploy/render.yaml`.

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo. Render reads `render.yaml`,
   builds the Dockerfile, attaches a 1 GB disk at `/data`, and gives a public
   HTTPS URL.
3. First boot seeds the database. Open the URL — all five roles and the
   passenger screen are live and preconfigured. Nothing else to configure.

`PUBLIC_BASE_URL` is wired to the service host so on-screen QR codes point at the
deployed claim page.

## Alternatives

- **Railway** — New Project → Deploy from repo; it detects the Dockerfile. Add a
  volume at `/data`. Set the same env vars as `render.yaml`.
- **Fly.io** — `fly launch` (uses the Dockerfile), `fly volumes create arm_data`,
  mount at `/data`, `fly deploy`.
- **AWS** — build and push the image to ECR; run on **App Runner** (simplest,
  gives an HTTPS URL, supports WebSocket) or ECS Fargate behind an ALB with an
  EFS mount at `/data`. Or any VM: `docker compose up -d` behind a reverse proxy
  with TLS.
- **Azure Container Apps / Google Cloud Run** — deploy the image; mount a volume
  for `/data` (or set `DB_PATH` to an attached disk). Ensure WebSocket/session
  affinity is on.

## Environment variables

See `.env.example`. For a deploy you typically only set `PUBLIC_BASE_URL` (if the
platform doesn't inject it) and any white-label values (`BRAND_NAME`,
`BRAND_COLOR`, `SECOND_LANGUAGE`, `CURRENCY`). Reviewer mode needs no secrets.

## Production hardening (beyond the POC)

- **Database**: the Drizzle schema targets Postgres unchanged; point
  `drizzle-kit` at a managed Postgres and run generated migrations instead of
  the boot-time DDL.
- **Engine state**: move session/live counters to Redis so the service scales
  horizontally; keep the tick loop on one leader.
- **Feeds**: implement the `vendor-api` / `acris-ngsi` adapters (see
  `docs/ADAPTERS.md`) and flip `FLIGHT_SOURCE` / `QUEUE_SOURCE`.
- **Observability**: ship structured logs + the decision log to your stack;
  the decision records are already fully auditable.
