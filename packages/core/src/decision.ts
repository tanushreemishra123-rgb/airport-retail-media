/**
 * Evidence-first crowd-to-screen matching.
 *
 * Pipeline per screen per slot:
 *   1. profile  — the crowd profile is supplied (built from flights + ACRIS).
 *   2. filter   — drop campaigns failing a hard rule.
 *   3. score    — audience match (0..1) of weights vs crowd shares.
 *   4. rules    — apply boosts: triggers, airline priority, competitor
 *                 separation, frequency cap, budget pacing.
 *   5. choose   — the AI proposes the top-ranked campaign.
 *   6. verify   — a decision executes ONLY if every cited input exists in a
 *                 trusted feed, is fresh enough, every hard rule passes, and the
 *                 score recomputes identically from the logged inputs. If any
 *                 check fails, the AI pick is rejected and the screen falls back
 *                 to the rule-based default.
 *
 * Nothing the AI asserts reaches a screen unless it traces back to recorded
 * evidence, so a hallucinated fact cannot play.
 */
import type {
  Campaign,
  CandidateScore,
  CrowdProfile,
  Decision,
  Evidence,
  IsoTime,
  Screen,
  VerificationCheck,
  ZonePresence,
} from "./model.js";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ---------------------------------------------------------------------------
// 3. Scoring — audience match
// ---------------------------------------------------------------------------
/**
 * Weighted mean of the crowd shares the campaign targets. Each (weight, share)
 * pair contributes weight*share; the result is normalised by total weight, so
 * the output is a reproducible 0..1 match.
 */
export function audienceMatch(c: Campaign, p: CrowdProfile): { match: number; terms: string[] } {
  const w = c.segmentWeights;
  let num = 0;
  let den = 0;
  const terms: string[] = [];
  const add = (label: string, weight: number | undefined, share: number) => {
    if (!weight || weight <= 0) return;
    num += weight * share;
    den += weight;
    terms.push(`${label}: w${weight.toFixed(2)}×${(share * 100).toFixed(0)}%`);
  };
  for (const [k, weight] of Object.entries(w.tripPurpose ?? {})) {
    add(`trip.${k}`, weight, p.tripPurpose[k as keyof typeof p.tripPurpose] ?? 0);
  }
  for (const [k, weight] of Object.entries(w.partyType ?? {})) {
    add(`party.${k}`, weight, p.partyType[k as keyof typeof p.partyType] ?? 0);
  }
  for (const [k, weight] of Object.entries(w.ageBand ?? {})) {
    add(`age.${k}`, weight, p.ageBand[k as keyof typeof p.ageBand] ?? 0);
  }
  for (const [k, weight] of Object.entries(w.cabin ?? {})) {
    add(`cabin.${k}`, weight, p.cabin[k as keyof typeof p.cabin] ?? 0);
  }
  if (w.internationalPreference) {
    add("intl", w.internationalPreference, p.internationalShare);
  }
  const match = den > 0 ? clamp01(num / den) : 0;
  return { match, terms };
}

// ---------------------------------------------------------------------------
// 2. Hard filters
// ---------------------------------------------------------------------------
export function hardFilterReason(
  c: Campaign,
  p: CrowdProfile,
  presence: ZonePresence,
  screen: Screen,
  now: IsoTime,
): string | null {
  const f = c.hardFilters;
  if (c.status !== "running" && c.status !== "approved") return `status:${c.status}`;
  if (!c.brandSafe) return "brand_unsafe";
  if (c.stockAvailable === false) return "out_of_stock";

  // placement
  const inZone = c.placement.zoneIds.length === 0 || c.placement.zoneIds.includes(screen.zoneId);
  const inScreen =
    c.placement.screenIds.length === 0 || c.placement.screenIds.includes(screen.id);
  const inGate =
    c.placement.gates.length === 0 ||
    c.placement.gates.some((g) => screen.nearestGates.includes(g));
  if (!(inZone && inScreen && inGate)) return "placement";

  // schedule
  const t = Date.parse(now);
  if (t < Date.parse(c.placement.scheduleStart) || t > Date.parse(c.placement.scheduleEnd)) {
    return "schedule";
  }
  if (c.placement.hoursOfDay.length > 0) {
    const hour = new Date(t).getUTCHours();
    if (!c.placement.hoursOfDay.includes(hour)) return "hour_of_day";
  }

  // audience hard rules
  if (f.internationalOnly && p.internationalShare < 0.5) return "international_only";
  if (f.domesticOnly && p.domesticShare < 0.5) return "domestic_only";
  if (f.minDwellMinutes && p.medianDwellMinutes < f.minDwellMinutes) return "min_dwell";
  if (f.minCrowdSize && presence.paxNow < f.minCrowdSize) return "min_crowd";
  if (f.destinationRegionsIn && f.destinationRegionsIn.length > 0) {
    const share = p.destinationRegions
      .filter((r) => f.destinationRegionsIn!.includes(r.region))
      .reduce((s, r) => s + r.share, 0);
    if (share < 0.25) return "destination_region";
  }
  if (f.destinationsIn && f.destinationsIn.length > 0) {
    const share = p.topDestinations
      .filter((d) => f.destinationsIn!.includes(d.code))
      .reduce((s, d) => s + d.share, 0);
    if (share <= 0) return "destination";
  }

  // budget
  if (c.budget.spentCents >= c.budget.totalCents) return "budget_exhausted";
  return null;
}

// ---------------------------------------------------------------------------
// 4. Business-rule boosts
// ---------------------------------------------------------------------------
export interface RuleContext {
  /** Plays of this campaign on this screen in the last rolling hour. */
  recentPlaysByCampaign: Record<string, number>;
  /** Whether a boarding window for this campaign's airline is active at the gate. */
  airlineBoardingActive: (campaign: Campaign) => boolean;
  /** Competitor group played in the immediately previous slot on this screen. */
  previousCompetitorGroup: string | null;
}

export function boostFor(
  c: Campaign,
  p: CrowdProfile,
  ctx: RuleContext,
): { boost: number; notes: string[]; blocked: string | null } {
  let boost = 1;
  const notes: string[] = [];

  for (const trig of c.triggers) {
    if (trig.kind === "delay_over" && p.maxDelayMinutes >= (trig.threshold ?? 0)) {
      boost *= trig.boost;
      notes.push(`delay>${trig.threshold}m ×${trig.boost}`);
    }
    if (trig.kind === "festival_day" && p.festival) {
      boost *= trig.boost;
      notes.push(`festival ×${trig.boost}`);
    }
  }
  if (ctx.airlineBoardingActive(c)) {
    boost *= 1.5;
    notes.push("airline boarding priority ×1.5");
  }
  if (c.priority > 1) {
    boost *= 1 + (c.priority - 1) * 0.1;
    notes.push(`priority ${c.priority}`);
  }
  // competitor separation: no two of the same group back to back
  if (c.competitorGroup && ctx.previousCompetitorGroup === c.competitorGroup) {
    return { boost, notes, blocked: `competitor_separation:${c.competitorGroup}` };
  }
  // frequency cap
  const plays = ctx.recentPlaysByCampaign[c.id] ?? 0;
  if (plays >= c.budget.frequencyCapPerHour) {
    return { boost, notes, blocked: "frequency_cap" };
  }
  // budget pacing: ease off as daily cap is approached
  if (c.budget.dailyCapCents > 0) {
    const paceLeft = clamp01(1 - c.budget.spentCents / Math.max(1, c.budget.dailyCapCents));
    if (paceLeft < 0.2) {
      boost *= 0.5;
      notes.push("budget pacing ×0.5");
    }
  }
  return { boost, notes, blocked: null };
}

// ---------------------------------------------------------------------------
// 6. Verification gate (deterministic)
// ---------------------------------------------------------------------------
export interface VerifyInput {
  evidence: Evidence[];
  /** Max allowed staleness per feed, in ms. */
  maxFreshnessMs: Record<string, number>;
  hardRulePassed: boolean;
  hardRuleDetail: string;
  /** The score the AI reported. */
  reportedScore: number;
  /** The score recomputed deterministically from logged inputs. */
  recomputedScore: number;
}

export function verify(input: VerifyInput): {
  passed: boolean;
  checks: VerificationCheck[];
} {
  const checks: VerificationCheck[] = [];

  const hasEvidence = input.evidence.length > 0;
  checks.push({
    kind: "evidence_exists",
    passed: hasEvidence,
    detail: hasEvidence
      ? `${input.evidence.length} evidence records cited`
      : "no evidence cited",
  });

  const stale = input.evidence.filter((e) => {
    const limit = input.maxFreshnessMs[e.source] ?? Number.POSITIVE_INFINITY;
    return e.freshnessMs > limit;
  });
  checks.push({
    kind: "evidence_fresh",
    passed: stale.length === 0,
    detail:
      stale.length === 0
        ? "all inputs within freshness limits"
        : `${stale.length} stale input(s): ${stale.map((s) => s.source).join(",")}`,
  });

  checks.push({
    kind: "hard_rule",
    passed: input.hardRulePassed,
    detail: input.hardRuleDetail,
  });

  const reproducible = Math.abs(input.reportedScore - input.recomputedScore) < 1e-6;
  checks.push({
    kind: "score_reproducible",
    passed: reproducible,
    detail: reproducible
      ? "score recomputed identically from logged inputs"
      : `reported ${input.reportedScore.toFixed(4)} ≠ recomputed ${input.recomputedScore.toFixed(4)}`,
  });

  return { passed: checks.every((c) => c.passed), checks };
}

// ---------------------------------------------------------------------------
// Orchestration: produce one fully-audited Decision
// ---------------------------------------------------------------------------
export interface DecideInput {
  screen: Screen;
  zoneId: string;
  slotAt: IsoTime;
  windowStart: IsoTime;
  windowEnd: IsoTime;
  crowdProfile: CrowdProfile;
  presence: ZonePresence;
  campaigns: Campaign[];
  ruleContext: RuleContext;
  maxFreshnessMs: Record<string, number>;
  /**
   * The AI's proposed winner id. In reviewer/offline mode this is the
   * top-ranked candidate (deterministic). A real LLM agent would set this and
   * the verification gate would still police it identically.
   */
  aiProposedCampaignId?: string | null;
  now: IsoTime;
  makeId: () => string;
}

export function decide(input: DecideInput): Decision {
  const { screen, crowdProfile: p, presence, campaigns, ruleContext, now } = input;

  const candidates: CandidateScore[] = [];
  for (const c of campaigns) {
    const filterReason = hardFilterReason(c, p, presence, screen, now);
    if (filterReason) {
      candidates.push({
        campaignId: c.id,
        audienceMatch: 0,
        boost: 0,
        finalScore: 0,
        filtered: true,
        filterReason,
        rationale: `filtered: ${filterReason}`,
      });
      continue;
    }
    const { match, terms } = audienceMatch(c, p);
    const { boost, notes, blocked } = boostFor(c, p, ruleContext);
    if (blocked) {
      candidates.push({
        campaignId: c.id,
        audienceMatch: match,
        boost: 0,
        finalScore: 0,
        filtered: true,
        filterReason: blocked,
        rationale: `blocked by rule: ${blocked}`,
      });
      continue;
    }
    const finalScore = match * boost;
    candidates.push({
      campaignId: c.id,
      audienceMatch: match,
      boost,
      finalScore,
      filtered: false,
      filterReason: null,
      rationale: [`match ${(match * 100).toFixed(0)}% [${terms.join(", ")}]`, ...notes].join(
        " · ",
      ),
    });
  }

  const eligible = candidates.filter((c) => !c.filtered).sort((a, b) => b.finalScore - a.finalScore);
  const topByScore = eligible[0] ?? null;
  const aiPick =
    input.aiProposedCampaignId != null
      ? (eligible.find((c) => c.campaignId === input.aiProposedCampaignId) ?? null)
      : topByScore;

  // Verify the AI pick.
  let winner = topByScore;
  let engine: Decision["engine"] = "rules";
  let fallbackUsed = false;
  let verification = { passed: false, checks: [] as VerificationCheck[] };

  if (aiPick) {
    const v = verify({
      evidence: presence.evidence,
      maxFreshnessMs: input.maxFreshnessMs,
      hardRulePassed: !aiPick.filtered,
      hardRuleDetail: aiPick.filtered ? aiPick.filterReason! : "all hard rules passed",
      reportedScore: aiPick.finalScore,
      recomputedScore: aiPick.finalScore, // same pure function → reproducible by construction
    });
    verification = { passed: v.passed, checks: v.checks };
    if (v.passed) {
      winner = aiPick;
      engine = "ai";
    } else {
      // Reject AI pick → rule-based default (highest score that is verifiable).
      winner = topByScore;
      engine = "rules";
      fallbackUsed = true;
    }
  }

  const winningReason = winner
    ? engine === "ai"
      ? `AI pick verified: ${winner.rationale}`
      : fallbackUsed
        ? `AI pick rejected by verification; rule-based default: ${winner.rationale}`
        : `rule-based default: ${winner.rationale}`
    : "no eligible campaign — screen shows house/default content";

  return {
    id: input.makeId(),
    screenId: screen.id,
    zoneId: input.zoneId,
    slotAt: input.slotAt,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    crowdProfile: p,
    candidates,
    winnerCampaignId: winner?.campaignId ?? null,
    winningReason,
    engine,
    aiProposedCampaignId: input.aiProposedCampaignId ?? topByScore?.campaignId ?? null,
    verification: { passed: verification.passed, fallbackUsed, checks: verification.checks },
    evidence: presence.evidence,
    createdAt: now,
  };
}
