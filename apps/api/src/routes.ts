/**
 * REST routes for every role, the simulation controls, QR claim, and smart
 * recommendations. Handlers read live engine state; all aggregations are
 * derived from measured data (flights, presence, decisions, impressions).
 */
import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { rollupProfile, type Campaign, type Creative, type ProfileContribution, type Redemption } from "@arm/core";
import type { SimEngine } from "./sim/engine.js";
import type { SimClock } from "./sim/clock.js";
import type { DB } from "./db/index.js";
import { kvGet, saveRedemption } from "./db/repo.js";
import { makeCreativeProvider } from "./adapters/creative.js";
import { AIRLINES } from "./data/reference.js";

export interface AppConfig {
  brandName: string;
  brandColor: string;
  brandLogo: string;
  secondLanguage: string;
  currency: string;
  publicBaseUrl: string;
  day: string;
  airport: string;
}

interface Deps {
  engine: SimEngine;
  clock: SimClock;
  db: DB;
  config: AppConfig;
  broadcast: (msg: unknown) => void;
}

export function registerRoutes(app: FastifyInstance, deps: Deps): void {
  const { engine, clock, db, config, broadcast } = deps;
  const creativeProvider = makeCreativeProvider({ SECOND_LANGUAGE: config.secondLanguage });
  const nowIso = () => clock.nowIso();

  // ---- health / config / sim ----
  app.get("/api/health", async () => ({ status: "ok", now: nowIso(), airport: config.airport }));
  app.get("/api/config", async () => ({ ...config }));

  app.get("/api/sim", async () => clock.state());
  app.post("/api/sim/play", async () => { clock.play(); return clock.state(); });
  app.post("/api/sim/pause", async () => { clock.pause(); return clock.state(); });
  app.post<{ Body: { speed: number } }>("/api/sim/speed", async (req) => {
    clock.setSpeed(Number(req.body?.speed) || 1); return clock.state();
  });
  app.post<{ Body: { iso: string } }>("/api/sim/jump", async (req) => {
    if (req.body?.iso) clock.jumpTo(req.body.iso); return clock.state();
  });

  app.post<{ Body: { type: string; flightId?: string; minutes?: number; gate?: string; zoneId?: string; screenId?: string; source?: string; offline?: boolean; lag?: boolean } }>(
    "/api/sim/inject",
    async (req) => {
      const b = req.body ?? ({} as Record<string, never>);
      let ok = false;
      switch (b.type) {
        case "delay": ok = engine.injectDelay(b.flightId!, b.minutes ?? 45); break;
        case "gate_change": ok = engine.injectGateChange(b.flightId!, b.gate!, b.zoneId!); break;
        case "screen_offline": ok = engine.injectScreenOffline(b.screenId!, b.offline ?? true); break;
        case "feed_lag": ok = engine.injectFeedLag(b.source!, b.lag ?? true); break;
      }
      // Re-run decisions immediately so cause-and-effect lands within ~2s.
      engine.computePresence(Date.parse(nowIso()));
      engine.runDecisions(Date.parse(nowIso()), true);
      broadcast({ type: "delta", now: nowIso(), kpis: engine.kpis(), updatedScreens: [], presence: [...engine.presenceByZone.values()].map((p) => ({ zoneId: p.zoneId, paxNow: p.paxNow })) });
      return { ok };
    },
  );

  // Targets a presenter can inject events against (near-boarding departures,
  // a few screens, the feeds).
  app.get("/api/sim/targets", async () => {
    const now = Date.parse(nowIso());
    const flights = [...engine.flights.values()]
      .filter((f) => f.direction === "departure" && f.status !== "cancelled")
      .map((f) => ({ f, eff: Date.parse(f.estimatedTime ?? f.scheduledTime) }))
      .filter((x) => x.eff > now - 20 * 60000 && x.eff < now + 150 * 60000)
      .sort((a, b) => a.eff - b.eff)
      .slice(0, 40)
      .map(({ f }) => ({ id: f.id, flightNumber: f.flightNumber, destination: f.destination, gate: f.gate, zoneId: f.zoneId, status: engine.liveStatus(f, now), international: f.domesticInternational === "international" }));
    const screens = [...engine.screens.values()].slice(0, 30).map((s) => ({ id: s.id, name: s.name, status: s.status }));
    return { flights, screens, zones: engine.zones, feeds: engine.feedHealth().map((f) => f.source) };
  });

  // ---- admin ----
  app.get("/api/admin/kpis", async () => engine.kpis());
  app.get("/api/admin/feeds", async () => engine.feedHealth());
  app.get("/api/admin/network", async () => ({
    zones: engine.zones.map((z) => ({ ...z, paxNow: engine.presenceByZone.get(z.id)?.paxNow ?? 0 })),
    terminals: engine.terminals,
    screens: [...engine.screens.values()].map((s) => ({
      id: s.id, name: s.name, zoneId: s.zoneId, status: s.status, orientation: s.orientation,
      nearestGates: s.nearestGates, latencyMs: s.latencyMs,
      playing: engine.currentDecision.get(s.id)?.winnerCampaignId ?? null,
    })),
  }));
  app.get("/api/admin/incidents", async () => engine.incidents);
  app.post<{ Params: { id: string }; Body: { status?: string; owner?: string } }>("/api/admin/incidents/:id", async (req) => {
    const inc = engine.incidents.find((i) => i.id === req.params.id);
    if (!inc) return { ok: false };
    if (req.body?.status) inc.status = req.body.status as typeof inc.status;
    if (req.body?.owner !== undefined) inc.owner = req.body.owner;
    if (inc.status === "resolved") inc.resolvedAt = nowIso();
    return { ok: true, incident: inc };
  });
  app.get("/api/admin/master", async () => ({
    advertisers: engine.advertisers, outlets: engine.outlets, airlines: AIRLINES,
    terminals: engine.terminals, zones: engine.zones,
    screens: [...engine.screens.values()],
  }));
  // Create OR edit master data (screens, outlets) — the MDM forms post here.
  app.post<{ Body: { entity: string; data: Record<string, unknown> } }>("/api/admin/master", async (req) => {
    const { entity, data } = req.body ?? ({} as { entity: string; data: Record<string, unknown> });
    if (entity === "screen") {
      const s = engine.upsertScreen(data as never);
      return { ok: true, id: s.id, screen: s };
    }
    if (entity === "outlet") {
      const o = engine.upsertOutlet(data as never);
      return { ok: true, id: o.id, outlet: o };
    }
    return { ok: false, error: "unsupported_entity" };
  });
  app.get("/api/admin/performance", async () => engine.performance());

  // ---- decision log (audit) ----
  app.get<{ Querystring: { screenId?: string; campaignId?: string; engine?: string; limit?: string } }>("/api/decisions", async (req) => {
    const q = req.query;
    let log = engine.decisionLog;
    if (q.screenId) log = log.filter((d) => d.screenId === q.screenId);
    if (q.campaignId) log = log.filter((d) => d.winnerCampaignId === q.campaignId || d.candidates.some((c) => c.campaignId === q.campaignId));
    if (q.engine) log = log.filter((d) => d.engine === q.engine);
    const limit = Number(q.limit ?? 100);
    return log.slice(-limit).reverse();
  });
  app.get<{ Params: { id: string } }>("/api/decisions/:id", async (req) => {
    return engine.decisionLog.find((d) => d.id === req.params.id) ?? { error: "not_found" };
  });

  // ---- campaigns / creatives ----
  const advName = (id: string) => engine.advertisers.find((a) => a.id === id)?.name ?? id;
  const campaignView = (c: Campaign) => ({
    ...c,
    advertiserName: advName(c.advertiserId),
    impressions: engine.perCampaignImpr.get(c.id) ?? 0,
    redemptions: engine.perCampaignRedemptions.get(c.id) ?? 0,
    history: kvGet(db, `history:${c.id}`) ?? [],
  });
  app.get("/api/campaigns", async () => [...engine.campaigns.values()].map(campaignView));
  app.get<{ Params: { id: string } }>("/api/campaigns/:id", async (req) => {
    const c = engine.campaigns.get(req.params.id);
    return c ? campaignView(c) : { error: "not_found" };
  });
  app.post<{ Body: Partial<Campaign> & { advertiserId: string } }>("/api/campaigns", async (req) => {
    const b = req.body;
    const id = `CMP-${String(engine.campaigns.size + 1).padStart(3, "0")}`;
    const c: Campaign = {
      id, advertiserId: b.advertiserId, name: b.name ?? "New campaign", status: b.status ?? "pending_approval",
      brandSafe: b.brandSafe ?? true, competitorGroup: b.competitorGroup ?? null,
      segmentWeights: b.segmentWeights ?? {}, hardFilters: b.hardFilters ?? {},
      placement: b.placement ?? { zoneIds: [], screenIds: [], gates: [], scheduleStart: `${config.day}T00:00:00Z`, scheduleEnd: `${config.day}T23:59:59Z`, hoursOfDay: [] },
      budget: b.budget ?? { totalCents: 100000, dailyCapCents: 40000, spentCents: 0, frequencyCapPerHour: 8 },
      triggers: b.triggers ?? [], creativeIds: b.creativeIds ?? [], priority: b.priority ?? 1, createdAt: nowIso(),
    };
    engine.campaigns.set(id, c);
    return { ok: true, campaign: campaignView(c) };
  });
  app.post<{ Params: { id: string } }>("/api/campaigns/:id/duplicate", async (req) => {
    const src = engine.campaigns.get(req.params.id);
    if (!src) return { error: "not_found" };
    const id = `CMP-${String(engine.campaigns.size + 1).padStart(3, "0")}`;
    const c: Campaign = { ...src, id, name: `${src.name} (copy)`, status: "draft", budget: { ...src.budget, spentCents: 0 }, createdAt: nowIso() };
    engine.campaigns.set(id, c);
    return { ok: true, campaign: campaignView(c) };
  });
  app.post<{ Params: { id: string }; Body: { status: Campaign["status"] } }>("/api/campaigns/:id/status", async (req) => {
    const c = engine.campaigns.get(req.params.id);
    if (!c) return { error: "not_found" };
    c.status = req.body.status;
    return { ok: true };
  });
  // Stock-aware offers: pause/resume when an item is out of/in stock.
  app.post<{ Params: { id: string }; Body: { available: boolean } }>("/api/campaigns/:id/stock", async (req) => {
    return { ok: engine.setStock(req.params.id, req.body.available) };
  });
  // A/B: attach a second creative variant + traffic split.
  app.post<{ Params: { id: string }; Body: { variantCreativeId: string; abSplit: number } }>("/api/campaigns/:id/ab", async (req) => {
    const c = engine.campaigns.get(req.params.id);
    if (!c) return { error: "not_found" };
    c.variantCreativeId = req.body.variantCreativeId;
    c.abSplit = Math.max(0, Math.min(1, req.body.abSplit));
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>("/api/campaigns/:id/ab", async (req) => {
    const c = engine.campaigns.get(req.params.id);
    if (!c) return { error: "not_found" };
    const a = c.creativeIds[0] ?? "";
    const b = c.variantCreativeId ?? "";
    return {
      split: c.abSplit ?? 0,
      variantA: { creativeId: a, impressions: engine.perCreativeImpr.get(a) ?? 0 },
      variantB: b ? { creativeId: b, impressions: engine.perCreativeImpr.get(b) ?? 0 } : null,
    };
  });

  // Live audience-match preview while building a campaign.
  app.post<{ Body: { segmentWeights: Campaign["segmentWeights"]; hardFilters: Campaign["hardFilters"]; zoneIds: string[] } }>("/api/campaigns/preview", async (req) => {
    const b = req.body;
    const zoneIds = b.zoneIds?.length ? b.zoneIds : engine.zones.filter((z) => z.gates.length).map((z) => z.id);
    let paxTotal = 0;
    let matchWeighted = 0;
    const now = Date.parse(nowIso());
    for (const zid of zoneIds) {
      const presence = engine.presenceByZone.get(zid);
      if (!presence || presence.paxNow === 0) continue;
      const contrib = contributionsForZone(engine, zid, now);
      if (!contrib.length) continue;
      const profile = rollupProfile(contrib);
      const fakeCampaign: Campaign = {
        id: "preview", advertiserId: "", name: "preview", status: "running", brandSafe: true, competitorGroup: null,
        segmentWeights: b.segmentWeights ?? {}, hardFilters: b.hardFilters ?? {},
        placement: { zoneIds, screenIds: [], gates: [], scheduleStart: `${config.day}T00:00:00Z`, scheduleEnd: `${config.day}T23:59:59Z`, hoursOfDay: [] },
        budget: { totalCents: 1e9, dailyCapCents: 1e9, spentCents: 0, frequencyCapPerHour: 999 }, triggers: [], creativeIds: [], priority: 1, createdAt: nowIso(),
      };
      const { audienceMatchProxy } = computeMatch(fakeCampaign, profile);
      matchWeighted += audienceMatchProxy * presence.paxNow;
      paxTotal += presence.paxNow;
    }
    const match = paxTotal > 0 ? matchWeighted / paxTotal : 0;
    const screensInZones = [...engine.screens.values()].filter((s) => zoneIds.includes(s.zoneId) && s.status !== "offline").length;
    const expectedImpressions = Math.round(paxTotal * 0.8 * (screensInZones ? 1 : 0)) * 2;
    return {
      matchPct: Math.round(match * 100),
      zones: zoneIds, paxNow: paxTotal, screens: screensInZones,
      expectedImpressions, expectedRedemptions: Math.round(expectedImpressions * 0.03),
    };
  });

  app.get("/api/creatives", async () => [...engine.creatives.values()]);
  app.post<{ Body: { brief: string; orientation?: "portrait" | "landscape"; advertiserId?: string } }>("/api/creative/generate", async (req) => {
    const out = await creativeProvider.generate({
      brief: req.body.brief, orientation: req.body.orientation ?? "landscape",
      languages: ["en", config.secondLanguage],
    });
    const id = `CRE-AI-${engine.creatives.size + 1}`;
    const creative: Creative = {
      id, advertiserId: req.body.advertiserId ?? "", name: `AI: ${req.body.brief.slice(0, 32)}`,
      orientation: req.body.orientation ?? "landscape", template: out.template, copy: out.copy,
      bgColor: out.bgColor, fgColor: out.fgColor, approvalStatus: "pending", aiGenerated: true,
    };
    engine.creatives.set(id, creative);
    return { ok: true, creative };
  });

  // ---- retailer ----
  app.get("/api/retailer/outlets", async () => engine.outlets.map((o) => ({ ...o, advertiserName: advName(o.advertiserId) })));
  app.get<{ Params: { outletId: string } }>("/api/retailer/:outletId/dashboard", async (req) => {
    const outlet = engine.outlets.find((o) => o.id === req.params.outletId);
    if (!outlet) return { error: "not_found" };
    const campaigns = [...engine.campaigns.values()].filter((c) => c.advertiserId === outlet.advertiserId);
    const impressions = campaigns.reduce((s, c) => s + (engine.perCampaignImpr.get(c.id) ?? 0), 0);
    const redemptions = campaigns.reduce((s, c) => s + (engine.perCampaignRedemptions.get(c.id) ?? 0), 0);
    const revenueCents = campaigns.reduce((s, c) => s + c.budget.spentCents, 0);
    return {
      outlet: { ...outlet, advertiserName: advName(outlet.advertiserId) },
      kpis: {
        impressions, scans: redemptions, redemptions, revenueCents,
        conversionRate: impressions ? Math.round((redemptions / impressions) * 10000) / 100 : 0,
      },
      campaigns: campaigns.map(campaignView),
      flow: passengerFlow(engine, outlet.zoneId, Date.parse(nowIso())),
    };
  });
  app.get<{ Params: { outletId: string } }>("/api/retailer/:outletId/flow", async (req) => {
    const outlet = engine.outlets.find((o) => o.id === req.params.outletId);
    if (!outlet) return { error: "not_found" };
    return passengerFlow(engine, outlet.zoneId, Date.parse(nowIso()));
  });

  // ---- media manager ----
  app.get("/api/media/inventory", async () => inventoryCalendar(engine, Date.parse(nowIso())));
  app.get("/api/media/yield", async () => yieldForecast(engine, Date.parse(nowIso())));
  app.get("/api/media/approvals", async () => ({
    campaigns: [...engine.campaigns.values()].filter((c) => c.status === "pending_approval").map(campaignView),
    creatives: [...engine.creatives.values()].filter((c) => c.approvalStatus === "pending"),
  }));
  app.post<{ Params: { id: string }; Body: { decision: "approve" | "reject" } }>("/api/media/approvals/campaign/:id", async (req) => {
    const c = engine.campaigns.get(req.params.id);
    if (!c) return { error: "not_found" };
    c.status = req.body.decision === "approve" ? "running" : "rejected";
    return { ok: true, status: c.status };
  });
  app.post<{ Params: { id: string }; Body: { decision: "approve" | "reject" } }>("/api/media/approvals/creative/:id", async (req) => {
    const cr = engine.creatives.get(req.params.id);
    if (!cr) return { error: "not_found" };
    cr.approvalStatus = req.body.decision === "approve" ? "approved" : "rejected";
    return { ok: true };
  });
  app.get("/api/media/advertisers", async () => {
    const rows = engine.advertisers.map((a) => {
      const cs = [...engine.campaigns.values()].filter((c) => c.advertiserId === a.id);
      const spent = cs.reduce((s, c) => s + c.budget.spentCents, 0);
      const running = cs.filter((c) => c.status === "running").length;
      const underdelivering = cs.filter((c) => c.status === "running" && c.budget.dailyCapCents > 0 && c.budget.spentCents < c.budget.dailyCapCents * 0.1).length;
      return { id: a.id, name: a.name, type: a.type, campaigns: cs.length, running, spentCents: spent, underdelivering };
    }).filter((r) => r.campaigns > 0).sort((a, b) => b.spentCents - a.spentCents);
    return rows;
  });
  app.get("/api/media/heatmap", async () => segmentHeatmap(engine));

  // Package builder: bundle zones/screens into a sellable pack.
  app.get("/api/media/packages", async () => [...engine.packages.values()]);
  app.post<{ Body: { name: string; zoneIds: string[]; priceCents: number } }>("/api/media/packages", async (req) => {
    const b = req.body;
    return { ok: true, package: engine.createPackage(b.name, b.zoneIds ?? [], b.priceCents ?? 500000) };
  });

  // One-click advertiser report — a shareable printable HTML page (print → PDF).
  app.get<{ Params: { id: string } }>("/api/media/report/:id", async (req, reply) => {
    const adv = engine.advertisers.find((a) => a.id === req.params.id);
    if (!adv) { reply.code(404).send("not found"); return; }
    const cs = [...engine.campaigns.values()].filter((c) => c.advertiserId === adv.id);
    const impr = cs.reduce((s, c) => s + (engine.perCampaignImpr.get(c.id) ?? 0), 0);
    const red = cs.reduce((s, c) => s + (engine.perCampaignRedemptions.get(c.id) ?? 0), 0);
    const spend = cs.reduce((s, c) => s + c.budget.spentCents, 0);
    const fmtc = (c: number) => `${config.currency} ${(c / 100).toLocaleString()}`;
    const rows = cs.map((c) => `<tr><td>${c.name}</td><td>${c.status}</td><td style="text-align:right">${(engine.perCampaignImpr.get(c.id) ?? 0).toLocaleString()}</td><td style="text-align:right">${engine.perCampaignRedemptions.get(c.id) ?? 0}</td><td style="text-align:right">${fmtc(c.budget.spentCents)}</td></tr>`).join("");
    reply.header("Content-Type", "text/html").send(`<!doctype html><html><head><meta charset="utf-8"><title>${adv.name} — advertiser report</title>
<style>body{font-family:system-ui,Arial;margin:40px;color:#16203a}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #e3e8f2;font-size:13px;text-align:left}.kpis{display:flex;gap:24px;margin:20px 0}.k .v{font-size:26px;font-weight:800}.k .l{color:#697792;font-size:12px}button{margin-top:20px;padding:8px 14px}@media print{button{display:none}}</style></head>
<body><h1>${config.brandName} — Advertiser report</h1><div style="color:#697792">${adv.name} · ${config.airport} · generated ${nowIso()}</div>
<div class="kpis"><div class="k"><div class="v">${impr.toLocaleString()}</div><div class="l">Impressions</div></div><div class="k"><div class="v">${red}</div><div class="l">Redemptions</div></div><div class="k"><div class="v">${fmtc(spend)}</div><div class="l">Spend</div></div><div class="k"><div class="v">${cs.length}</div><div class="l">Campaigns</div></div></div>
<table><thead><tr><th>Campaign</th><th>Status</th><th style="text-align:right">Impr</th><th style="text-align:right">Redeem</th><th style="text-align:right">Spend</th></tr></thead><tbody>${rows}</tbody></table>
<button onclick="window.print()">Print / Save as PDF</button></body></html>`);
  });

  // ---- airline ----
  app.get("/api/airline/list", async () => AIRLINES);
  app.get<{ Params: { code: string } }>("/api/airline/:code/flights", async (req) => {
    const now = Date.parse(nowIso());
    return [...engine.flights.values()]
      .filter((f) => f.airlineCode === req.params.code)
      .sort((a, b) => Date.parse(a.scheduledTime) - Date.parse(b.scheduledTime))
      .map((f) => ({
        id: f.id, flightNumber: f.flightNumber, direction: f.direction, origin: f.origin, destination: f.destination,
        gate: f.gate, scheduledTime: f.scheduledTime, estimatedTime: f.estimatedTime, status: engine.liveStatus(f, now),
        delayMinutes: f.delayMinutes, paxCount: f.paxCount,
        loadFactor: Math.round((f.paxCount / Math.max(1, f.profile.paxNow || f.paxCount)) * 100) || 85,
      }));
  });
  app.get<{ Params: { code: string } }>("/api/airline/:code/profile", async (req) => {
    const flights = [...engine.flights.values()].filter((f) => f.airlineCode === req.params.code && f.direction === "departure");
    const contrib: ProfileContribution[] = flights.map((f) => ({ profile: f.profile, weight: f.paxCount, pax: f.paxCount }));
    return contrib.length ? rollupProfile(contrib) : {};
  });
  // Gate-area messaging: schedule sponsored content on this airline's gate zones.
  app.post<{ Params: { code: string }; Body: { zoneIds: string[]; headline: string; body: string } }>("/api/airline/:code/schedule", async (req) => {
    const b = req.body;
    const zoneIds = b.zoneIds?.length ? b.zoneIds : ["T2-C", "T2-D"];
    const c = engine.scheduleGateMessage(req.params.code, zoneIds, b.headline || "Welcome aboard", b.body || "Priority boarding and lounge offers.");
    return { ok: true, campaignId: c.id };
  });
  // Own-passenger performance (campaigns playing at this airline's gate zones).
  app.get<{ Params: { code: string } }>("/api/airline/:code/performance", async (req) => {
    const adv = engine.advertisers.find((a) => a.type === "airline" && a.airlineCode === req.params.code);
    const cs = [...engine.campaigns.values()].filter((c) => c.advertiserId === adv?.id);
    return {
      impressions: cs.reduce((s, c) => s + (engine.perCampaignImpr.get(c.id) ?? 0), 0),
      redemptions: cs.reduce((s, c) => s + (engine.perCampaignRedemptions.get(c.id) ?? 0), 0),
      campaigns: cs.length,
    };
  });
  // Co-marketing marketplace.
  app.get<{ Querystring: { airlineCode?: string } }>("/api/offers", async (req) => {
    let list = engine.offers;
    if (req.query.airlineCode) list = list.filter((o) => o.airlineCode === req.query.airlineCode);
    return list;
  });
  app.post<{ Body: { retailerAdvertiserId: string; airlineCode: string; description: string } }>("/api/offers", async (req) => {
    const b = req.body;
    return { ok: true, offer: engine.createOffer(b.retailerAdvertiserId, b.airlineCode, b.description) };
  });
  app.post<{ Params: { id: string } }>("/api/offers/:id/accept", async (req) => ({ ok: engine.acceptOffer(req.params.id) }));

  // ---- passenger screen ----
  app.get("/api/zones", async () => engine.zones);
  app.get<{ Querystring: { zoneId?: string } }>("/api/screens", async (req) => {
    let list = [...engine.screens.values()];
    if (req.query.zoneId) list = list.filter((s) => s.zoneId === req.query.zoneId);
    return list.map((s) => ({ id: s.id, name: s.name, zoneId: s.zoneId, orientation: s.orientation, status: s.status, nearestGates: s.nearestGates }));
  });
  app.get<{ Params: { id: string } }>("/api/screen/:id/playing", async (req) => {
    const screen = engine.screens.get(req.params.id);
    if (!screen) return { error: "not_found" };
    const decision = engine.currentDecision.get(screen.id) ?? null;
    const winner = decision?.winnerCampaignId ? engine.campaigns.get(decision.winnerCampaignId) : undefined;
    const creative = winner ? engine.creatives.get(winner.creativeIds.find((cid) => engine.creatives.get(cid)?.orientation === screen.orientation) ?? winner.creativeIds[0] ?? "") : undefined;
    const promo = winner ? [...engine.promoCodes.values()].find((p) => p.campaignId === winner.id) : undefined;
    const now = Date.parse(nowIso());
    const nearby = [...engine.flights.values()]
      .filter((f) => f.zoneId === screen.zoneId && f.direction === "departure" && engine.liveStatus(f, now) !== "departed")
      .sort((a, b) => Date.parse(a.estimatedTime ?? a.scheduledTime) - Date.parse(b.estimatedTime ?? b.scheduledTime))
      .slice(0, 5)
      .map((f) => ({ flightNumber: f.flightNumber, destination: f.destination, gate: f.gate, time: f.estimatedTime ?? f.scheduledTime, status: engine.liveStatus(f, now), delayMinutes: f.delayMinutes }));
    return {
      screen, decision, creative: creative ?? null,
      campaign: winner ? { id: winner.id, name: winner.name, advertiserName: advName(winner.advertiserId) } : null,
      promo: promo ? { code: promo.code, validUntil: promo.validUntil } : null,
      nearby, now: nowIso(),
    };
  });

  // ---- QR + claim (mobile) ----
  const claimUrl = (code: string, reqOrigin: string) => `${config.publicBaseUrl || reqOrigin}/claim/${code}`;
  app.get<{ Querystring: { code: string } }>("/api/qr", async (req, reply) => {
    const origin = `${req.protocol}://${req.headers.host}`;
    const png = await QRCode.toBuffer(claimUrl(req.query.code, origin), { width: 320, margin: 1 });
    reply.header("Content-Type", "image/png").send(png);
  });
  app.get<{ Params: { code: string } }>("/api/claim/:code", async (req) => {
    const promo = [...engine.promoCodes.values()].find((p) => p.code === req.params.code);
    if (!promo) return { ok: false, error: "invalid_code" };
    const c = engine.campaigns.get(promo.campaignId);
    const creative = c ? engine.creatives.get(c.creativeIds[0] ?? "") : undefined;
    return {
      ok: true, code: promo.code, validUntil: promo.validUntil, redeemed: promo.redeemed,
      campaign: c ? { name: c.name, advertiserName: advName(c.advertiserId) } : null,
      creative: creative ? { copy: creative.copy, bgColor: creative.bgColor, fgColor: creative.fgColor } : null,
    };
  });
  app.post<{ Params: { code: string } }>("/api/claim/:code", async (req) => {
    const res = engine.redeem(req.params.code, nowIso());
    if (res.ok && res.campaignId) {
      const promo = [...engine.promoCodes.values()].find((p) => p.code === req.params.code)!;
      const red: Redemption = { id: `RED-${Date.now()}`, promoCodeId: promo.id, campaignId: res.campaignId, at: nowIso(), segment: "qr", channel: "qr", valueCents: 1500 };
      try { saveRedemption(db, red); } catch { /* best-effort persistence */ }
    }
    return res;
  });
  // Share-to-family: issue a second linked code.
  app.post<{ Params: { code: string } }>("/api/claim/:code/share", async (req) => {
    const promo = [...engine.promoCodes.values()].find((p) => p.code === req.params.code);
    if (!promo) return { ok: false };
    const code = `${promo.code}-F${randomInt(100, 1000)}`;
    const child = { ...promo, id: `PRM-SH-${Date.now()}`, code, parentCode: promo.code, redeemed: false };
    engine.promoCodes.set(child.id, child);
    return { ok: true, code };
  });

  // ---- smart recommendation ----
  app.get<{ Querystring: { campaignId: string } }>("/api/recommend/slots", async (req) => {
    const c = engine.campaigns.get(req.query.campaignId);
    if (!c) return { error: "not_found" };
    return recommendSlots(engine, c);
  });
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------
function contributionsForZone(engine: SimEngine, zoneId: string, nowMs: number): ProfileContribution[] {
  const out: ProfileContribution[] = [];
  for (const f of engine.flights.values()) {
    if (f.direction !== "departure" || f.zoneId !== zoneId || f.status === "cancelled") continue;
    const eff = Date.parse(f.estimatedTime ?? f.scheduledTime);
    const toDepMin = (eff - nowMs) / 60000;
    const w = toDepMin > 120 ? 0.1 : toDepMin > 40 ? 0.5 : toDepMin > 0 ? 1 : toDepMin > -20 ? 0.5 : 0;
    if (w > 0) out.push({ profile: f.profile, weight: w, pax: Math.round(f.paxCount * w) });
  }
  return out;
}

function computeMatch(c: Campaign, p: ReturnType<typeof rollupProfile>): { audienceMatchProxy: number } {
  const w = c.segmentWeights;
  let num = 0, den = 0;
  const add = (weight: number | undefined, share: number) => { if (weight && weight > 0) { num += weight * share; den += weight; } };
  for (const [k, weight] of Object.entries(w.tripPurpose ?? {})) add(weight, p.tripPurpose[k as keyof typeof p.tripPurpose] ?? 0);
  for (const [k, weight] of Object.entries(w.partyType ?? {})) add(weight, p.partyType[k as keyof typeof p.partyType] ?? 0);
  for (const [k, weight] of Object.entries(w.ageBand ?? {})) add(weight, p.ageBand[k as keyof typeof p.ageBand] ?? 0);
  for (const [k, weight] of Object.entries(w.cabin ?? {})) add(weight, p.cabin[k as keyof typeof p.cabin] ?? 0);
  if (w.internationalPreference) add(w.internationalPreference, p.internationalShare);
  return { audienceMatchProxy: den > 0 ? num / den : 0 };
}

function passengerFlow(engine: SimEngine, zoneId: string, nowMs: number) {
  const horizon = nowMs + 2 * 3600_000;
  const flights = [...engine.flights.values()].filter(
    (f) => f.zoneId === zoneId && f.direction === "departure" && f.status !== "cancelled" &&
      Date.parse(f.estimatedTime ?? f.scheduledTime) >= nowMs - 20 * 60000 &&
      Date.parse(f.estimatedTime ?? f.scheduledTime) <= horizon,
  );
  const next60 = flights.filter((f) => Date.parse(f.estimatedTime ?? f.scheduledTime) <= nowMs + 3600_000);
  const pax = next60.reduce((s, f) => s + f.paxCount, 0);
  const intlPax = next60.filter((f) => f.domesticInternational === "international").reduce((s, f) => s + f.paxCount, 0);
  const destCount = new Map<string, number>();
  const natCount = new Map<string, number>();
  for (const f of next60) {
    destCount.set(f.destination, (destCount.get(f.destination) ?? 0) + f.paxCount);
    for (const n of f.profile.topNationalities) natCount.set(n.code, (natCount.get(n.code) ?? 0) + n.share * f.paxCount);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code]) => code);
  // 15-min buckets for a mini chart
  const buckets: Array<{ t: string; pax: number }> = [];
  for (let i = 0; i < 8; i++) {
    const bStart = nowMs + i * 15 * 60000;
    const bEnd = bStart + 15 * 60000;
    const p = flights.filter((f) => { const t = Date.parse(f.estimatedTime ?? f.scheduledTime); return t >= bStart && t < bEnd; }).reduce((s, f) => s + Math.round(f.paxCount * 0.6), 0);
    buckets.push({ t: new Date(bStart).toISOString(), pax: p });
  }
  return {
    zoneId, next60Pax: pax, internationalPct: pax ? Math.round((intlPax / pax) * 100) : 0,
    topDestinations: top(destCount), topNationalities: top(natCount), buckets,
    upcoming: flights.slice(0, 8).map((f) => ({ flightNumber: f.flightNumber, destination: f.destination, gate: f.gate, time: f.estimatedTime ?? f.scheduledTime, pax: f.paxCount })),
  };
}

function inventoryCalendar(engine: SimEngine, nowMs: number) {
  const zones = engine.zones.filter((z) => z.gates.length);
  const hours = Array.from({ length: 18 }, (_, i) => 6 + i); // 06:00–23:00
  const dayStart = Date.parse("2026-10-14T00:00:00Z");
  const grid = zones.map((z) => {
    const screensInZone = [...engine.screens.values()].filter((s) => s.zoneId === z.id).length;
    const cells = hours.map((h) => {
      const t = dayStart + h * 3600_000;
      const pax = [...engine.flights.values()].filter((f) => f.zoneId === z.id && f.direction === "departure" && Math.abs(Date.parse(f.estimatedTime ?? f.scheduledTime) - t) < 45 * 60000).reduce((s, f) => s + f.paxCount, 0);
      const premium = pax > 600;
      const booked = Math.min(100, Math.round((pax / 8) + 20));
      return { hour: h, pax, premium, occupancyPct: booked, available: 100 - booked, screens: screensInZone };
    });
    return { zoneId: z.id, zoneName: z.name, cells };
  });
  return { hours, zones: grid };
}

function yieldForecast(engine: SimEngine, nowMs: number) {
  const inv = inventoryCalendar(engine, nowMs);
  const rows = inv.zones.map((z) => {
    const avgPax = Math.round(z.cells.reduce((s, c) => s + c.pax, 0) / z.cells.length);
    const suggestedCpmCents = 800 + Math.round(avgPax / 2);
    const occupancy = Math.round(z.cells.reduce((s, c) => s + c.occupancyPct, 0) / z.cells.length);
    return { zoneId: z.zoneId, zoneName: z.zoneName, avgPax, suggestedCpmCents, occupancyPct: occupancy };
  });
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const base = rows.reduce((s, r) => s + r.avgPax * r.suggestedCpmCents, 0) / 1000;
    return { day: i + 1, revenueCents: Math.round(base * (0.9 + i * 0.03)) };
  });
  return { rows, forecast };
}

function segmentHeatmap(engine: SimEngine) {
  const zones = engine.zones.filter((z) => z.gates.length);
  const hours = Array.from({ length: 18 }, (_, i) => 6 + i);
  const dayStart = Date.parse("2026-10-14T00:00:00Z");
  const segments = ["business", "holiday", "family", "international"] as const;
  const cells: Array<{ zoneId: string; hour: number; segment: string; value: number; pax: number }> = [];
  for (const z of zones) {
    for (const h of hours) {
      const t = dayStart + h * 3600_000;
      const fl = [...engine.flights.values()].filter((f) => f.zoneId === z.id && f.direction === "departure" && Math.abs(Date.parse(f.estimatedTime ?? f.scheduledTime) - t) < 45 * 60000);
      const pax = fl.reduce((s, f) => s + f.paxCount, 0);
      if (!fl.length) { for (const seg of segments) cells.push({ zoneId: z.id, hour: h, segment: seg, value: 0, pax: 0 }); continue; }
      const avg = (sel: (f: (typeof fl)[number]) => number) => fl.reduce((s, f) => s + sel(f) * f.paxCount, 0) / Math.max(1, pax);
      const vals: Record<string, number> = {
        business: avg((f) => f.profile.tripPurpose.business),
        holiday: avg((f) => f.profile.tripPurpose.holiday),
        family: avg((f) => f.profile.partyType.family),
        international: avg((f) => f.profile.internationalShare),
      };
      for (const seg of segments) cells.push({ zoneId: z.id, hour: h, segment: seg, value: Math.round(vals[seg]! * 100), pax });
    }
  }
  return { zones: zones.map((z) => ({ id: z.id, name: z.name })), hours, segments, cells };
}

function recommendSlots(engine: SimEngine, c: Campaign) {
  const zones = c.placement.zoneIds.length ? c.placement.zoneIds : engine.zones.filter((z) => z.gates.length).map((z) => z.id);
  const dayStart = Date.parse("2026-10-15T00:00:00Z"); // "tomorrow"
  const hours = Array.from({ length: 18 }, (_, i) => 6 + i);
  const slots: Array<{ zoneId: string; hour: number; score: number; predictedImpressions: number }> = [];
  for (const zid of zones) {
    for (const h of hours) {
      const t = dayStart + h * 3600_000;
      const fl = [...engine.flights.values()].filter((f) => f.zoneId === zid && f.direction === "departure" && Math.abs(((Date.parse(f.scheduledTime) - Date.parse("2026-10-14T00:00:00Z")) % 86400000) - h * 3600_000) < 45 * 60000);
      const pax = fl.reduce((s, f) => s + f.paxCount, 0);
      if (!pax) continue;
      const profile = rollupProfile(fl.map((f) => ({ profile: f.profile, weight: f.paxCount, pax: f.paxCount })));
      const { audienceMatchProxy } = computeMatch(c, profile);
      slots.push({ zoneId: zid, hour: h, score: Math.round(audienceMatchProxy * 100), predictedImpressions: Math.round(pax * 0.8 * audienceMatchProxy) });
    }
  }
  return slots.sort((a, b) => b.score * b.predictedImpressions - a.score * a.predictedImpressions).slice(0, 3);
}
