/**
 * GenAI creative assistant provider.
 *
 * The default `mock-template` provider turns a brief into a ready ad page using
 * templates, in English plus the configured second language, with NO API key —
 * so the demo always works offline. `CREATIVE_PROVIDER=openai` would swap in a
 * real provider behind the same interface.
 */
import type { CreativeProvider } from "@arm/core";

const PALETTES = [
  { bg: "#2a1b3d", fg: "#f6e9ff" },
  { bg: "#0b4f6c", fg: "#fff4d6" },
  { bg: "#3a2417", fg: "#ffe9cf" },
  { bg: "#14233b", fg: "#cfe3ff" },
  { bg: "#1d2b2b", fg: "#dffaf0" },
];

/** Crude but deterministic Arabic rendering for a few common promo phrases. */
const AR_LEXICON: Record<string, string> = {
  off: "خصم", free: "مجانًا", sale: "تخفيضات", gift: "هدية", coffee: "قهوة",
  family: "العائلة", kids: "الأطفال", duty: "السوق الحرة", lounge: "الصالة",
  upgrade: "ترقية", meal: "وجبة", discount: "خصم", festive: "احتفالي", sweets: "حلويات",
};

function arabicize(brief: string, percent: string | null): { headline: string; body: string; cta: string } {
  const words = brief.toLowerCase().split(/\s+/);
  const hit = words.map((w) => AR_LEXICON[w.replace(/[^a-z]/g, "")]).filter(Boolean);
  const headline = (percent ? `${percent} ${AR_LEXICON.off}` : (hit[0] ?? "عرض خاص")) + " في المطار";
  const body = `${hit.slice(0, 3).join(" ") || "عرض محدود"} — امسح الرمز لتفعيل العرض.`;
  return { headline, body, cta: "امسح للحصول على العرض" };
}

export class MockCreativeProvider implements CreativeProvider {
  readonly id = "mock-template";
  constructor(private secondLanguage = "ar") {}

  async generate(input: { brief: string; orientation: "portrait" | "landscape"; languages: string[] }) {
    const brief = input.brief.trim();
    const percentMatch = brief.match(/(\d{1,2})\s?%/);
    const percent = percentMatch ? `${percentMatch[1]}%` : null;
    const firstClause = brief.split(/[,.]/)[0]?.trim() || brief;
    const palette = PALETTES[Math.abs(hash(brief)) % PALETTES.length]!;

    const en = {
      headline: percent ? `${percent} off — ${titleCase(firstClause)}` : titleCase(firstClause),
      body: `${capitalize(brief)}. Scan the code to claim before boarding.`,
      cta: "Scan to claim",
    };
    const copy: Record<string, { headline: string; body: string; cta: string }> = { en };
    const second = input.languages.find((l) => l !== "en") ?? this.secondLanguage;
    if (second === "ar") copy.ar = arabicize(brief, percent);
    else copy[second] = en; // fall back to EN text for other languages in the mock

    return { copy, bgColor: palette.bg, fgColor: palette.fg, template: "promo-hero" };
  }
}

export function makeCreativeProvider(cfg: Record<string, string>): CreativeProvider {
  // Only the mock is wired in the POC; a real provider slots in here by id.
  return new MockCreativeProvider(cfg.SECOND_LANGUAGE ?? "ar");
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}
const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const titleCase = (s: string) => s.split(/\s+/).map(capitalize).join(" ");
