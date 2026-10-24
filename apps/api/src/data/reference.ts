/**
 * Fictional MQI (Meridian International) reference data, taken from the sample
 * README. T1 = domestic, T2 = international. Everything here is invented; it
 * drives the generator and the plausibility of crowd profiles.
 */
import type { AircraftType, AdvertiserType } from "@arm/core";

export interface AirlineRef {
  iata: string;
  icao: string;
  name: string;
  market: "domestic" | "international" | "both";
  lowCost: boolean;
}

export const AIRLINES: AirlineRef[] = [
  { iata: "XD", icao: "SKJ", name: "Skylark Air", market: "both", lowCost: true },
  { iata: "YA", icao: "AUQ", name: "Aurora National Airlines", market: "domestic", lowCost: false },
  { iata: "YN", icao: "KSQ", name: "Kestrel Air", market: "domestic", lowCost: true },
  { iata: "XU", icao: "CWQ", name: "Coralwing Express", market: "domestic", lowCost: true },
  { iata: "YF", icao: "SVZ", name: "Sunvale Airlines", market: "domestic", lowCost: true },
  { iata: "ZO", icao: "SLQ", name: "Solano Airways", market: "international", lowCost: false },
  { iata: "XH", icao: "HCZ", name: "Halcyon Airways", market: "international", lowCost: false },
  { iata: "YG", icao: "ACZ", name: "Alpine Continental Airlines", market: "international", lowCost: false },
  { iata: "XI", icao: "CRU", name: "Crescent Airways", market: "international", lowCost: false },
  { iata: "YU", icao: "LPZ", name: "Lumen Pacific Airlines", market: "international", lowCost: false },
  { iata: "YB", icao: "NSZ", name: "Northstar Atlantic", market: "international", lowCost: false },
];

export interface AirportRef {
  code: string;
  city: string;
  domestic: boolean;
  region: string; // destination region for targeting
}

export const AIRPORTS: AirportRef[] = [
  { code: "MQI", city: "Meridian", domestic: true, region: "Home" },
  // domestic
  { code: "ADN", city: "Aldmere", domestic: true, region: "Domestic North" },
  { code: "BWZ", city: "Brightwater", domestic: true, region: "Domestic Coast" },
  { code: "CBP", city: "Calder Bay", domestic: true, region: "Domestic Coast" },
  { code: "CPZ", city: "Coralport", domestic: true, region: "Domestic Coast" },
  { code: "DMQ", city: "Dunmore", domestic: true, region: "Domestic North" },
  { code: "EHQ", city: "Eastholm", domestic: true, region: "Domestic East" },
  { code: "FHQ", city: "Fairhaven", domestic: true, region: "Domestic East" },
  { code: "GRH", city: "Glenrock", domestic: true, region: "Domestic North" },
  { code: "GSZ", city: "Goldsand", domestic: true, region: "Domestic South" },
  { code: "HCX", city: "Highcliff", domestic: true, region: "Domestic South" },
  { code: "IVQ", city: "Ironvale", domestic: true, region: "Domestic West" },
  { code: "JFQ", city: "Juniper Falls", domestic: true, region: "Domestic West" },
  { code: "LMW", city: "Lakemont", domestic: true, region: "Domestic West" },
  { code: "NGV", city: "Northgate", domestic: true, region: "Domestic North" },
  { code: "OKZ", city: "Oakridge", domestic: true, region: "Domestic South" },
  // international
  { code: "BVQ", city: "Belvista", domestic: false, region: "Gulf" },
  { code: "KST", city: "Kastell", domestic: false, region: "Europe" },
  { code: "NVQ", city: "Novaterra", domestic: false, region: "Asia" },
  { code: "PVQ", city: "Port Valen", domestic: false, region: "Europe" },
  { code: "SCJ", city: "Santa Corvina", domestic: false, region: "Americas" },
  { code: "SMG", city: "Solmara", domestic: false, region: "Gulf" },
  { code: "ZHQ", city: "Zarhan", domestic: false, region: "Gulf" },
];

/** ICAO type designators used in the sample, with seat maps. */
export const AIRCRAFT: AircraftType[] = [
  { code: "A20N", name: "Airbus A320neo", seats: { economy: 156, premiumEconomy: 18, business: 12 }, totalSeats: 186 },
  { code: "A21N", name: "Airbus A321neo", seats: { economy: 190, premiumEconomy: 24, business: 18 }, totalSeats: 232 },
  { code: "A359", name: "Airbus A350-900", seats: { economy: 210, premiumEconomy: 42, business: 31 }, totalSeats: 283 },
  { code: "A388", name: "Airbus A380-800", seats: { economy: 399, premiumEconomy: 76, business: 76 }, totalSeats: 551 },
  { code: "AT76", name: "ATR 72-600", seats: { economy: 70, premiumEconomy: 0, business: 0 }, totalSeats: 70 },
  { code: "B38M", name: "Boeing 737 MAX 8", seats: { economy: 162, premiumEconomy: 16, business: 11 }, totalSeats: 189 },
  { code: "B738", name: "Boeing 737-800", seats: { economy: 162, premiumEconomy: 12, business: 12 }, totalSeats: 186 },
  { code: "B748", name: "Boeing 747-8", seats: { economy: 290, premiumEconomy: 32, business: 42 }, totalSeats: 364 },
  { code: "B77W", name: "Boeing 777-300ER", seats: { economy: 304, premiumEconomy: 44, business: 36 }, totalSeats: 384 },
  { code: "B788", name: "Boeing 787-8", seats: { economy: 204, premiumEconomy: 21, business: 21 }, totalSeats: 246 },
  { code: "B789", name: "Boeing 787-9", seats: { economy: 236, premiumEconomy: 21, business: 33 }, totalSeats: 290 },
];

export const AIRCRAFT_BY_CODE = new Map(AIRCRAFT.map((a) => [a.code, a]));
export const AIRPORT_BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));
export const AIRLINE_BY_IATA = new Map(AIRLINES.map((a) => [a.iata, a]));

export const GROUND_HANDLERS = [
  "Skylark self-handling",
  "Meridian Ground Services",
  "Harbor Aviation Services",
  "Compass Ground Handling",
];

/**
 * Terminal / zone / gate topology. T1 domestic (concourses A,B), T2
 * international (concourses C,D). Each zone groups a band of gates and has a
 * floor-plan position (0..100) for the network map.
 */
export interface ZoneRef {
  id: string;
  terminalId: string;
  name: string;
  concourse: string;
  gates: string[];
  x: number;
  y: number;
  domestic: boolean;
}

function gateRange(prefix: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${prefix}${i}`);
  return out;
}

export const TERMINALS = [
  { id: "T1", name: "Terminal 1 (Domestic)", concourses: ["A", "B"] },
  { id: "T2", name: "Terminal 2 (International)", concourses: ["C", "D"] },
];

export const ZONES: ZoneRef[] = [
  { id: "T1-A", terminalId: "T1", name: "T1 Concourse A (Gates A1–A10)", concourse: "A", gates: gateRange("A", 1, 10), x: 18, y: 30, domestic: true },
  { id: "T1-B", terminalId: "T1", name: "T1 Concourse B (Gates B1–B10)", concourse: "B", gates: gateRange("B", 1, 10), x: 18, y: 62, domestic: true },
  { id: "T1-RET", terminalId: "T1", name: "T1 Retail Plaza", concourse: "A", gates: [], x: 30, y: 46, domestic: true },
  { id: "T2-C", terminalId: "T2", name: "T2 Concourse C (Gates C1–C20)", concourse: "C", gates: gateRange("C", 1, 20), x: 70, y: 28, domestic: false },
  { id: "T2-D", terminalId: "T2", name: "T2 Concourse D (Gates D1–D20)", concourse: "D", gates: gateRange("D", 1, 20), x: 70, y: 64, domestic: false },
  { id: "T2-DF", terminalId: "T2", name: "T2 Duty-Free Hall", concourse: "C", gates: [], x: 58, y: 46, domestic: false },
];

export const ZONE_BY_ID = new Map(ZONES.map((z) => [z.id, z]));

/** Find the zone that owns a gate code (e.g. "C38" → T2-C by letter band). */
export function zoneForGate(gate: string | null): ZoneRef | null {
  if (!gate) return null;
  const letter = gate[0]?.toUpperCase() ?? "";
  // Sample gates can exceed the published ranges (e.g. C38); map by concourse letter.
  const byLetter: Record<string, string> = { A: "T1-A", B: "T1-B", C: "T2-C", D: "T2-D", V: "T2-C", R: "T1-A" };
  const zid = byLetter[letter];
  return zid ? (ZONE_BY_ID.get(zid) ?? null) : null;
}

export interface OutletSeed {
  name: string;
  type: AdvertiserType;
  category: string;
  zoneId: string;
}

/** 40 fictional outlets / F&B across the terminals. */
export const OUTLET_SEEDS: OutletSeed[] = [
  { name: "Aurelia Duty Free", type: "retailer", category: "duty-free", zoneId: "T2-DF" },
  { name: "Lumière Perfumes", type: "retailer", category: "perfume", zoneId: "T2-DF" },
  { name: "Maison Noir Fragrance", type: "retailer", category: "perfume", zoneId: "T2-C" },
  { name: "Horizon Electronics", type: "retailer", category: "electronics", zoneId: "T2-C" },
  { name: "Meridian Books & News", type: "retailer", category: "books", zoneId: "T1-RET" },
  { name: "Summit Travel Gear", type: "retailer", category: "travel", zoneId: "T1-A" },
  { name: "Little Explorers Toys", type: "retailer", category: "toys", zoneId: "T2-D" },
  { name: "Verdant Skincare", type: "retailer", category: "cosmetics", zoneId: "T2-DF" },
  { name: "Chronos Watches", type: "retailer", category: "luxury", zoneId: "T2-DF" },
  { name: "Harborline Fashion", type: "retailer", category: "fashion", zoneId: "T2-C" },
  { name: "Golden Sands Jewellery", type: "retailer", category: "luxury", zoneId: "T2-DF" },
  { name: "Trailhead Outdoors", type: "retailer", category: "travel", zoneId: "T1-B" },
  { name: "Pixel & Port Tech", type: "retailer", category: "electronics", zoneId: "T1-A" },
  { name: "Bloom Confectionery", type: "retailer", category: "sweets", zoneId: "T2-D" },
  { name: "Astra Sunglasses", type: "retailer", category: "accessories", zoneId: "T2-C" },
  { name: "Northwind Wines & Spirits", type: "retailer", category: "duty-free", zoneId: "T2-DF" },
  { name: "Cloudmere Coffee", type: "fnb", category: "coffee", zoneId: "T1-A" },
  { name: "Cloudmere Coffee T2", type: "fnb", category: "coffee", zoneId: "T2-C" },
  { name: "Harvest Table", type: "fnb", category: "restaurant", zoneId: "T1-RET" },
  { name: "Skyline Noodle Bar", type: "fnb", category: "asian", zoneId: "T2-D" },
  { name: "Olive & Thyme", type: "fnb", category: "mediterranean", zoneId: "T2-C" },
  { name: "The Daily Grind", type: "fnb", category: "coffee", zoneId: "T1-B" },
  { name: "Burger Dock", type: "fnb", category: "fastfood", zoneId: "T1-A" },
  { name: "Saffron Kitchen", type: "fnb", category: "indian", zoneId: "T2-D" },
  { name: "Brew & Bagel", type: "fnb", category: "cafe", zoneId: "T2-C" },
  { name: "Gelato Meridiano", type: "fnb", category: "dessert", zoneId: "T2-DF" },
  { name: "Pour House Bar", type: "fnb", category: "bar", zoneId: "T2-D" },
  { name: "Green Garden Juicery", type: "fnb", category: "healthy", zoneId: "T1-RET" },
  { name: "Tandoor Express", type: "fnb", category: "indian", zoneId: "T1-B" },
  { name: "Sushi Katana", type: "fnb", category: "asian", zoneId: "T2-C" },
  { name: "Café Lumen", type: "fnb", category: "coffee", zoneId: "T2-D" },
  { name: "Highland Tea Room", type: "fnb", category: "cafe", zoneId: "T1-A" },
  { name: "Firepit Grill", type: "fnb", category: "restaurant", zoneId: "T2-D" },
  { name: "Wrap It Up", type: "fnb", category: "fastfood", zoneId: "T1-B" },
  { name: "Aurora Lounge Bar", type: "fnb", category: "bar", zoneId: "T2-C" },
  { name: "Meridian Pharmacy", type: "retailer", category: "pharmacy", zoneId: "T1-RET" },
  { name: "Travel Essentials Co", type: "retailer", category: "convenience", zoneId: "T2-D" },
  { name: "Kids Corner", type: "retailer", category: "toys", zoneId: "T1-A" },
  { name: "Luxe Leather", type: "retailer", category: "luxury", zoneId: "T2-DF" },
  { name: "Orchid Florist", type: "retailer", category: "gifts", zoneId: "T1-RET" },
];
