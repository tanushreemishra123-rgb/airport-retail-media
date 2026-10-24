// Thin typed REST client. All data comes from the backend; the UI renders it.
const J = { "content-type": "application/json" };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, { method: "POST", headers: J, body: body ? JSON.stringify(body) : undefined });
  return r.json() as Promise<T>;
}

export const api = {
  config: () => get<AppConfig>("/config"),
  sim: () => get<ClockState>("/sim"),
  play: () => post<ClockState>("/sim/play"),
  pause: () => post<ClockState>("/sim/pause"),
  speed: (speed: number) => post<ClockState>("/sim/speed", { speed }),
  jump: (iso: string) => post<ClockState>("/sim/jump", { iso }),
  inject: (body: Record<string, unknown>) => post<{ ok: boolean }>("/sim/inject", body),
  targets: () => get<SimTargets>("/sim/targets"),

  kpis: () => get<Kpis>("/admin/kpis"),
  feeds: () => get<Feed[]>("/admin/feeds"),
  network: () => get<Network>("/admin/network"),
  incidents: () => get<Incident[]>("/admin/incidents"),
  resolveIncident: (id: string, status: string, owner?: string) => post(`/admin/incidents/${id}`, { status, owner }),
  master: () => get<Master>("/admin/master"),
  createMaster: (entity: string, data: Record<string, unknown>) => post("/admin/master", { entity, data }),
  decisions: (q: Record<string, string> = {}) => get<Decision[]>(`/decisions?${new URLSearchParams(q)}`),

  campaigns: () => get<Campaign[]>("/campaigns"),
  campaign: (id: string) => get<Campaign>(`/campaigns/${id}`),
  createCampaign: (body: Record<string, unknown>) => post<{ campaign: Campaign }>("/campaigns", body),
  duplicateCampaign: (id: string) => post<{ campaign: Campaign }>(`/campaigns/${id}/duplicate`),
  setCampaignStatus: (id: string, status: string) => post(`/campaigns/${id}/status`, { status }),
  previewCampaign: (body: Record<string, unknown>) => post<Preview>("/campaigns/preview", body),
  creatives: () => get<Creative[]>("/creatives"),
  generateCreative: (body: Record<string, unknown>) => post<{ creative: Creative }>("/creative/generate", body),

  retailerOutlets: () => get<Outlet[]>("/retailer/outlets"),
  retailerDashboard: (id: string) => get<RetailerDashboard>(`/retailer/${id}/dashboard`),

  inventory: () => get<Inventory>("/media/inventory"),
  yield: () => get<YieldForecast>("/media/yield"),
  approvals: () => get<Approvals>("/media/approvals"),
  approveCampaign: (id: string, decision: "approve" | "reject") => post(`/media/approvals/campaign/${id}`, { decision }),
  advertisers: () => get<AdvertiserRow[]>("/media/advertisers"),
  heatmap: () => get<Heatmap>("/media/heatmap"),

  airlines: () => get<Airline[]>("/airline/list"),
  airlineFlights: (code: string) => get<AirlineFlight[]>(`/airline/${code}/flights`),
  airlineProfile: (code: string) => get<CrowdProfile>(`/airline/${code}/profile`),

  zones: () => get<Zone[]>("/zones"),
  screens: (zoneId?: string) => get<ScreenLite[]>(`/screens${zoneId ? `?zoneId=${zoneId}` : ""}`),
  playing: (id: string) => get<Playing>(`/screen/${id}/playing`),
  claim: (code: string) => get<ClaimInfo>(`/claim/${code}`),
  redeem: (code: string) => post<{ ok: boolean; campaignId?: string }>(`/claim/${code}`),
  share: (code: string) => post<{ ok: boolean; code?: string }>(`/claim/${code}/share`),
  recommend: (campaignId: string) => get<Slot[]>(`/recommend/slots?campaignId=${campaignId}`),
};

// ---- types (mirror the API shapes) ----
export interface AppConfig { brandName: string; brandColor: string; secondLanguage: string; currency: string; publicBaseUrl: string; day: string; airport: string; }
export interface ClockState { now: string; speed: number; running: boolean; }
export interface Kpis { screensOnlinePct: number; screensOnline: number; screensTotal: number; adPlaysToday: number; impressionsToday: number; revenueTodayCents: number; activeCampaigns: number; avgScreenLatencyMs: number; redemptionsToday: number; openIncidents: number; }
export interface Feed { source: string; messagesPerMin: number; lastMessageMs: number; lagInjected: boolean; }
export interface Zone { id: string; terminalId: string; name: string; gates: string[]; x: number; y: number; paxNow?: number; }
export interface Terminal { id: string; name: string; concourses: string[]; }
export interface ScreenNode { id: string; name: string; zoneId: string; status: string; orientation: string; nearestGates: string[]; latencyMs: number; playing: string | null; }
export interface Network { zones: Zone[]; terminals: Terminal[]; screens: ScreenNode[]; }
export interface Incident { id: string; kind: string; severity: string; status: string; entityId: string; message: string; owner: string | null; raisedAt: string; resolvedAt: string | null; }
export interface Master { advertisers: Advertiser[]; outlets: Outlet[]; airlines: Airline[]; terminals: Terminal[]; zones: Zone[]; screens: ScreenNode[]; }
export interface Advertiser { id: string; name: string; type: string; category?: string; airlineCode?: string; }
export interface Outlet { id: string; advertiserId: string; name: string; zoneId: string; category: string; advertiserName?: string; }
export interface Airline { iata: string; icao: string; name: string; market: string; lowCost: boolean; }
export interface CandidateScore { campaignId: string; audienceMatch: number; boost: number; finalScore: number; filtered: boolean; filterReason: string | null; rationale: string; }
export interface Decision { id: string; screenId: string; zoneId: string; slotAt: string; winnerCampaignId: string | null; winningReason: string; engine: string; crowdProfile: CrowdProfile; candidates: CandidateScore[]; verification: { passed: boolean; fallbackUsed: boolean; checks: Array<{ kind: string; passed: boolean; detail: string }> }; evidence: Evidence[]; createdAt: string; }
export interface Evidence { source: string; entityType: string; entityId: string; observedAt: string; freshnessMs: number; value: unknown; }
export interface CrowdProfile { tripPurpose: Record<string, number>; partyType: Record<string, number>; ageBand: Record<string, number>; gender: { female: number; male: number }; cabin: Record<string, number>; frequentFlyerShare: number; domesticShare: number; internationalShare: number; topNationalities: Array<{ code: string; share: number }>; topLanguages: Array<{ code: string; share: number }>; topDestinations: Array<{ code: string; share: number }>; destinationRegions: Array<{ region: string; share: number }>; medianDwellMinutes: number; maxDelayMinutes: number; timeOfDay: string; festival: string | null; paxNow: number; paxNext30: number; }
export interface Campaign { id: string; advertiserId: string; advertiserName?: string; name: string; status: string; brandSafe: boolean; competitorGroup: string | null; segmentWeights: SegmentWeights; hardFilters: Record<string, unknown>; placement: Placement; budget: Budget; triggers: Array<{ kind: string; threshold?: number; boost: number }>; creativeIds: string[]; priority: number; createdAt: string; impressions?: number; redemptions?: number; history?: HistoryDay[]; }
export interface SegmentWeights { tripPurpose?: Record<string, number>; partyType?: Record<string, number>; ageBand?: Record<string, number>; cabin?: Record<string, number>; internationalPreference?: number; }
export interface Placement { zoneIds: string[]; screenIds: string[]; gates: string[]; scheduleStart: string; scheduleEnd: string; hoursOfDay: number[]; }
export interface Budget { totalCents: number; dailyCapCents: number; spentCents: number; frequencyCapPerHour: number; }
export interface HistoryDay { date: string; impressions: number; redemptions: number; spendCents: number; revenueCents: number; }
export interface Creative { id: string; advertiserId: string; name: string; orientation: string; template: string; copy: Record<string, { headline: string; body: string; cta: string }>; bgColor: string; fgColor: string; approvalStatus: string; aiGenerated: boolean; }
export interface Preview { matchPct: number; zones: string[]; paxNow: number; screens: number; expectedImpressions: number; expectedRedemptions: number; }
export interface RetailerDashboard { outlet: Outlet; kpis: { impressions: number; scans: number; redemptions: number; revenueCents: number; conversionRate: number }; campaigns: Campaign[]; flow: Flow; }
export interface Flow { zoneId: string; next60Pax: number; internationalPct: number; topDestinations: string[]; topNationalities: string[]; buckets: Array<{ t: string; pax: number }>; upcoming: Array<{ flightNumber: string; destination: string; gate: string | null; time: string; pax: number }>; }
export interface Inventory { hours: number[]; zones: Array<{ zoneId: string; zoneName: string; cells: Array<{ hour: number; pax: number; premium: boolean; occupancyPct: number; available: number; screens: number }> }>; }
export interface YieldForecast { rows: Array<{ zoneId: string; zoneName: string; avgPax: number; suggestedCpmCents: number; occupancyPct: number }>; forecast: Array<{ day: number; revenueCents: number }>; }
export interface Approvals { campaigns: Campaign[]; creatives: Creative[]; }
export interface AdvertiserRow { id: string; name: string; type: string; campaigns: number; running: number; spentCents: number; underdelivering: number; }
export interface Heatmap { zones: Array<{ id: string; name: string }>; hours: number[]; segments: string[]; cells: Array<{ zoneId: string; hour: number; segment: string; value: number; pax: number }>; }
export interface AirlineFlight { id: string; flightNumber: string; direction: string; origin: string; destination: string; gate: string | null; scheduledTime: string; estimatedTime: string | null; status: string; delayMinutes: number; paxCount: number; loadFactor: number; }
export interface ScreenLite { id: string; name: string; zoneId: string; orientation: string; status: string; nearestGates: string[]; }
export interface Playing { screen: ScreenNode; decision: Decision | null; creative: Creative | null; campaign: { id: string; name: string; advertiserName: string } | null; promo: { code: string; validUntil: string } | null; nearby: Array<{ flightNumber: string; destination: string; gate: string | null; time: string; status: string; delayMinutes: number }>; now: string; }
export interface ClaimInfo { ok: boolean; error?: string; code?: string; validUntil?: string; redeemed?: boolean; campaign?: { name: string; advertiserName: string } | null; creative?: { copy: Record<string, { headline: string; body: string; cta: string }>; bgColor: string; fgColor: string } | null; }
export interface Slot { zoneId: string; hour: number; score: number; predictedImpressions: number; }
export interface SimTargets { flights: Array<{ id: string; flightNumber: string; destination: string; gate: string | null; zoneId: string | null; status: string; international: boolean }>; screens: Array<{ id: string; name: string; status: string }>; zones: Zone[]; feeds: string[]; }
