/**
 * Passenger presence — the core derived signal.
 *
 * A crowd profile is built per flight, then rolled up per screen and per
 * 5-minute window, weighted by how close each gate is to the screen and how
 * long until boarding. All outputs are aggregated shares, never per-person data.
 */
import type {
  AgeBand,
  CabinTier,
  CrowdProfile,
  Flight,
  PartyType,
  Screen,
  Shares,
  TripPurpose,
} from "./model.js";

/** Minutes between two ISO times (b - a). */
const minutesBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60000;

/**
 * Weight a flight contributes to a screen's catchment right now.
 *   proximity: 1.0 if the flight's gate is one of the screen's nearest gates,
 *              decaying for gates further away in the same zone.
 *   timing:    peaks in the ~45 min before boarding and fades after departure.
 * Returns 0 when the flight cannot plausibly be in front of the screen.
 */
export function catchmentWeight(
  flight: Flight,
  screen: Screen,
  now: string,
  gateDistance: (screenGates: string[], flightGate: string | null) => number,
): number {
  if (!flight.gate) return 0;
  if (flight.status === "departed" || flight.status === "cancelled") return 0;

  const dist = gateDistance(screen.nearestGates, flight.gate); // 0 = same gate
  if (dist < 0) return 0; // different zone / not reachable
  const proximity = 1 / (1 + dist); // 1, 0.5, 0.33, ...

  // Time to boarding: boarding ~ estimated/scheduled departure minus 40 min.
  const dep = flight.estimatedTime ?? flight.scheduledTime;
  const minsToDep = minutesBetween(now, dep);
  let timing: number;
  if (minsToDep > 120) timing = 0.1; // far out — few pax yet
  else if (minsToDep > 45) timing = 0.5; // gathering
  else if (minsToDep > 0) timing = 1.0; // peak dwell at the gate
  else if (minsToDep > -20) timing = 0.6; // boarding / just departed stragglers
  else timing = 0;

  return proximity * timing;
}

function blendShares<K extends string>(
  parts: Array<{ shares: Partial<Shares<K>>; weight: number }>,
  keys: readonly K[],
): Shares<K> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Shares<K>;
  let total = 0;
  for (const { shares, weight } of parts) {
    if (weight <= 0) continue;
    total += weight;
    for (const k of keys) out[k] += (shares[k] ?? 0) * weight;
  }
  if (total > 0) for (const k of keys) out[k] = out[k] / total;
  return out;
}

const TRIP: readonly TripPurpose[] = ["business", "holiday", "vff", "student", "religious"];
const PARTY: readonly PartyType[] = ["solo", "couple", "family", "group"];
const AGE: readonly AgeBand[] = ["u12", "12-17", "18-24", "25-34", "35-44", "45-54", "55+"];
const CABIN: readonly CabinTier[] = ["economy", "premiumEconomy", "business"];

export interface ProfileContribution {
  profile: CrowdProfile;
  /** catchment weight for this flight at this screen/window. */
  weight: number;
  /** passengers this flight contributes to the window. */
  pax: number;
}

/**
 * Roll up per-flight profiles into one screen/window crowd profile. Shares are
 * weighted by catchment weight; counts (paxNow/paxNext30) are summed.
 */
export function rollupProfile(contributions: ProfileContribution[]): CrowdProfile {
  const parts = contributions.map((c) => ({ p: c.profile, w: c.weight }));
  const w = (sel: (p: CrowdProfile) => number) => {
    let num = 0;
    let den = 0;
    for (const { p, w } of parts) {
      num += sel(p) * w;
      den += w;
    }
    return den > 0 ? num / den : 0;
  };

  const tripPurpose = blendShares(parts.map((x) => ({ shares: x.p.tripPurpose, weight: x.w })), TRIP);
  const partyType = blendShares(parts.map((x) => ({ shares: x.p.partyType, weight: x.w })), PARTY);
  const ageBand = blendShares(parts.map((x) => ({ shares: x.p.ageBand, weight: x.w })), AGE);
  const cabin = blendShares(parts.map((x) => ({ shares: x.p.cabin, weight: x.w })), CABIN);

  // Merge top-k lists by weighted share.
  const mergeTop = (
    sel: (p: CrowdProfile) => Array<{ code: string; share: number }>,
  ): Array<{ code: string; share: number }> => {
    const acc = new Map<string, number>();
    let den = 0;
    for (const { p, w } of parts) {
      den += w;
      for (const item of sel(p)) acc.set(item.code, (acc.get(item.code) ?? 0) + item.share * w);
    }
    return [...acc.entries()]
      .map(([code, s]) => ({ code, share: den > 0 ? s / den : 0 }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 3);
  };
  const mergeRegions = (): Array<{ region: string; share: number }> => {
    const acc = new Map<string, number>();
    let den = 0;
    for (const { p, w } of parts) {
      den += w;
      for (const item of p.destinationRegions)
        acc.set(item.region, (acc.get(item.region) ?? 0) + item.share * w);
    }
    return [...acc.entries()]
      .map(([region, s]) => ({ region, share: den > 0 ? s / den : 0 }))
      .sort((a, b) => b.share - a.share);
  };

  const paxNow = contributions.reduce((s, c) => s + c.pax, 0);
  const female = w((p) => p.gender.female);

  const timeOfDayVote = parts.sort((a, b) => b.w - a.w)[0]?.p.timeOfDay ?? "midday";
  const festival = parts.find((x) => x.p.festival)?.p.festival ?? null;

  return {
    tripPurpose,
    partyType,
    ageBand,
    gender: { female, male: 1 - female },
    cabin,
    frequentFlyerShare: w((p) => p.frequentFlyerShare),
    domesticShare: w((p) => p.domesticShare),
    internationalShare: w((p) => p.internationalShare),
    topNationalities: mergeTop((p) => p.topNationalities),
    topLanguages: mergeTop((p) => p.topLanguages),
    topDestinations: mergeTop((p) => p.topDestinations),
    destinationRegions: mergeRegions(),
    medianDwellMinutes: Math.round(w((p) => p.medianDwellMinutes)),
    maxDelayMinutes: Math.max(0, ...contributions.map((c) => c.profile.maxDelayMinutes)),
    timeOfDay: timeOfDayVote,
    festival,
    paxNow,
    paxNext30: Math.round(contributions.reduce((s, c) => s + c.profile.paxNext30 * (c.weight > 0 ? 1 : 0), 0)),
  };
}
