/**
 * Repository: load the canonical dataset from the DB into the engine, persist
 * the generated seed, and record live redemptions. Column names mirror the
 * canonical field names, so rows round-trip with minimal mapping.
 */
import { sql } from "drizzle-orm";
import type { DB } from "./index.js";
import * as s from "./schema.js";
import type { EngineData } from "../sim/engine.js";
import type { Redemption } from "@arm/core";

function chunk<T>(arr: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function insertAll(db: DB, d: EngineData): void {
  const ins = <T>(table: Parameters<DB["insert"]>[0], rows: T[]) => {
    for (const c of chunk(rows)) if (c.length) db.insert(table).values(c as never).run();
  };
  ins(s.terminals, d.terminals);
  ins(s.zones, d.zones);
  ins(s.checkpoints, d.checkpoints);
  ins(s.screens, d.screens);
  ins(s.advertisers, d.advertisers);
  ins(s.outlets, d.outlets);
  ins(s.campaigns, d.campaigns);
  ins(s.creatives, d.creatives);
  ins(s.promoCodes, d.promoCodes);
  ins(s.flights, d.flights);
}

export function loadAll(db: DB): EngineData {
  return {
    terminals: db.select().from(s.terminals).all() as EngineData["terminals"],
    zones: db.select().from(s.zones).all() as EngineData["zones"],
    checkpoints: db.select().from(s.checkpoints).all() as EngineData["checkpoints"],
    screens: db.select().from(s.screens).all() as EngineData["screens"],
    advertisers: db.select().from(s.advertisers).all() as EngineData["advertisers"],
    outlets: db.select().from(s.outlets).all() as EngineData["outlets"],
    campaigns: db.select().from(s.campaigns).all() as EngineData["campaigns"],
    creatives: db.select().from(s.creatives).all() as EngineData["creatives"],
    promoCodes: db.select().from(s.promoCodes).all() as EngineData["promoCodes"],
    flights: db.select().from(s.flights).all() as EngineData["flights"],
  };
}

export function saveRedemption(db: DB, r: Redemption): void {
  db.insert(s.redemptions).values(r).run();
  db.update(s.promoCodes).set({ redeemed: true }).where(sql`id = ${r.promoCodeId}`).run();
}

export function kvSet(db: DB, key: string, value: unknown): void {
  db.insert(s.kv).values({ key, value }).onConflictDoUpdate({ target: s.kv.key, set: { value } }).run();
}

export function kvGet<T>(db: DB, key: string): T | null {
  const row = db.select().from(s.kv).where(sql`key = ${key}`).get();
  return row ? (row.value as T) : null;
}
