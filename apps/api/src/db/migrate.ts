/** Apply generated Drizzle migrations to DB_PATH (production path). The demo
 * boots with idempotent DDL instead; this exists for managed databases. */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const path = process.env.DB_PATH ?? "./data/arm.sqlite";
const { db, sqlite } = openDb(path);
migrate(db, { migrationsFolder: join(here, "../../drizzle") });
sqlite.close();
console.log(`Migrations applied to ${path}`);
