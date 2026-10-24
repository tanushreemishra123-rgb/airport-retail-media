/**
 * Seed script. Generates the full fictional day + 30 days of campaign history
 * and writes it to SQLite. Safe to run via `npm run seed`; the server also
 * calls `seedIfEmpty` on boot so the deployed playground is always preconfigured.
 */
import { openDb, isEmpty, type DB } from "./index.js";
import { insertAll, kvSet } from "./repo.js";
import { generateAll } from "../data/generator.js";
import { generateCampaigns } from "../data/campaigns.js";
import type { Campaign } from "@arm/core";

export interface CampaignHistoryDay {
  date: string;
  impressions: number;
  redemptions: number;
  spendCents: number;
  revenueCents: number;
}

function historyFor(c: Campaign, idx: number): CampaignHistoryDay[] {
  const days: CampaignHistoryDay[] = [];
  let seed = (idx + 7) * 2654435761;
  const rnd = () => {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >>> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    return seed / 4294967296;
  };
  for (let d = 30; d >= 1; d--) {
    const date = new Date(Date.parse("2026-10-14T00:00:00Z") - d * 86400000).toISOString().slice(0, 10);
    const impressions = Math.round(1500 + rnd() * 6000);
    const redemptions = Math.round(impressions * (0.01 + rnd() * 0.04));
    const spendCents = Math.round(impressions * 1.2);
    const revenueCents = Math.round(redemptions * (800 + rnd() * 2500));
    days.push({ date, impressions, redemptions, spendCents, revenueCents });
  }
  return days;
}

export function seedDatabase(db: DB): void {
  const base = generateAll(450);
  const { campaigns, creatives, promoCodes } = generateCampaigns(base.advertisers);
  insertAll(db, { ...base, campaigns, creatives, promoCodes });
  campaigns.forEach((c, i) => kvSet(db, `history:${c.id}`, historyFor(c, i)));
  kvSet(db, "meta", { seededAt: new Date().toISOString(), airport: "MQI", day: "2026-10-14" });
}

export function seedIfEmpty(db: DB, sqlite: Parameters<typeof isEmpty>[0]): boolean {
  if (!isEmpty(sqlite)) return false;
  seedDatabase(db);
  return true;
}

// CLI entry: `npm run seed`
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""));
if (isMain) {
  const path = process.env.DB_PATH ?? "./data/arm.sqlite";
  const { db, sqlite } = openDb(path);
  const did = seedIfEmpty(db, sqlite);
  console.log(did ? `Seeded ${path}` : `${path} already seeded (skipped)`);
  sqlite.close();
}
