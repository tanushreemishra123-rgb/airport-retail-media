/**
 * Mock per-flight crowd profile generator.
 *
 * Deterministic (seeded by flight id) so a demo is reproducible, and plausible
 * per the spec: a weekday-morning domestic flight skews to business travellers
 * 25–44; a weekend holiday route skews to families and couples. All outputs are
 * aggregated shares — never anything about a person. A real deployment would
 * replace this with airline aggregated booking mix / APIS aggregates.
 */
import type {
  AgeBand,
  CabinTier,
  CrowdProfile,
  PartyType,
  Shares,
  TripPurpose,
} from "@arm/core";
import { AIRCRAFT_BY_CODE, AIRPORT_BY_CODE } from "./reference.js";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function norm<K extends string>(obj: Record<K, number>): Shares<K> {
  const total = Object.values<number>(obj).reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const out = {} as Shares<K>;
  for (const k of Object.keys(obj) as K[]) out[k] = Math.max(0, obj[k]) / total;
  return out;
}

const REGION_LANGS: Record<string, string[]> = {
  Gulf: ["ar", "en"],
  Europe: ["en", "de", "fr"],
  Asia: ["en", "zh", "ja"],
  Americas: ["en", "es", "pt"],
};
const REGION_NATS: Record<string, string[]> = {
  Gulf: ["AE", "SA", "QA"],
  Europe: ["GB", "DE", "FR"],
  Asia: ["CN", "JP", "SG"],
  Americas: ["US", "BR", "MX"],
};

export interface ProfileInput {
  flightId: string;
  direction: "departure" | "arrival";
  domestic: boolean;
  destination: string;
  scheduledTime: string;
  aircraftTypeCode: string;
  paxCount: number;
  delayMinutes: number;
  lowCost: boolean;
}

export function buildFlightProfile(f: ProfileInput): CrowdProfile {
  const rnd = mulberry32(seedFrom(f.flightId));
  const jitter = (base: number, spread: number) => base + (rnd() - 0.5) * spread;

  const d = new Date(f.scheduledTime);
  const hour = d.getUTCHours();
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const weekend = dow === 5 || dow === 6 || dow === 0;
  const dest = AIRPORT_BY_CODE.get(f.destination);
  const region = dest?.region ?? "Domestic";

  const timeOfDay: CrowdProfile["timeOfDay"] =
    hour < 6 ? "earlyMorning" : hour < 10 ? "morning" : hour < 14 ? "midday" : hour < 18 ? "afternoon" : hour < 22 ? "evening" : "night";

  // --- trip purpose ---
  const businessWindow = !weekend && ((hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 19));
  const leisureInternational = !f.domestic;
  const trip = norm<TripPurpose>({
    business: jitter(f.domestic ? (businessWindow ? 0.55 : 0.3) : 0.22, 0.1),
    holiday: jitter(leisureInternational ? (weekend ? 0.5 : 0.4) : weekend ? 0.35 : 0.2, 0.1),
    vff: jitter(0.2, 0.08),
    student: jitter(region === "Asia" || region === "Europe" ? 0.1 : 0.05, 0.04),
    religious: jitter(region === "Gulf" ? 0.08 : 0.03, 0.03),
  });

  // --- party type ---
  const familyLift = (weekend ? 0.15 : 0) + (f.domestic ? 0 : 0.05);
  const party = norm<PartyType>({
    solo: jitter(businessWindow ? 0.45 : 0.3, 0.1),
    couple: jitter(0.28 + (weekend ? 0.05 : 0), 0.08),
    family: jitter(0.18 + familyLift, 0.08),
    group: jitter(0.12, 0.06),
  });

  // --- age bands ---
  const age = norm<AgeBand>({
    u12: jitter(party.family * 0.4, 0.03),
    "12-17": jitter(party.family * 0.25, 0.03),
    "18-24": jitter(0.12 + (region === "Europe" ? 0.04 : 0), 0.04),
    "25-34": jitter(businessWindow ? 0.26 : 0.2, 0.05),
    "35-44": jitter(businessWindow ? 0.22 : 0.18, 0.05),
    "45-54": jitter(0.15, 0.04),
    "55+": jitter(leisureInternational ? 0.16 : 0.12, 0.05),
  });

  // --- cabin from aircraft seat mix + fare mix ---
  const ac = AIRCRAFT_BY_CODE.get(f.aircraftTypeCode);
  const seatTotal = ac?.totalSeats ?? 180;
  const seatBiz = (ac?.seats.business ?? 0) / seatTotal;
  const seatPrem = (ac?.seats.premiumEconomy ?? 0) / seatTotal;
  const fareLoadBiz = f.lowCost ? 0.3 : 1; // LCCs sell premium seats as economy
  const cabin = norm<CabinTier>({
    business: jitter(seatBiz * fareLoadBiz * (businessWindow ? 1.2 : 0.9), 0.03),
    premiumEconomy: jitter(seatPrem * fareLoadBiz, 0.03),
    economy: jitter(1 - seatBiz - seatPrem, 0.05),
  });

  const internationalShare = f.domestic ? jitter(0.05, 0.05) : jitter(0.95, 0.05);
  const intl = Math.max(0, Math.min(1, internationalShare));

  const langs = f.domestic ? ["en"] : (REGION_LANGS[region] ?? ["en"]);
  const nats = f.domestic ? ["MQ"] : (REGION_NATS[region] ?? ["MQ"]);
  const topShares = [0.5, 0.3, 0.2];

  const baseDwell = f.domestic ? 35 : 70;
  const medianDwellMinutes = Math.round(baseDwell + f.delayMinutes * 0.6 + jitter(0, 10));
  const female = Math.max(0.35, Math.min(0.65, jitter(0.5, 0.12)));

  return {
    tripPurpose: trip,
    partyType: party,
    ageBand: age,
    gender: { female, male: 1 - female },
    cabin,
    frequentFlyerShare: Math.max(0, Math.min(0.5, jitter(f.lowCost ? 0.1 : 0.25, 0.1))),
    domesticShare: 1 - intl,
    internationalShare: intl,
    topNationalities: nats.map((code, i) => ({ code, share: topShares[i] ?? 0.1 })),
    topLanguages: langs.map((code, i) => ({ code, share: topShares[i] ?? 0.1 })),
    topDestinations: [{ code: f.destination, share: 1 }],
    destinationRegions: [{ region, share: 1 }],
    medianDwellMinutes,
    maxDelayMinutes: f.delayMinutes,
    timeOfDay,
    festival: null,
    paxNow: f.paxCount,
    paxNext30: f.paxCount,
  };
}
