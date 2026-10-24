import { useStore } from "./store";

/** Minimal i18n for UI chrome. Ad/claim content is localised separately by the
 * creative copy. English is the base; the configured second language (Arabic in
 * the default config) overrides where a key is present. */
type Dict = Record<string, string>;

const EN: Dict = {
  "app.subtitle": "Meridian International · retail media",
  "role.admin": "Platform Admin",
  "role.retailer": "Retailer",
  "role.media": "Media Manager",
  "role.airline": "Airline Rep",
  "role.passenger": "Passenger Screen",
  "role.demo": "Split-screen demo",
  "sim.play": "Play", "sim.pause": "Pause", "sim.jump": "Jump", "sim.inject": "Inject event",
  "admin.title": "Operator console",
  "retailer.title": "Retailer dashboard",
  "media.title": "Media manager — sales & inventory",
  "airline.title": "Airline representative",
  "passenger.title": "Passenger screen simulator",
  "demo.title": "Split-screen demo",
  "lang.name": "English",
};

const AR: Dict = {
  "app.subtitle": "مطار ميريديان الدولي · وسائط التجزئة",
  "role.admin": "مشرف المنصة",
  "role.retailer": "متجر التجزئة",
  "role.media": "مدير الوسائط",
  "role.airline": "ممثل شركة الطيران",
  "role.passenger": "شاشة المسافر",
  "role.demo": "عرض مقسّم",
  "sim.play": "تشغيل", "sim.pause": "إيقاف", "sim.jump": "انتقال", "sim.inject": "إدخال حدث",
  "admin.title": "وحدة تحكم المشغّل",
  "retailer.title": "لوحة متجر التجزئة",
  "media.title": "مدير الوسائط — المبيعات والمخزون",
  "airline.title": "ممثل شركة الطيران",
  "passenger.title": "محاكي شاشة المسافر",
  "demo.title": "عرض مقسّم",
  "lang.name": "العربية",
};

const TABLES: Record<string, Dict> = { en: EN, ar: AR };

export function useT(): { t: (k: string) => string; lang: string; rtl: boolean } {
  const lang = useStore((s) => s.lang);
  const table = TABLES[lang] ?? EN;
  const t = (k: string) => table[k] ?? EN[k] ?? k;
  return { t, lang, rtl: lang === "ar" };
}
