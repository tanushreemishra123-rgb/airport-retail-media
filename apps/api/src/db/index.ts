/**
 * Database connection + schema bootstrap.
 *
 * For a zero-setup, embedded demo the schema is created idempotently at boot
 * (CREATE TABLE IF NOT EXISTS) so `docker compose up` needs no separate
 * migration step. The Drizzle schema in `schema.ts` is the source of truth for
 * types and queries; this DDL mirrors it. (drizzle-kit can also generate SQL
 * migrations for a managed Postgres in production — see docs/DEPLOYMENT.md.)
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

const DDL = `
CREATE TABLE IF NOT EXISTS terminals (id TEXT PRIMARY KEY, name TEXT NOT NULL, concourses TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS zones (id TEXT PRIMARY KEY, terminal_id TEXT NOT NULL, name TEXT NOT NULL, gates TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL);
CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, zone_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS aircraft_types (code TEXT PRIMARY KEY, name TEXT NOT NULL, seats TEXT NOT NULL, total_seats INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY, airline_code TEXT NOT NULL, flight_number TEXT NOT NULL, direction TEXT NOT NULL,
  origin TEXT NOT NULL, destination TEXT NOT NULL, via TEXT, domestic_international TEXT NOT NULL,
  aircraft_type_code TEXT NOT NULL, pax_count INTEGER NOT NULL, scheduled_time TEXT NOT NULL,
  estimated_time TEXT, actual_time TEXT, tobt TEXT, tsat TEXT, aibt TEXT, aobt TEXT,
  stand TEXT, gate TEXT, checkin_counters TEXT, belt TEXT, status TEXT NOT NULL,
  delay_code TEXT, delay_minutes INTEGER NOT NULL DEFAULT 0, terminal_id TEXT NOT NULL, zone_id TEXT, profile TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS flight_events (id TEXT PRIMARY KEY, flight_id TEXT NOT NULL, type TEXT NOT NULL, at TEXT NOT NULL, change TEXT NOT NULL, evidence TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS queue_measurements (id TEXT PRIMARY KEY, checkpoint_id TEXT NOT NULL, zone_id TEXT NOT NULL, at TEXT NOT NULL, queue_length INTEGER NOT NULL, wait_minutes REAL NOT NULL, throughput_per_min REAL NOT NULL);
CREATE TABLE IF NOT EXISTS advertisers (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, airline_code TEXT, category TEXT);
CREATE TABLE IF NOT EXISTS outlets (id TEXT PRIMARY KEY, advertiser_id TEXT NOT NULL, name TEXT NOT NULL, zone_id TEXT NOT NULL, category TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS screens (id TEXT PRIMARY KEY, name TEXT NOT NULL, zone_id TEXT NOT NULL, nearest_gates TEXT NOT NULL, size_inches INTEGER NOT NULL, orientation TEXT NOT NULL, status TEXT NOT NULL, last_seen TEXT NOT NULL, latency_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, advertiser_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
  brand_safe INTEGER NOT NULL DEFAULT 1, competitor_group TEXT, segment_weights TEXT NOT NULL,
  hard_filters TEXT NOT NULL, placement TEXT NOT NULL, budget TEXT NOT NULL, triggers TEXT NOT NULL,
  creative_ids TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS creatives (id TEXT PRIMARY KEY, advertiser_id TEXT NOT NULL, name TEXT NOT NULL, orientation TEXT NOT NULL, template TEXT NOT NULL, copy TEXT NOT NULL, bg_color TEXT NOT NULL, fg_color TEXT NOT NULL, approval_status TEXT NOT NULL, ai_generated INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS promo_codes (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, code TEXT NOT NULL, valid_from TEXT NOT NULL, valid_until TEXT NOT NULL, linked_flight_id TEXT, parent_code TEXT, redeemed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS impressions (id TEXT PRIMARY KEY, screen_id TEXT NOT NULL, campaign_id TEXT NOT NULL, decision_id TEXT NOT NULL, at TEXT NOT NULL, pax_estimate INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS redemptions (id TEXT PRIMARY KEY, promo_code_id TEXT NOT NULL, campaign_id TEXT NOT NULL, at TEXT NOT NULL, segment TEXT NOT NULL, channel TEXT NOT NULL, value_cents INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, screen_id TEXT NOT NULL, zone_id TEXT NOT NULL, slot_at TEXT NOT NULL, winner_campaign_id TEXT, engine TEXT NOT NULL, winning_reason TEXT NOT NULL, crowd_profile TEXT NOT NULL, candidates TEXT NOT NULL, verification TEXT NOT NULL, evidence TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, entity_id TEXT NOT NULL, message TEXT NOT NULL, owner TEXT, raised_at TEXT NOT NULL, resolved_at TEXT);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE INDEX IF NOT EXISTS idx_flights_gate ON flights(gate);
CREATE INDEX IF NOT EXISTS idx_flights_zone ON flights(zone_id);
CREATE INDEX IF NOT EXISTS idx_decisions_screen ON decisions(screen_id, slot_at);
CREATE INDEX IF NOT EXISTS idx_impr_campaign ON impressions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_redemp_campaign ON redemptions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_promo_code ON promo_codes(code);
`;

export function openDb(dbPath: string): { db: DB; sqlite: Database.Database } {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** True when the core topology has not been seeded yet. */
export function isEmpty(sqlite: Database.Database): boolean {
  const row = sqlite.prepare("SELECT COUNT(*) AS n FROM screens").get() as { n: number };
  return row.n === 0;
}
