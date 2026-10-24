/**
 * Campaign / creative / promo-code generator. 25 campaigns spanning the roles
 * and targeting styles in the spec, including the reproducible worked example
 * (duty-free perfume with a delay boost, family toy store, business lounge).
 */
import type {
  Advertiser, Campaign, Creative, PromoCode, ScreenOrientation,
} from "@arm/core";

const DAY = "2026-10-14";
const dayStart = `${DAY}T00:00:00Z`;
const dayEnd = `${DAY}T23:59:59Z`;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  name: string;
  advertiserMatch: (a: Advertiser) => boolean;
  competitorGroup?: string | null;
  weights: Campaign["segmentWeights"];
  filters: Campaign["hardFilters"];
  zoneIds?: string[];
  triggers?: Campaign["triggers"];
  priority?: number;
  headline: string;
  body: string;
  cta: string;
  bg: string;
  fg: string;
  ar: { headline: string; body: string; cta: string };
}

const SPECS: Spec[] = [
  {
    name: "Lumière Perfume — 15% off",
    advertiserMatch: (a) => a.name === "Lumière Perfumes",
    competitorGroup: "perfume",
    weights: { tripPurpose: { holiday: 1 }, ageBand: { "25-34": 1, "35-44": 1, "45-54": 1 }, internationalPreference: 1 },
    filters: { internationalOnly: true, minDwellMinutes: 15 },
    zoneIds: ["T2-DF", "T2-C", "T2-D"],
    triggers: [{ kind: "delay_over", threshold: 30, boost: 1.5 }],
    headline: "15% off signature fragrances", body: "Treat someone (or yourself) before you fly. Duty-free exclusive.", cta: "Scan to claim",
    bg: "#2a1b3d", fg: "#f6e9ff",
    ar: { headline: "خصم 15٪ على العطور", body: "هدية مثالية قبل رحلتك. حصري في السوق الحرة.", cta: "امسح للحصول على العرض" },
  },
  {
    name: "Maison Noir — Gift sets",
    advertiserMatch: (a) => a.name === "Maison Noir Fragrance",
    competitorGroup: "perfume",
    weights: { tripPurpose: { holiday: 0.8, vff: 0.5 }, internationalPreference: 0.8 },
    filters: { internationalOnly: true },
    zoneIds: ["T2-C", "T2-DF"],
    headline: "Luxury gift sets", body: "Limited-edition sets for the season.", cta: "Discover",
    bg: "#101014", fg: "#e8c889",
    ar: { headline: "أطقم هدايا فاخرة", body: "إصدارات محدودة لهذا الموسم.", cta: "اكتشف" },
  },
  {
    name: "Little Explorers — Buy 2 get 1",
    advertiserMatch: (a) => a.name === "Little Explorers Toys",
    weights: { partyType: { family: 1 }, ageBand: { u12: 1, "35-44": 0.4 } },
    filters: {},
    zoneIds: ["T2-D", "T1-A"],
    headline: "Buy 2 get 1 free — travel toys", body: "Keep little travellers happy on board.", cta: "Scan to claim",
    bg: "#0b4f6c", fg: "#fff4d6",
    ar: { headline: "اشترِ 2 واحصل على 1 مجانًا", body: "ألعاب سفر تسعد الصغار.", cta: "امسح للحصول على العرض" },
  },
  {
    name: "Aurora Lounge — Day pass",
    advertiserMatch: (a) => a.name === "Aurora Lounge Bar",
    weights: { tripPurpose: { business: 1 }, cabin: { business: 1, premiumEconomy: 0.6 } },
    filters: { minDwellMinutes: 30 },
    zoneIds: ["T2-C"],
    headline: "Lounge day pass — 20% off", body: "Relax before boarding. Premium comfort, fast Wi-Fi.", cta: "Reserve",
    bg: "#14233b", fg: "#cfe3ff",
    ar: { headline: "تذكرة صالة ليوم — خصم 20٪", body: "استرخِ قبل الصعود. راحة وواي فاي سريع.", cta: "احجز" },
  },
  {
    name: "Cloudmere Coffee — Morning boost",
    advertiserMatch: (a) => a.name === "Cloudmere Coffee",
    weights: { tripPurpose: { business: 0.8 }, ageBand: { "25-34": 0.8, "35-44": 0.8 } },
    filters: {},
    zoneIds: ["T1-A", "T2-C"],
    headline: "Free pastry with any coffee", body: "Before 10am only. Fuel up for the day.", cta: "Scan to claim",
    bg: "#3a2417", fg: "#ffe9cf",
    ar: { headline: "حلوى مجانية مع أي قهوة", body: "قبل الساعة 10 صباحًا فقط.", cta: "امسح للحصول على العرض" },
  },
];

const FILLER_RETAIL = [
  "Horizon Electronics", "Chronos Watches", "Harborline Fashion", "Golden Sands Jewellery",
  "Astra Sunglasses", "Bloom Confectionery", "Northwind Wines & Spirits", "Verdant Skincare",
  "Summit Travel Gear", "Meridian Books & News",
];
const FILLER_FNB = [
  "Skyline Noodle Bar", "Saffron Kitchen", "Burger Dock", "Gelato Meridiano", "Sushi Katana",
];

export function generateCampaigns(
  advertisers: Advertiser[],
): { campaigns: Campaign[]; creatives: Creative[]; promoCodes: PromoCode[] } {
  const r = rng(99);
  const campaigns: Campaign[] = [];
  const creatives: Creative[] = [];
  const promoCodes: PromoCode[] = [];
  const byName = new Map(advertisers.map((a) => [a.name, a]));
  let cN = 0;
  let crN = 0;
  let pN = 0;

  const mkCreative = (advId: string, name: string, bg: string, fg: string, o: ScreenOrientation, en: Spec, ar: Spec["ar"], ai = false): Creative => {
    const id = `CRE-${String(++crN).padStart(3, "0")}`;
    creatives.push({
      id, advertiserId: advId, name: `${name} (${o})`, orientation: o, template: "promo-hero",
      copy: { en: { headline: en.headline, body: en.body, cta: en.cta }, ar },
      bgColor: bg, fgColor: fg, approvalStatus: "approved", aiGenerated: ai,
    });
    return creatives[creatives.length - 1]!;
  };

  const addCampaign = (spec: Spec, advId: string, status: Campaign["status"]) => {
    const cid = `CMP-${String(++cN).padStart(3, "0")}`;
    const cl = mkCreative(advId, spec.name, spec.bg, spec.fg, "landscape", spec, spec.ar);
    const cp = mkCreative(advId, spec.name, spec.bg, spec.fg, "portrait", spec, spec.ar);
    // Day-scale budgets so a full simulated day of plays does not exhaust them;
    // today starts unspent (30-day history is tracked separately).
    const total = (20000 + Math.floor(r() * 100000)) * 100; // $20k–$120k
    campaigns.push({
      id: cid, advertiserId: advId, name: spec.name, status,
      brandSafe: true, competitorGroup: spec.competitorGroup ?? null,
      segmentWeights: spec.weights, hardFilters: spec.filters,
      placement: {
        zoneIds: spec.zoneIds ?? [], screenIds: [], gates: [],
        scheduleStart: dayStart, scheduleEnd: dayEnd, hoursOfDay: [],
      },
      budget: {
        totalCents: total, dailyCapCents: total,
        spentCents: 0, frequencyCapPerHour: 12 + Math.floor(r() * 12),
      },
      triggers: spec.triggers ?? [], creativeIds: [cl.id, cp.id], priority: spec.priority ?? 1,
      createdAt: `2026-09-${String(10 + (cN % 18)).padStart(2, "0")}T09:00:00Z`,
    });
    // One flight-linked promo code per campaign.
    promoCodes.push({
      id: `PRM-${String(++pN).padStart(3, "0")}`, campaignId: cid,
      code: `${spec.name.split(" ")[0]!.toUpperCase().replace(/[^A-Z]/g, "")}${1000 + pN}`,
      validFrom: dayStart, validUntil: dayEnd, linkedFlightId: null, parentCode: null, redeemed: false,
    });
  };

  // Hero specs.
  for (const spec of SPECS) {
    const adv = advertisers.find(spec.advertiserMatch);
    if (adv) addCampaign(spec, adv.id, "running");
  }

  // Airline campaigns (priority in own boarding window; delay goodwill).
  const airlineAdvs = advertisers.filter((a) => a.type === "airline").slice(0, 4);
  airlineAdvs.forEach((adv, i) => {
    const spec: Spec = {
      name: `${adv.name} — Upgrade & lounge`,
      advertiserMatch: () => true,
      weights: { cabin: { business: 0.6, premiumEconomy: 1 }, tripPurpose: { business: 0.6 } },
      filters: {},
      zoneIds: i < 2 ? ["T2-C", "T2-D"] : ["T1-A", "T1-B"],
      priority: 3,
      triggers: [{ kind: "boarding_starts", boost: 1.5 }],
      headline: "Upgrade to Business from $89", body: "Lie-flat comfort and priority boarding.", cta: "Upgrade now",
      bg: "#0a2342", fg: "#e6f0ff",
      ar: { headline: "رقِّ إلى درجة الأعمال", body: "راحة ودخول أولوية.", cta: "رقِّ الآن" },
    };
    addCampaign(spec, adv.id, "running");
  });
  // Delay goodwill (co-funded F&B).
  const goodwillAdv = airlineAdvs[0];
  if (goodwillAdv) {
    addCampaign(
      {
        name: `${goodwillAdv.name} — Delay goodwill meal`,
        advertiserMatch: () => true,
        weights: { tripPurpose: { business: 0.3, holiday: 0.5, vff: 0.5 } },
        filters: {},
        zoneIds: ["T2-C", "T2-D", "T1-A", "T1-B"],
        triggers: [{ kind: "delay_over", threshold: 45, boost: 2.0 }],
        headline: "Delayed? Meal voucher on us", body: "A coffee and a bite while you wait. Co-funded with Harvest Table.", cta: "Scan to claim",
        bg: "#3b1f1f", fg: "#ffe3e3",
        ar: { headline: "تأخرت رحلتك؟ وجبة على حسابنا", body: "قهوة ووجبة خفيفة أثناء الانتظار.", cta: "امسح للحصول على العرض" },
      },
      goodwillAdv.id,
      "running",
    );
  }

  // Filler retail + F&B to reach 25, with varied statuses for the approval queue.
  const fillers = [...FILLER_RETAIL, ...FILLER_FNB];
  for (const name of fillers) {
    if (cN >= 25) break;
    const adv = byName.get(name);
    if (!adv) continue;
    const status: Campaign["status"] = cN % 7 === 0 ? "pending_approval" : cN % 11 === 0 ? "paused" : "running";
    addCampaign(
      {
        name: `${name} — Seasonal offer`,
        advertiserMatch: () => true,
        weights: adv.type === "fnb"
          ? { tripPurpose: { holiday: 0.5, business: 0.4 } }
          : { tripPurpose: { holiday: 0.6 }, partyType: { couple: 0.5 }, internationalPreference: 0.4 },
        filters: adv.category === "duty-free" || adv.category === "luxury" ? { internationalOnly: true } : {},
        zoneIds: [],
        headline: `${name}: save this week`, body: "Limited-time airport offer.", cta: "Scan to claim",
        bg: "#1d2b2b", fg: "#dffaf0",
        ar: { headline: `${name}: وفّر هذا الأسبوع`, body: "عرض محدود في المطار.", cta: "امسح للحصول على العرض" },
      },
      adv.id,
      status,
    );
  }

  return { campaigns, creatives, promoCodes };
}
