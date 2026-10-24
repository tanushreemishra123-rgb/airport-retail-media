/**
 * Simulation engine — the live heart of the platform.
 *
 * On every clock tick it: recomputes flight status from simulation time;
 * rebuilds per-zone passenger presence from flights + ACRIS queues; runs the
 * evidence-gated decision pipeline per online screen on a 15-second slot
 * cadence; records impressions/revenue; raises incidents; and emits deltas for
 * the WebSocket feed. Event injection (delay, gate change, screen offline)
 * takes effect on the next tick, so cause-and-effect lands within ~2 seconds.
 */
import { EventEmitter } from "node:events";
import {
  decide,
  rollupProfile,
  type Campaign,
  type CrowdProfile,
  type Creative,
  type Decision,
  type Evidence,
  type Flight,
  type FlightStatus,
  type Incident,
  type Outlet,
  type Advertiser,
  type ProfileContribution,
  type PromoCode,
  type Screen,
  type Terminal,
  type Zone,
  type ZonePresence,
  type Checkpoint,
} from "@arm/core";
import { MockAcrisSource } from "../adapters/acris.js";

const DAY_ISO = "2026-10-14";
const SLOT_MS = 15_000; // one ad slot = 15 simulation seconds
const BOARDING_LEAD_MIN = 40;
const GATE_CLOSE_MIN = 5;
const CPM_CENTS = 1200; // $12 per 1000 impressions (demo yield)
const FRESHNESS_LIMITS: Record<string, number> = { aodb: 900_000, aidx: 300_000, acris: 600_000 };

export interface EngineData {
  flights: Flight[];
  terminals: Terminal[];
  zones: Zone[];
  checkpoints: Checkpoint[];
  screens: Screen[];
  advertisers: Advertiser[];
  outlets: Outlet[];
  campaigns: Campaign[];
  creatives: Creative[];
  promoCodes: PromoCode[];
}

interface FeedHealth {
  source: string;
  lastMessageMs: number;
  messagesPerMin: number;
  lagInjected: boolean;
}

export interface InventoryPackage {
  id: string;
  name: string;
  zoneIds: string[];
  screenCount: number;
  predictedDailyImpressions: number;
  priceCents: number;
}

export interface CoMarketingOffer {
  id: string;
  retailerAdvertiserId: string;
  retailerName: string;
  airlineCode: string;
  description: string;
  accepted: boolean;
  createdAt: string;
}

export class SimEngine extends EventEmitter {
  flights = new Map<string, Flight>();
  screens = new Map<string, Screen>();
  campaigns = new Map<string, Campaign>();
  creatives = new Map<string, Creative>();
  promoCodes = new Map<string, PromoCode>();
  zones: Zone[] = [];
  terminals: Terminal[] = [];
  checkpoints: Checkpoint[] = [];
  outlets: Outlet[] = [];
  advertisers: Advertiser[] = [];

  presenceByZone = new Map<string, ZonePresence>();
  profileByZone = new Map<string, CrowdProfile>();
  currentDecision = new Map<string, Decision>(); // screenId -> playing decision
  decisionLog: Decision[] = []; // ring buffer (audit)
  incidents: Incident[] = [];

  private acris = new MockAcrisSource();
  private lastSlotMs = new Map<string, number>();
  private playsHistory = new Map<string, number[]>(); // `${screenId}:${campaignId}` -> sim ms list
  private prevGroup = new Map<string, string | null>(); // screenId -> last competitor group
  private feeds: Record<string, FeedHealth> = {
    aodb: { source: "aodb", lastMessageMs: 0, messagesPerMin: 320, lagInjected: false },
    aidx: { source: "aidx", lastMessageMs: 0, messagesPerMin: 48, lagInjected: false },
    acris: { source: "acris", lastMessageMs: 0, messagesPerMin: 90, lagInjected: false },
  };

  // live counters
  playsToday = 0;
  impressionsToday = 0;
  revenueTodayCents = 0;
  redemptionsToday = 0;
  perScreenImpr = new Map<string, number>();
  perCampaignImpr = new Map<string, number>();
  perCampaignRedemptions = new Map<string, number>();
  perOutletImpr = new Map<string, number>();
  perCreativeImpr = new Map<string, number>();
  packages = new Map<string, InventoryPackage>();
  offers: CoMarketingOffer[] = [];
  lastDecisionCycleMs = 0;
  private startedAtMs = Date.now();
  private decisionIdSeq = 0;

  load(d: EngineData): void {
    for (const f of d.flights) this.flights.set(f.id, { ...f });
    for (const s of d.screens) this.screens.set(s.id, { ...s });
    for (const c of d.campaigns) this.campaigns.set(c.id, { ...c, budget: { ...c.budget } });
    for (const c of d.creatives) this.creatives.set(c.id, c);
    for (const p of d.promoCodes) this.promoCodes.set(p.id, { ...p });
    this.zones = d.zones;
    this.terminals = d.terminals;
    this.checkpoints = d.checkpoints;
    this.outlets = d.outlets;
    this.advertisers = d.advertisers;
  }

  // ---- live flight status -------------------------------------------------
  private effectiveDeparture(f: Flight): number {
    const base = Date.parse(f.estimatedTime ?? f.scheduledTime);
    return base; // estimatedTime already includes delay from the feed
  }

  liveStatus(f: Flight, nowMs: number): FlightStatus {
    if (f.status === "cancelled") return "cancelled";
    const sched = Date.parse(f.scheduledTime);
    const eff = this.effectiveDeparture(f);
    if (f.direction === "arrival") {
      return nowMs >= eff ? "landed" : "scheduled";
    }
    const toDep = (eff - nowMs) / 60000;
    if (toDep > 180) return "scheduled";
    if (toDep <= 0) return "departed";
    if (toDep <= GATE_CLOSE_MIN) return "gate_closed";
    if (toDep <= BOARDING_LEAD_MIN) return "boarding";
    if (eff - sched >= 15 * 60000) return "delayed";
    return "estimated";
  }

  // ---- presence -----------------------------------------------------------
  private boardingTimingWeight(toDepMin: number): number {
    if (toDepMin > 120) return 0.1;
    if (toDepMin > BOARDING_LEAD_MIN) return 0.5;
    if (toDepMin > 0) return 1.0;
    if (toDepMin > -20) return 0.5;
    return 0;
  }

  computePresence(nowMs: number): void {
    const nowIso = new Date(nowMs).toISOString();
    // pax per zone for ACRIS queue derivation
    const paxByZone: Record<string, number> = {};
    const perZone = new Map<string, Array<ProfileContribution & { flightId: string }>>();
    const evidenceByZone = new Map<string, Evidence[]>();
    const next30ByZone: Record<string, number> = {};

    for (const f of this.flights.values()) {
      if (f.direction !== "departure" || !f.zoneId || f.status === "cancelled") continue;
      const status = this.liveStatus(f, nowMs);
      if (status === "departed" || status === "scheduled") continue;
      const eff = this.effectiveDeparture(f);
      const toDepMin = (eff - nowMs) / 60000;
      const w = this.boardingTimingWeight(toDepMin);
      if (w <= 0) continue;
      const contrib = perZone.get(f.zoneId) ?? [];
      contrib.push({ profile: f.profile, weight: w, pax: Math.round(f.paxCount * w), flightId: f.id });
      perZone.set(f.zoneId, contrib);
      paxByZone[f.zoneId] = (paxByZone[f.zoneId] ?? 0) + Math.round(f.paxCount * w);
      if (toDepMin <= 30 && toDepMin > 0) next30ByZone[f.zoneId] = (next30ByZone[f.zoneId] ?? 0) + f.paxCount;
      const freshness = this.feedFreshness("aodb", nowMs);
      const ev = evidenceByZone.get(f.zoneId) ?? [];
      ev.push({
        source: "aodb", entityType: "Flight", entityId: f.id, observedAt: nowIso,
        freshnessMs: freshness, value: { pax: f.paxCount, gate: f.gate, status },
      });
      evidenceByZone.set(f.zoneId, ev);
    }

    // Gate-less zones (retail plaza, duty-free hall) inherit a share of their
    // terminal's gate-zone crowd — passengers passing through to/from gates.
    for (const rz of this.zones) {
      if (rz.gates.length > 0) continue;
      const sibling: Array<ProfileContribution & { flightId: string }> = [];
      for (const gz of this.zones) {
        if (gz.terminalId !== rz.terminalId || gz.gates.length === 0) continue;
        for (const c of perZone.get(gz.id) ?? []) {
          sibling.push({ ...c, weight: c.weight * 0.4, pax: Math.round(c.pax * 0.4) });
        }
      }
      if (sibling.length) {
        perZone.set(rz.id, sibling);
        paxByZone[rz.id] = sibling.reduce((s, c) => s + c.pax, 0);
        const ev = sibling.map((c) => ({
          source: "aodb" as const, entityType: "Flight", entityId: c.flightId, observedAt: nowIso,
          freshnessMs: this.feedFreshness("aodb", nowMs), value: { passthrough: true },
        }));
        evidenceByZone.set(rz.id, ev);
      }
    }

    // ACRIS queue measurements as additional evidence
    const measures = this.acris.measure(nowIso, paxByZone);
    for (const m of measures) {
      const ev = evidenceByZone.get(m.zoneId);
      if (ev) ev.push({
        source: "acris", entityType: "QueueMeasurement", entityId: m.id, observedAt: nowIso,
        freshnessMs: this.feedFreshness("acris", nowMs), value: { queueLength: m.queueLength, waitMinutes: m.waitMinutes },
      });
    }

    this.presenceByZone.clear();
    this.profileByZone.clear();
    for (const z of this.zones) {
      const contrib = perZone.get(z.id) ?? [];
      const profile = contrib.length
        ? rollupProfile(contrib)
        : this.emptyProfile(nowMs);
      this.profileByZone.set(z.id, profile);
      const paxNow = Math.round(contrib.reduce((s, c) => s + c.pax, 0));
      this.presenceByZone.set(z.id, {
        zoneId: z.id,
        windowStart: nowIso,
        windowEnd: new Date(nowMs + SLOT_MS).toISOString(),
        paxNow,
        paxNext30: next30ByZone[z.id] ?? paxNow,
        domesticShare: profile.domesticShare,
        internationalShare: profile.internationalShare,
        medianDwellMinutes: profile.medianDwellMinutes,
        contributingFlights: contrib.map((c) => ({
          flightId: c.flightId, weight: c.weight, paxContribution: c.pax,
        })),
        evidence: evidenceByZone.get(z.id) ?? [],
      });
    }
  }

  private emptyProfile(nowMs: number): CrowdProfile {
    return this.flightProfileFallback(nowMs);
  }
  private flightProfileFallback(nowMs: number): CrowdProfile {
    const hour = new Date(nowMs).getUTCHours();
    const timeOfDay: CrowdProfile["timeOfDay"] =
      hour < 6 ? "earlyMorning" : hour < 10 ? "morning" : hour < 14 ? "midday" : hour < 18 ? "afternoon" : hour < 22 ? "evening" : "night";
    return {
      tripPurpose: { business: 0.2, holiday: 0.4, vff: 0.25, student: 0.1, religious: 0.05 },
      partyType: { solo: 0.3, couple: 0.3, family: 0.25, group: 0.15 },
      ageBand: { u12: 0.08, "12-17": 0.06, "18-24": 0.14, "25-34": 0.24, "35-44": 0.2, "45-54": 0.16, "55+": 0.12 },
      gender: { female: 0.5, male: 0.5 },
      cabin: { economy: 0.85, premiumEconomy: 0.1, business: 0.05 },
      frequentFlyerShare: 0.15,
      domesticShare: 0.5, internationalShare: 0.5,
      topNationalities: [], topLanguages: [], topDestinations: [], destinationRegions: [],
      medianDwellMinutes: 30, maxDelayMinutes: 0, timeOfDay, festival: null, paxNow: 0, paxNext30: 0,
    };
  }

  // ---- feed health --------------------------------------------------------
  private feedFreshness(source: string, nowMs: number): number {
    const f = this.feeds[source];
    if (!f) return 0;
    return Math.max(0, nowMs - f.lastMessageMs);
  }

  // ---- decisions ----------------------------------------------------------
  private prunePlays(key: string, nowMs: number): number[] {
    const list = (this.playsHistory.get(key) ?? []).filter((t) => nowMs - t < 3_600_000);
    this.playsHistory.set(key, list);
    return list;
  }

  runDecisions(nowMs: number, force = false): Decision[] {
    const cycleStart = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const updated: Decision[] = [];
    const campaignList = [...this.campaigns.values()];
    for (const screen of this.screens.values()) {
      if (screen.status === "offline") {
        this.currentDecision.delete(screen.id);
        continue;
      }
      const last = this.lastSlotMs.get(screen.id) ?? -Infinity;
      if (!force && nowMs - last < SLOT_MS) continue;
      this.lastSlotMs.set(screen.id, nowMs);

      const presence = this.presenceByZone.get(screen.zoneId);
      if (!presence) continue;
      const profile = this.profileByZone.get(screen.zoneId) ?? this.flightProfileFallback(nowMs);

      const recentPlaysByCampaign: Record<string, number> = {};
      for (const c of campaignList) {
        recentPlaysByCampaign[c.id] = this.prunePlays(`${screen.id}:${c.id}`, nowMs).length;
      }

      const decision = decide({
        screen,
        zoneId: screen.zoneId,
        slotAt: nowIso,
        windowStart: presence.windowStart,
        windowEnd: presence.windowEnd,
        crowdProfile: profile,
        presence,
        campaigns: campaignList,
        ruleContext: {
          recentPlaysByCampaign,
          airlineBoardingActive: (c) => this.airlineBoardingActive(c, nowMs),
          previousCompetitorGroup: this.prevGroup.get(screen.id) ?? null,
        },
        maxFreshnessMs: FRESHNESS_LIMITS,
        now: nowIso,
        makeId: () => `DEC-${(++this.decisionIdSeq).toString(36)}-${Date.parse(nowIso).toString(36)}`,
      });

      this.currentDecision.set(screen.id, decision);
      this.pushLog(decision);
      updated.push(decision);

      if (decision.winnerCampaignId) {
        const c = this.campaigns.get(decision.winnerCampaignId);
        this.prevGroup.set(screen.id, c?.competitorGroup ?? null);
        this.playsHistory.get(`${screen.id}:${decision.winnerCampaignId}`)!.push(nowMs);
        this.recordImpression(screen, decision, presence.paxNow, c);
      } else {
        this.prevGroup.set(screen.id, null);
      }
    }
    this.lastDecisionCycleMs = Date.now() - cycleStart;
    return updated;
  }

  private contributionsForZone(zoneId: string, nowMs: number): ProfileContribution[] {
    const out: ProfileContribution[] = [];
    for (const f of this.flights.values()) {
      if (f.direction !== "departure" || f.zoneId !== zoneId || f.status === "cancelled") continue;
      const eff = this.effectiveDeparture(f);
      const toDepMin = (eff - nowMs) / 60000;
      const w = this.boardingTimingWeight(toDepMin);
      if (w > 0) out.push({ profile: f.profile, weight: w, pax: Math.round(f.paxCount * w) });
    }
    return out;
  }

  private airlineBoardingActive(c: Campaign, nowMs: number): boolean {
    const adv = this.advertisers.find((a) => a.id === c.advertiserId);
    if (!adv || adv.type !== "airline" || !adv.airlineCode) return false;
    for (const f of this.flights.values()) {
      if (f.airlineCode !== adv.airlineCode || f.direction !== "departure") continue;
      const status = this.liveStatus(f, nowMs);
      if (status === "boarding" || status === "gate_closed") return true;
    }
    return false;
  }

  private recordImpression(screen: Screen, decision: Decision, pax: number, c: Campaign | undefined): void {
    const est = Math.max(1, Math.round(pax));
    this.playsToday += 1;
    this.impressionsToday += est;
    this.perScreenImpr.set(screen.id, (this.perScreenImpr.get(screen.id) ?? 0) + est);
    if (c) {
      const rev = Math.round((CPM_CENTS * est) / 1000);
      this.revenueTodayCents += rev;
      c.budget.spentCents += rev;
      this.perCampaignImpr.set(c.id, (this.perCampaignImpr.get(c.id) ?? 0) + est);
      const outlet = this.outlets.find((o) => o.advertiserId === c.advertiserId);
      if (outlet) this.perOutletImpr.set(outlet.id, (this.perOutletImpr.get(outlet.id) ?? 0) + est);
      // A/B: attribute the impression to variant A or B by the configured split.
      const toB = c.variantCreativeId && Math.random() < (c.abSplit ?? 0);
      const creativeId = toB ? c.variantCreativeId! : c.creativeIds[0];
      if (creativeId) this.perCreativeImpr.set(creativeId, (this.perCreativeImpr.get(creativeId) ?? 0) + est);
    }
  }

  private pushLog(d: Decision): void {
    this.decisionLog.push(d);
    if (this.decisionLog.length > 5000) this.decisionLog.splice(0, this.decisionLog.length - 5000);
  }

  // ---- main tick ----------------------------------------------------------
  tick(nowIso: string): void {
    const nowMs = Date.parse(nowIso);
    for (const feed of Object.values(this.feeds)) {
      if (!feed.lagInjected) feed.lastMessageMs = nowMs;
    }
    this.computePresence(nowMs);
    const updated = this.runDecisions(nowMs);
    this.detectIncidents(nowMs);
    this.emit("delta", {
      now: nowIso,
      kpis: this.kpis(),
      updatedScreens: updated.map((d) => ({ screenId: d.screenId, winnerCampaignId: d.winnerCampaignId, engine: d.engine })),
      presence: [...this.presenceByZone.values()].map((p) => ({ zoneId: p.zoneId, paxNow: p.paxNow })),
    });
  }

  // ---- incidents ----------------------------------------------------------
  private detectIncidents(nowMs: number): void {
    for (const s of this.screens.values()) {
      if (s.status === "offline") {
        const existing = this.incidents.find((i) => i.entityId === s.id && i.status !== "resolved");
        if (!existing) {
          this.incidents.push({
            id: `INC-${this.incidents.length + 1}`, kind: "screen_offline", severity: "high",
            status: "open", entityId: s.id, message: `${s.name} offline`, owner: null,
            raisedAt: new Date(nowMs).toISOString(), resolvedAt: null,
          });
        }
      }
    }
    for (const feed of Object.values(this.feeds)) {
      if (feed.lagInjected) {
        const existing = this.incidents.find((i) => i.entityId === feed.source && i.status !== "resolved");
        if (!existing) {
          this.incidents.push({
            id: `INC-${this.incidents.length + 1}`, kind: "feed_lag", severity: "critical",
            status: "open", entityId: feed.source, message: `${feed.source.toUpperCase()} feed lagging`,
            owner: null, raisedAt: new Date(nowMs).toISOString(), resolvedAt: null,
          });
        }
      }
    }
  }

  // ---- event injection ----------------------------------------------------
  injectDelay(flightId: string, minutes: number): boolean {
    const f = this.flights.get(flightId);
    if (!f) return false;
    const base = Date.parse(f.estimatedTime ?? f.scheduledTime);
    f.estimatedTime = new Date(base + minutes * 60000).toISOString();
    f.delayMinutes += minutes;
    f.status = "delayed";
    f.profile = { ...f.profile, maxDelayMinutes: f.delayMinutes, medianDwellMinutes: f.profile.medianDwellMinutes + Math.round(minutes * 0.6) };
    this.emit("event", { type: "delay", flightId, minutes });
    return true;
  }

  injectGateChange(flightId: string, gate: string, zoneId: string): boolean {
    const f = this.flights.get(flightId);
    if (!f) return false;
    f.gate = gate;
    f.zoneId = zoneId;
    this.emit("event", { type: "gate_change", flightId, gate });
    return true;
  }

  injectScreenOffline(screenId: string, offline = true): boolean {
    const s = this.screens.get(screenId);
    if (!s) return false;
    s.status = offline ? "offline" : "online";
    if (!offline) {
      for (const i of this.incidents) if (i.entityId === screenId && i.status !== "resolved") { i.status = "resolved"; i.resolvedAt = new Date().toISOString(); }
    }
    this.emit("event", { type: "screen_offline", screenId, offline });
    return true;
  }

  injectFeedLag(source: string, lag: boolean): boolean {
    const f = this.feeds[source];
    if (!f) return false;
    f.lagInjected = lag;
    if (!lag) for (const i of this.incidents) if (i.entityId === source && i.status !== "resolved") { i.status = "resolved"; i.resolvedAt = new Date().toISOString(); }
    return true;
  }

  // ---- redemption (QR claim) ---------------------------------------------
  redeem(code: string, nowIso: string): { ok: boolean; campaignId?: string } {
    const promo = [...this.promoCodes.values()].find((p) => p.code === code);
    if (!promo) return { ok: false };
    const c = this.campaigns.get(promo.campaignId);
    this.redemptionsToday += 1;
    this.perCampaignRedemptions.set(promo.campaignId, (this.perCampaignRedemptions.get(promo.campaignId) ?? 0) + 1);
    this.emit("redeem", { code, campaignId: promo.campaignId, at: nowIso });
    return { ok: true, campaignId: c?.id };
  }

  // ---- master data (create/edit) -----------------------------------------
  upsertScreen(data: Partial<Screen> & { id?: string }): Screen {
    const id = data.id && this.screens.has(data.id) ? data.id : `SCR-${String(this.screens.size + 1).padStart(4, "0")}`;
    const existing = this.screens.get(id);
    const screen: Screen = {
      id,
      name: data.name ?? existing?.name ?? id,
      zoneId: data.zoneId ?? existing?.zoneId ?? this.zones[0]!.id,
      nearestGates: data.nearestGates ?? existing?.nearestGates ?? [],
      sizeInches: data.sizeInches ?? existing?.sizeInches ?? 55,
      orientation: data.orientation ?? existing?.orientation ?? "landscape",
      status: data.status ?? existing?.status ?? "online",
      lastSeen: existing?.lastSeen ?? new Date().toISOString(),
      latencyMs: data.latencyMs ?? existing?.latencyMs ?? 40,
    };
    this.screens.set(id, screen);
    return screen;
  }

  upsertOutlet(data: Partial<Outlet> & { id?: string }): Outlet {
    const id = data.id && this.outlets.find((o) => o.id === data.id) ? data.id : `OUT-${String(this.outlets.length + 1).padStart(3, "0")}`;
    const idx = this.outlets.findIndex((o) => o.id === id);
    const base = idx >= 0 ? this.outlets[idx]! : null;
    const outlet: Outlet = {
      id,
      advertiserId: data.advertiserId ?? base?.advertiserId ?? "",
      name: data.name ?? base?.name ?? id,
      zoneId: data.zoneId ?? base?.zoneId ?? this.zones[0]!.id,
      category: data.category ?? base?.category ?? "retail",
    };
    if (idx >= 0) this.outlets[idx] = outlet; else this.outlets.push(outlet);
    return outlet;
  }

  setStock(campaignId: string, available: boolean): boolean {
    const c = this.campaigns.get(campaignId);
    if (!c) return false;
    c.stockAvailable = available;
    return true;
  }

  // ---- inventory packages (media) -----------------------------------------
  createPackage(name: string, zoneIds: string[], priceCents: number): InventoryPackage {
    const screensIn = [...this.screens.values()].filter((s) => zoneIds.includes(s.zoneId));
    const predicted = Math.round(screensIn.length * 1800 * (zoneIds.some((z) => z.startsWith("T2")) ? 1.4 : 1));
    const pkg: InventoryPackage = {
      id: `PKG-${this.packages.size + 1}`, name, zoneIds,
      screenCount: screensIn.length, predictedDailyImpressions: predicted, priceCents,
    };
    this.packages.set(pkg.id, pkg);
    return pkg;
  }

  // ---- co-marketing offers (airline/retailer) -----------------------------
  createOffer(retailerAdvertiserId: string, airlineCode: string, description: string): CoMarketingOffer {
    const name = this.advertisers.find((a) => a.id === retailerAdvertiserId)?.name ?? retailerAdvertiserId;
    const offer: CoMarketingOffer = {
      id: `OFF-${this.offers.length + 1}`, retailerAdvertiserId, retailerName: name,
      airlineCode, description, accepted: false, createdAt: new Date().toISOString(),
    };
    this.offers.push(offer);
    return offer;
  }
  acceptOffer(id: string): boolean {
    const o = this.offers.find((x) => x.id === id);
    if (!o) return false;
    o.accepted = true;
    return true;
  }

  // ---- airline gate-area messaging ----------------------------------------
  scheduleGateMessage(airlineCode: string, zoneIds: string[], headline: string, body: string): Campaign {
    const adv = this.advertisers.find((a) => a.type === "airline" && a.airlineCode === airlineCode);
    const advId = adv?.id ?? `ADV-AL-${airlineCode}`;
    const id = `CMP-GATE-${this.campaigns.size + 1}`;
    const creativeId = `CRE-GATE-${this.creatives.size + 1}`;
    this.creatives.set(creativeId, {
      id: creativeId, advertiserId: advId, name: `${airlineCode} gate message`, orientation: "landscape",
      template: "promo-hero", copy: { en: { headline, body, cta: "At the gate" } },
      bgColor: "#0a2342", fgColor: "#e6f0ff", approvalStatus: "approved", aiGenerated: false,
    });
    const now = new Date().toISOString();
    const campaign: Campaign = {
      id, advertiserId: advId, name: `${airlineCode} — ${headline}`.slice(0, 60), status: "running",
      brandSafe: true, competitorGroup: null, segmentWeights: { cabin: { business: 0.5, premiumEconomy: 0.8 } },
      hardFilters: {}, placement: { zoneIds, screenIds: [], gates: [], scheduleStart: `${DAY_ISO}T00:00:00Z`, scheduleEnd: `${DAY_ISO}T23:59:59Z`, hoursOfDay: [] },
      budget: { totalCents: 2_000_00, dailyCapCents: 2_000_00, spentCents: 0, frequencyCapPerHour: 20 },
      triggers: [{ kind: "boarding_starts", boost: 1.5 }], creativeIds: [creativeId], priority: 3, createdAt: now,
    };
    this.campaigns.set(id, campaign);
    return campaign;
  }

  // ---- performance panel --------------------------------------------------
  performance() {
    const lat = [...this.screens.values()].map((s) => s.latencyMs).sort((a, b) => a - b);
    const p = (q: number) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * q))]! : 0;
    const uptime = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, pct: Math.round((99.2 + Math.sin(i) * 0.4) * 10) / 10 }));
    return {
      apiP50Ms: p(0.5), apiP95Ms: p(0.95), apiP99Ms: p(0.99),
      playlistBuildMs: this.lastDecisionCycleMs,
      uptime7d: uptime,
      processUptimeS: Math.round((Date.now() - this.startedAtMs) / 1000),
    };
  }

  // ---- metrics ------------------------------------------------------------
  kpis() {
    const screens = [...this.screens.values()];
    const online = screens.filter((s) => s.status === "online").length;
    const avgLatency = Math.round(screens.reduce((s, x) => s + x.latencyMs, 0) / Math.max(1, screens.length));
    return {
      screensOnlinePct: Math.round((online / Math.max(1, screens.length)) * 100),
      screensOnline: online,
      screensTotal: screens.length,
      adPlaysToday: this.playsToday,
      impressionsToday: this.impressionsToday,
      revenueTodayCents: this.revenueTodayCents,
      activeCampaigns: [...this.campaigns.values()].filter((c) => c.status === "running").length,
      avgScreenLatencyMs: avgLatency,
      redemptionsToday: this.redemptionsToday,
      openIncidents: this.incidents.filter((i) => i.status !== "resolved").length,
    };
  }

  feedHealth() {
    return Object.values(this.feeds).map((f) => ({
      source: f.source,
      messagesPerMin: f.lagInjected ? 0 : f.messagesPerMin,
      lastMessageMs: f.lastMessageMs,
      lagInjected: f.lagInjected,
    }));
  }
}
