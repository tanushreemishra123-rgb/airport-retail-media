import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from the Drizzle schema. The embedded demo creates
// the schema idempotently on boot (zero setup); these migration files are for
// a managed database (e.g. Postgres/SQLite) in production.
//   npm run db:generate   # create a migration from schema changes
//   npm run db:migrate    # apply migrations to DB_PATH
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DB_PATH ?? "./data/arm.sqlite" },
});
