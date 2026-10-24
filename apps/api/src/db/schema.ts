/**
 * Drizzle schema (SQLite / better-sqlite3).
 *
 * Rich canonical sub-objects (segment weights, hard filters, placement, crowd
 * profiles, candidate lists, evidence trails) are stored as JSON text and typed
 * via `$type<...>()` so the repository layer round-trips the canonical model
 * from `@arm/core` without lossy flattening.
 */
import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  CampaignBudget,
  CampaignStatus,
  CampaignTrigger,
  CandidateScore,
  CrowdProfile,
  Evidence,
  FlightStatus,
  HardFilters,
  Placement,
  ScreenStatus,
  SegmentWeights,
  VerificationCheck,
} from "@arm/core";

const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const terminals = sqliteTable("terminals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  concourses: json<string[]>("concourses").notNull(),
});

export const zones = sqliteTable("zones", {
  id: text("id").primaryKey(),
  terminalId: text("terminal_id").notNull(),
  name: text("name").notNull(),
  gates: json<string[]>("gates").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
});

export const checkpoints = sqliteTable("checkpoints", {
  id: text("id").primaryKey(),
  zoneId: text("zone_id").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
});

export const aircraftTypes = sqliteTable("aircraft_types", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  seats: json<{ economy: number; premiumEconomy: number; business: number }>("seats").notNull(),
  totalSeats: integer("total_seats").notNull(),
});

export const flights = sqliteTable("flights", {
  id: text("id").primaryKey(),
  airlineCode: text("airline_code").notNull(),
  flightNumber: text("flight_number").notNull(),
  direction: text("direction").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  via: text("via"),
  domesticInternational: text("domestic_international").notNull(),
  aircraftTypeCode: text("aircraft_type_code").notNull(),
  paxCount: integer("pax_count").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  estimatedTime: text("estimated_time"),
  actualTime: text("actual_time"),
  tobt: text("tobt"),
  tsat: text("tsat"),
  aibt: text("aibt"),
  aobt: text("aobt"),
  stand: text("stand"),
  gate: text("gate"),
  checkInCounters: text("checkin_counters"),
  belt: text("belt"),
  status: text("status").$type<FlightStatus>().notNull(),
  delayCode: text("delay_code"),
  delayMinutes: integer("delay_minutes").notNull().default(0),
  terminalId: text("terminal_id").notNull(),
  zoneId: text("zone_id"),
  /** Per-flight crowd profile (mock-generated; real source later). */
  profile: json<CrowdProfile>("profile").notNull(),
});

export const flightEvents = sqliteTable("flight_events", {
  id: text("id").primaryKey(),
  flightId: text("flight_id").notNull(),
  type: text("type").notNull(),
  at: text("at").notNull(),
  change: json<Record<string, string | number>>("change").notNull(),
  evidence: json<Evidence>("evidence").notNull(),
});

export const queueMeasurements = sqliteTable("queue_measurements", {
  id: text("id").primaryKey(),
  checkpointId: text("checkpoint_id").notNull(),
  zoneId: text("zone_id").notNull(),
  at: text("at").notNull(),
  queueLength: integer("queue_length").notNull(),
  waitMinutes: real("wait_minutes").notNull(),
  throughputPerMin: real("throughput_per_min").notNull(),
});

export const advertisers = sqliteTable("advertisers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  airlineCode: text("airline_code"),
  category: text("category"),
});

export const outlets = sqliteTable("outlets", {
  id: text("id").primaryKey(),
  advertiserId: text("advertiser_id").notNull(),
  name: text("name").notNull(),
  zoneId: text("zone_id").notNull(),
  category: text("category").notNull(),
});

export const screens = sqliteTable("screens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  zoneId: text("zone_id").notNull(),
  nearestGates: json<string[]>("nearest_gates").notNull(),
  sizeInches: integer("size_inches").notNull(),
  orientation: text("orientation").notNull(),
  status: text("status").$type<ScreenStatus>().notNull(),
  lastSeen: text("last_seen").notNull(),
  latencyMs: integer("latency_ms").notNull(),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  advertiserId: text("advertiser_id").notNull(),
  name: text("name").notNull(),
  status: text("status").$type<CampaignStatus>().notNull(),
  brandSafe: integer("brand_safe", { mode: "boolean" }).notNull().default(true),
  competitorGroup: text("competitor_group"),
  segmentWeights: json<SegmentWeights>("segment_weights").notNull(),
  hardFilters: json<HardFilters>("hard_filters").notNull(),
  placement: json<Placement>("placement").notNull(),
  budget: json<CampaignBudget>("budget").notNull(),
  triggers: json<CampaignTrigger[]>("triggers").notNull(),
  creativeIds: json<string[]>("creative_ids").notNull(),
  priority: integer("priority").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const creatives = sqliteTable("creatives", {
  id: text("id").primaryKey(),
  advertiserId: text("advertiser_id").notNull(),
  name: text("name").notNull(),
  orientation: text("orientation").notNull(),
  template: text("template").notNull(),
  copy: json<Record<string, { headline: string; body: string; cta: string }>>("copy").notNull(),
  bgColor: text("bg_color").notNull(),
  fgColor: text("fg_color").notNull(),
  approvalStatus: text("approval_status").notNull(),
  aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(false),
});

export const promoCodes = sqliteTable("promo_codes", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  code: text("code").notNull(),
  validFrom: text("valid_from").notNull(),
  validUntil: text("valid_until").notNull(),
  linkedFlightId: text("linked_flight_id"),
  parentCode: text("parent_code"),
  redeemed: integer("redeemed", { mode: "boolean" }).notNull().default(false),
});

export const impressions = sqliteTable("impressions", {
  id: text("id").primaryKey(),
  screenId: text("screen_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  decisionId: text("decision_id").notNull(),
  at: text("at").notNull(),
  paxEstimate: integer("pax_estimate").notNull(),
});

export const redemptions = sqliteTable("redemptions", {
  id: text("id").primaryKey(),
  promoCodeId: text("promo_code_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  at: text("at").notNull(),
  segment: text("segment").notNull(),
  channel: text("channel").notNull(),
  valueCents: integer("value_cents").notNull(),
});

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  screenId: text("screen_id").notNull(),
  zoneId: text("zone_id").notNull(),
  slotAt: text("slot_at").notNull(),
  winnerCampaignId: text("winner_campaign_id"),
  engine: text("engine").notNull(),
  winningReason: text("winning_reason").notNull(),
  crowdProfile: json<CrowdProfile>("crowd_profile").notNull(),
  candidates: json<CandidateScore[]>("candidates").notNull(),
  verification: json<{ passed: boolean; fallbackUsed: boolean; checks: VerificationCheck[] }>(
    "verification",
  ).notNull(),
  evidence: json<Evidence[]>("evidence").notNull(),
  createdAt: text("created_at").notNull(),
});

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  entityId: text("entity_id").notNull(),
  message: text("message").notNull(),
  owner: text("owner"),
  raisedAt: text("raised_at").notNull(),
  resolvedAt: text("resolved_at"),
});

/** Small key/value store for simulation state and config. */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: json<unknown>("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
