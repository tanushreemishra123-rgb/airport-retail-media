/**
 * Canonical internal data model.
 *
 * The application core NEVER sees a source format (AODB CSV, AIDX XML, ACRIS
 * NGSI-LD). Adapters translate every external shape into these types, so going
 * live means writing one new adapter and nothing else. Every field that comes
 * from a feed is traceable to an {@link Evidence} record, which is what lets the
 * decision pipeline reject anything that cannot be proven from measured data.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------
/** ISO-8601 timestamp in UTC, e.g. "2026-03-14T14:10:00Z". */
export type IsoTime = string;

export type Direction = "departure" | "arrival";
export type DomesticInternational = "domestic" | "international";

/** A measured data point with its provenance, used to gate every AI decision. */
export interface Evidence {
  source: FeedSource;
  entityType: string;
  entityId: string;
  /** When the underlying measurement was produced by the source. */
  observedAt: IsoTime;
  /** How stale the datum was when it was used, in milliseconds. */
  freshnessMs: number;
  /** The value that was relied upon (kept small and serialisable). */
  value: unknown;
}

export type FeedSource = "aodb" | "aidx" | "acris" | "platform";

// ---------------------------------------------------------------------------
// Flight domain (AODB + AIDX)
// ---------------------------------------------------------------------------
export interface AircraftType {
  code: string; // e.g. "A320", "B77W"
  name: string;
  seats: { economy: number; premiumEconomy: number; business: number };
  totalSeats: number;
}

export type FlightStatus =
  | "scheduled"
  | "estimated"
  | "boarding"
  | "departed"
  | "landed"
  | "delayed"
  | "cancelled"
  | "gate_closed";

/** A single flight leg in canonical form (from AODB, updated by AIDX events). */
export interface Flight {
  id: string; // stable leg id
  airlineCode: string; // IATA, fictional
  flightNumber: string; // e.g. "XY501"
  direction: Direction;
  origin: string; // IATA city/airport code
  destination: string;
  via: string | null; // connecting point, if any
  domesticInternational: DomesticInternational;
  aircraftTypeCode: string;
  paxCount: number;

  // Scheduling + A-CDM milestones
  scheduledTime: IsoTime; // SOBT/SIBT
  estimatedTime: IsoTime | null;
  actualTime: IsoTime | null;
  tobt: IsoTime | null; // target off-block
  tsat: IsoTime | null; // target start-up approval
  aibt: IsoTime | null; // actual in-block
  aobt: IsoTime | null; // actual off-block

  stand: string | null;
  gate: string | null;
  checkInCounters: string | null;
  belt: string | null;

  status: FlightStatus;
  delayCode: string | null; // IATA delay code
  delayMinutes: number;

  terminalId: string;
  zoneId: string | null; // gate's zone, when assigned

  /**
   * Aggregated crowd profile for this flight's passengers (mock-generated in
   * the POC; a real deployment sources it from airline aggregates / APIS).
   * Shares only — never per-person data.
   */
  profile: CrowdProfile;
}

/** Real-time flight-leg update (from IATA AIDX). */
export interface FlightEvent {
  id: string;
  flightId: string;
  type: "status_change" | "gate_change" | "delay" | "boarding" | "cancellation";
  at: IsoTime;
  /** Normalised change payload (e.g. {gate:"42"} or {delayMinutes:45}). */
  change: Record<string, string | number>;
  evidence: Evidence;
}

// ---------------------------------------------------------------------------
// Airport topology + passenger flow (ACRIS / FIWARE Smart Data Models)
// ---------------------------------------------------------------------------
export interface Terminal {
  id: string;
  name: string;
  concourses: string[];
}

export interface Zone {
  id: string;
  terminalId: string;
  name: string; // e.g. "Concourse A gates 40-45"
  gates: string[];
  /** Stylised floor-plan position for the network map (0..100 viewbox units). */
  x: number;
  y: number;
}

export interface Checkpoint {
  id: string;
  zoneId: string;
  type: "security" | "immigration" | "boarding" | "checkin";
  name: string;
}

export interface QueueMeasurement {
  id: string;
  checkpointId: string;
  zoneId: string;
  at: IsoTime;
  queueLength: number; // people
  waitMinutes: number;
  throughputPerMin: number;
}

// ---------------------------------------------------------------------------
// Platform-owned domain
// ---------------------------------------------------------------------------
export type AdvertiserType = "retailer" | "fnb" | "airline";

export interface Advertiser {
  id: string;
  name: string; // fictional
  type: AdvertiserType;
  airlineCode?: string; // when type === "airline"
  category?: string; // e.g. "duty-free", "coffee"
}

export interface Outlet {
  id: string;
  advertiserId: string;
  name: string;
  zoneId: string;
  category: string;
}

export type ScreenOrientation = "portrait" | "landscape"; // 9:16 | 16:9
export type ScreenStatus = "online" | "degraded" | "offline";

export interface Screen {
  id: string;
  name: string;
  zoneId: string;
  nearestGates: string[];
  sizeInches: number;
  orientation: ScreenOrientation;
  status: ScreenStatus;
  lastSeen: IsoTime;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Audience segmentation
// ---------------------------------------------------------------------------
export type TripPurpose = "business" | "holiday" | "vff" | "student" | "religious";
export type PartyType = "solo" | "couple" | "family" | "group";
export type AgeBand = "u12" | "12-17" | "18-24" | "25-34" | "35-44" | "45-54" | "55+";
export type CabinTier = "economy" | "premiumEconomy" | "business";

/** A normalised distribution over labels, shares summing to ~1. */
export type Shares<K extends string> = Record<K, number>;

/**
 * Aggregated crowd description. Built per flight, rolled up per screen and
 * 5-minute window. Shares only — never data about an individual.
 */
export interface CrowdProfile {
  tripPurpose: Shares<TripPurpose>;
  partyType: Shares<PartyType>;
  ageBand: Shares<AgeBand>;
  gender: { female: number; male: number };
  cabin: Shares<CabinTier>;
  frequentFlyerShare: number;
  domesticShare: number;
  internationalShare: number;
  topNationalities: Array<{ code: string; share: number }>;
  topLanguages: Array<{ code: string; share: number }>;
  topDestinations: Array<{ code: string; share: number }>;
  destinationRegions: Array<{ region: string; share: number }>;
  // Time context
  medianDwellMinutes: number;
  maxDelayMinutes: number;
  timeOfDay: "earlyMorning" | "morning" | "midday" | "afternoon" | "evening" | "night";
  festival: string | null;
  // Size
  paxNow: number;
  paxNext30: number;
}

/** Presence estimate per zone and 5-minute window (the core derived signal). */
export interface ZonePresence {
  zoneId: string;
  windowStart: IsoTime;
  windowEnd: IsoTime;
  paxNow: number;
  paxNext30: number;
  domesticShare: number;
  internationalShare: number;
  medianDwellMinutes: number;
  contributingFlights: Array<{ flightId: string; weight: number; paxContribution: number }>;
  evidence: Evidence[];
}

// ---------------------------------------------------------------------------
// Campaigns + targeting
// ---------------------------------------------------------------------------
export type CampaignStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "running"
  | "paused"
  | "completed"
  | "rejected";

/** Segment weights: how much each segment matters (0..1). */
export interface SegmentWeights {
  tripPurpose?: Partial<Shares<TripPurpose>>;
  partyType?: Partial<Shares<PartyType>>;
  ageBand?: Partial<Shares<AgeBand>>;
  cabin?: Partial<Shares<CabinTier>>;
  internationalPreference?: number; // weight toward international crowds
}

/** Hard filters: conditions that MUST hold or the campaign is dropped. */
export interface HardFilters {
  internationalOnly?: boolean;
  domesticOnly?: boolean;
  destinationRegionsIn?: string[];
  destinationsIn?: string[];
  minDwellMinutes?: number;
  minCrowdSize?: number;
}

export interface Placement {
  zoneIds: string[];
  screenIds: string[];
  gates: string[];
  scheduleStart: IsoTime;
  scheduleEnd: IsoTime;
  /** Hours of day the campaign may play (0..23); empty = any. */
  hoursOfDay: number[];
}

export interface CampaignBudget {
  totalCents: number;
  dailyCapCents: number;
  spentCents: number;
  /** Max plays per screen per rolling hour. */
  frequencyCapPerHour: number;
}

export type TriggerKind = "delay_over" | "gate_change" | "boarding_starts" | "festival_day";
export interface CampaignTrigger {
  kind: TriggerKind;
  /** e.g. minutes for delay_over. */
  threshold?: number;
  /** Multiplier applied to the score when the trigger fires. */
  boost: number;
}

export interface Campaign {
  id: string;
  advertiserId: string;
  name: string;
  status: CampaignStatus;
  brandSafe: boolean;
  competitorGroup: string | null; // e.g. "perfume" for competitor separation
  segmentWeights: SegmentWeights;
  hardFilters: HardFilters;
  placement: Placement;
  budget: CampaignBudget;
  triggers: CampaignTrigger[];
  creativeIds: string[];
  priority: number; // airline priority etc.
  createdAt: IsoTime;
}

export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected";

export interface Creative {
  id: string;
  advertiserId: string;
  name: string;
  orientation: ScreenOrientation;
  /** Template id used to render the ad page. */
  template: string;
  /** Localised ad copy; key is a BCP-47 language code. */
  copy: Record<string, { headline: string; body: string; cta: string }>;
  bgColor: string;
  fgColor: string;
  approvalStatus: ApprovalStatus;
  aiGenerated: boolean;
}

export interface PromoCode {
  id: string;
  campaignId: string;
  code: string;
  validFrom: IsoTime;
  validUntil: IsoTime;
  /** When set, the code expires when this flight's boarding closes. */
  linkedFlightId: string | null;
  parentCode: string | null; // share-to-family lineage
  redeemed: boolean;
}

export interface Impression {
  id: string;
  screenId: string;
  campaignId: string;
  decisionId: string;
  at: IsoTime;
  paxEstimate: number;
}

export interface Redemption {
  id: string;
  promoCodeId: string;
  campaignId: string;
  at: IsoTime;
  /** Dominant segment of the claiming crowd (for learning). */
  segment: string;
  channel: "qr";
  valueCents: number;
}

// ---------------------------------------------------------------------------
// Decision pipeline
// ---------------------------------------------------------------------------
export interface CandidateScore {
  campaignId: string;
  /** 0..1 audience match of the campaign's weights against the crowd. */
  audienceMatch: number;
  /** Multiplicative boosts applied (triggers, business rules). */
  boost: number;
  /** Final score = audienceMatch * boost, after rules. */
  finalScore: number;
  filtered: boolean;
  filterReason: string | null;
  /** Human-readable explanation of how the score was formed. */
  rationale: string;
}

export type VerificationCheckKind =
  | "evidence_exists"
  | "evidence_fresh"
  | "hard_rule"
  | "score_reproducible";

export interface VerificationCheck {
  kind: VerificationCheckKind;
  passed: boolean;
  detail: string;
}

export type DecisionEngine = "ai" | "rules";

/** A fully auditable ad decision for one screen and one slot. */
export interface Decision {
  id: string;
  screenId: string;
  zoneId: string;
  slotAt: IsoTime;
  windowStart: IsoTime;
  windowEnd: IsoTime;
  crowdProfile: CrowdProfile;
  candidates: CandidateScore[];
  winnerCampaignId: string | null;
  winningReason: string;
  engine: DecisionEngine; // "ai" if the verified AI pick won, else "rules" fallback
  aiProposedCampaignId: string | null;
  verification: {
    passed: boolean;
    fallbackUsed: boolean;
    checks: VerificationCheck[];
  };
  evidence: Evidence[];
  createdAt: IsoTime;
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "acknowledged" | "resolved";

export interface Incident {
  id: string;
  kind: "screen_offline" | "feed_lag" | "failed_creative" | "degraded_screen";
  severity: IncidentSeverity;
  status: IncidentStatus;
  entityId: string; // screen id, feed name, etc.
  message: string;
  owner: string | null;
  raisedAt: IsoTime;
  resolvedAt: IsoTime | null;
}
