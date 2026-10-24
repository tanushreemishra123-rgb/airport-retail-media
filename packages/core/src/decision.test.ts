import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, audienceMatch, verify } from "./decision.js";
import type { Campaign, CrowdProfile, Screen, ZonePresence, Evidence } from "./model.js";

const now = "2026-03-14T14:10:00Z";

function profile(over: Partial<CrowdProfile> = {}): CrowdProfile {
  return {
    tripPurpose: { business: 0.22, holiday: 0.58, vff: 0.12, student: 0.05, religious: 0.03 },
    partyType: { solo: 0.3, couple: 0.28, family: 0.31, group: 0.11 },
    ageBand: { u12: 0.08, "12-17": 0.05, "18-24": 0.12, "25-34": 0.26, "35-44": 0.22, "45-54": 0.15, "55+": 0.12 },
    gender: { female: 0.52, male: 0.48 },
    cabin: { economy: 0.8, premiumEconomy: 0.12, business: 0.08 },
    frequentFlyerShare: 0.18,
    domesticShare: 0.43,
    internationalShare: 0.57,
    topNationalities: [{ code: "AE", share: 0.3 }],
    topLanguages: [{ code: "en", share: 0.6 }],
    topDestinations: [{ code: "DXB", share: 0.5 }],
    destinationRegions: [{ region: "Gulf", share: 0.5 }],
    medianDwellMinutes: 52,
    maxDelayMinutes: 45,
    timeOfDay: "afternoon",
    festival: null,
    paxNow: 420,
    paxNext30: 520,
    ...over,
  };
}

const evidence: Evidence[] = [
  { source: "aodb", entityType: "Flight", entityId: "XY501", observedAt: now, freshnessMs: 1000, value: { pax: 240 } },
  { source: "acris", entityType: "QueueMeasurement", entityId: "Q-A", observedAt: now, freshnessMs: 2000, value: { q: 30 } },
];

function presence(): ZonePresence {
  return {
    zoneId: "Z-A", windowStart: now, windowEnd: "2026-03-14T14:15:00Z",
    paxNow: 420, paxNext30: 520, domesticShare: 0.43, internationalShare: 0.57,
    medianDwellMinutes: 52, contributingFlights: [{ flightId: "XY501", weight: 1, paxContribution: 240 }],
    evidence,
  };
}

function screen(): Screen {
  return {
    id: "S-1", name: "Gate 42 L", zoneId: "Z-A", nearestGates: ["42"], sizeInches: 55,
    orientation: "landscape", status: "online", lastSeen: now, latencyMs: 40,
  };
}

function base(id: string, over: Partial<Campaign> = {}): Campaign {
  return {
    id, advertiserId: "ADV", name: id, status: "running", brandSafe: true,
    competitorGroup: null, segmentWeights: {}, hardFilters: {},
    placement: { zoneIds: [], screenIds: [], gates: [], scheduleStart: "2026-03-14T00:00:00Z", scheduleEnd: "2026-03-14T23:59:59Z", hoursOfDay: [] },
    budget: { totalCents: 1_000_00, dailyCapCents: 500_00, spentCents: 0, frequencyCapPerHour: 20 },
    triggers: [], creativeIds: [], priority: 1, createdAt: now,
    ...over,
  };
}

test("audience match is a reproducible weighted mean of targeted shares", () => {
  const perfume = base("perfume", {
    segmentWeights: { tripPurpose: { holiday: 1 }, ageBand: { "25-34": 0.5, "35-44": 0.5, "45-54": 0.5 }, internationalPreference: 1 },
  });
  const a = audienceMatch(perfume, profile());
  const b = audienceMatch(perfume, profile());
  assert.equal(a.match, b.match, "match must be deterministic");
  assert.ok(a.match > 0 && a.match <= 1);
});

test("worked example ordering: perfume (delay-boosted) beats toy beats lounge", () => {
  const perfume = base("perfume", {
    competitorGroup: "perfume",
    segmentWeights: { tripPurpose: { holiday: 1 }, ageBand: { "25-34": 1, "35-44": 1, "45-54": 1 }, internationalPreference: 1 },
    hardFilters: { internationalOnly: true },
    triggers: [{ kind: "delay_over", threshold: 30, boost: 1.5 }],
  });
  const toy = base("toy", { segmentWeights: { partyType: { family: 1 } } });
  const lounge = base("lounge", {
    segmentWeights: { tripPurpose: { business: 1 }, cabin: { business: 1 } },
    hardFilters: { minCrowdSize: 1000 }, // not enough crowd → filtered
  });
  const d = decide({
    screen: screen(), zoneId: "Z-A", slotAt: now, windowStart: now, windowEnd: "2026-03-14T14:15:00Z",
    crowdProfile: profile(), presence: presence(), campaigns: [perfume, toy, lounge],
    ruleContext: { recentPlaysByCampaign: {}, airlineBoardingActive: () => false, previousCompetitorGroup: null },
    maxFreshnessMs: { aodb: 60_000, acris: 60_000, aidx: 60_000 },
    now, makeId: () => "D-1",
  });
  assert.equal(d.winnerCampaignId, "perfume");
  assert.equal(d.engine, "ai");
  assert.ok(d.verification.passed);
  const lc = d.candidates.find((c) => c.campaignId === "lounge")!;
  assert.ok(lc.filtered && lc.filterReason === "min_crowd");
});

test("stale evidence fails verification → rule fallback engine", () => {
  const v = verify({
    evidence: [{ source: "aodb", entityType: "Flight", entityId: "X", observedAt: now, freshnessMs: 999_999, value: 1 }],
    maxFreshnessMs: { aodb: 60_000 },
    hardRulePassed: true, hardRuleDetail: "ok", reportedScore: 0.5, recomputedScore: 0.5,
  });
  assert.equal(v.passed, false);
  assert.ok(v.checks.some((c) => c.kind === "evidence_fresh" && !c.passed));
});

test("competitor separation blocks back-to-back same group", () => {
  const perfumeA = base("pA", { competitorGroup: "perfume", segmentWeights: { tripPurpose: { holiday: 1 } } });
  const d = decide({
    screen: screen(), zoneId: "Z-A", slotAt: now, windowStart: now, windowEnd: "2026-03-14T14:15:00Z",
    crowdProfile: profile(), presence: presence(), campaigns: [perfumeA],
    ruleContext: { recentPlaysByCampaign: {}, airlineBoardingActive: () => false, previousCompetitorGroup: "perfume" },
    maxFreshnessMs: { aodb: 60_000, acris: 60_000 },
    now, makeId: () => "D-2",
  });
  const c = d.candidates.find((x) => x.campaignId === "pA")!;
  assert.ok(c.filtered && c.filterReason?.startsWith("competitor_separation"));
});
