/**
 * API server. One process serves the REST API, the WebSocket live feed, and the
 * built SPA — a single public URL, seeded on boot. Business logic lives in the
 * engine + core; this file wires HTTP/WS and static hosting.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { openDb } from "./db/index.js";
import { seedIfEmpty } from "./db/seed.js";
import { loadAll } from "./db/repo.js";
import { SimEngine } from "./sim/engine.js";
import { SimClock } from "./sim/clock.js";
import { registerRoutes, type AppConfig } from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";
const DB_PATH = process.env.DB_PATH ?? "./data/arm.sqlite";
const SIM_START = process.env.SIM_START ?? "2026-10-14T06:00:00Z";
const SIM_SPEED = Number(process.env.SIM_SPEED ?? 10);

export const CONFIG: AppConfig = {
  brandName: process.env.BRAND_NAME ?? "SkyReach",
  brandColor: process.env.BRAND_COLOR ?? "#4f8cff",
  brandLogo: process.env.BRAND_LOGO ?? "",
  secondLanguage: process.env.SECOND_LANGUAGE ?? "ar",
  currency: process.env.CURRENCY ?? "USD",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  day: "2026-10-14",
  airport: "MQI",
};

async function main(): Promise<void> {
  const { db, sqlite } = openDb(DB_PATH);
  const seeded = seedIfEmpty(db, sqlite);

  const engine = new SimEngine();
  engine.load(loadAll(db));

  const clock = new SimClock(SIM_START, SIM_SPEED);
  clock.on("tick", (iso: string) => engine.tick(iso));
  // Prime one decision cycle so the playground shows content before "play".
  engine.tick(clock.nowIso());

  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);

  // Live feed: broadcast engine deltas / clock state to all sockets.
  interface MiniSocket { send(data: string): void; on(ev: "close", cb: () => void): void; }
  const sockets = new Set<MiniSocket>();
  const broadcast = (msg: unknown) => {
    const s = JSON.stringify(msg);
    for (const ws of sockets) { try { ws.send(s); } catch { /* drop */ } }
  };
  engine.on("delta", (d) => broadcast({ type: "delta", ...d }));
  engine.on("event", (e) => broadcast({ type: "event", event: e }));
  engine.on("redeem", (r) => broadcast({ type: "redeem", ...r }));
  clock.on("state", (st) => broadcast({ type: "clock", ...st }));

  await app.register(async (f) => {
    f.get("/ws", { websocket: true }, (conn: unknown) => {
      // @fastify/websocket v11 passes the ws socket (older versions wrap it in
      // { socket }); support both without a hard dependency on ws types.
      const ws = ((conn as { socket?: MiniSocket }).socket ?? conn) as MiniSocket;
      sockets.add(ws);
      ws.send(JSON.stringify({ type: "clock", ...clock.state() }));
      ws.send(JSON.stringify({ type: "delta", now: clock.nowIso(), kpis: engine.kpis(), updatedScreens: [], presence: [...engine.presenceByZone.values()].map((p) => ({ zoneId: p.zoneId, paxNow: p.paxNow })) }));
      ws.on("close", () => sockets.delete(ws));
    });
  });

  registerRoutes(app, { engine, clock, db, config: CONFIG, broadcast });

  // Serve the built SPA (single public URL). SPA fallback for client routes.
  const webDist = process.env.WEB_DIST ?? join(__dirname, "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
        reply.code(404).send({ error: "not_found" });
      } else {
        reply.sendFile("index.html");
      }
    });
  }

  await app.listen({ port: PORT, host: HOST });
  // eslint-disable-next-line no-console
  console.log(`[SkyReach] ${CONFIG.brandName} on http://${HOST}:${PORT}  (db ${seeded ? "seeded" : "loaded"}, sim ${SIM_START} @${SIM_SPEED}x)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
