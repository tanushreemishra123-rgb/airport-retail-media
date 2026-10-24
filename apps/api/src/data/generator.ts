/**
 * Full-scale mock-data generator for one operating day at MQI.
 *
 * Produces, deterministically:
 *   - an AODB CSV in the EXACT 33-column sample shape, at challenge scale
 *     (~900 legs = ~450 arrival/departure pairs), parsed back through the real
 *     AODB adapter so the running app only ever ingests the feed format;
 *   - ACRIS topology (terminals, zones, checkpoints);
 *   - ~180 screens, 40 outlets, advertisers (retail/F&B + 11 airlines),
 *     25 campaigns with 30 days of history, creatives and promo codes.
 */
import type {
  Advertiser, Campaign, Checkpoint, Creative, Flight, Outlet, PromoCode,
  Screen, ScreenOrientation, Terminal, Zone,
} from "@arm/core";
import { parseAodbCsv } from "../adapters/aodb.js";
import {
  AIRCRAFT, AIRLINES, AIRPORTS, GROUND_HANDLERS, OUTLET_SEEDS, TERMINALS, ZONES,
  AIRLINE_BY_IATA,
} from "./reference.js";

const DAY = "2026-10-14";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length) % arr.length]!;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const iso = (base: Date, addMin: number) => new Date(base.getTime() + addMin * 60000).toISOString().replace(".000", "");

const CSV_HEADER =
  "aodb_flight_id,linked_flight_id,direction,airline_iata,airline_icao,flight_number,callsign,service_type,flight_nature,origin,destination,via,terminal,STA_STD,ETA_ETD,ELDT_ETOT,ALDT_ATOT,AIBT_AOBT,TOBT,TSAT,stand,gate,checkin_counters,baggage_belt,aircraft_reg,aircraft_type_icao,seats,pax_total,status,delay_codes,codeshares,handler,last_update_utc";

const DELAY_CODES = ["11", "41", "63", "81", "93", "15", "36"];

function gatesForTerminal(t: "T1" | "T2"): string[] {
  return ZONES.filter((z) => z.terminalId === t && z.gates.length > 0).flatMap((z) => z.gates);
}

/** Generate the full-day AODB CSV at challenge scale. */
export function generateAodbCsv(pairs = 450, seed = 20261014): string {
  const r = rng(seed);
  const rows: string[] = [CSV_HEADER];
  const dayStart = new Date(`${DAY}T00:00:00Z`);
  const intlAirports = AIRPORTS.filter((a) => !a.domestic && a.code !== "MQI");
  const domAirports = AIRPORTS.filter((a) => a.domestic && a.code !== "MQI");
  const t1Gates = gatesForTerminal("T1");
  const t2Gates = gatesForTerminal("T2");
  let id = 100000;

  for (let i = 0; i < pairs; i++) {
    const international = r() < 0.45;
    const airline = pick(
      r,
      AIRLINES.filter((a) => (international ? a.market !== "domestic" : a.market !== "international")),
    );
    const other = international ? pick(r, intlAirports) : pick(r, domAirports);
    const ac = pick(r, international ? AIRCRAFT.filter((a) => a.totalSeats > 180) : AIRCRAFT.filter((a) => a.totalSeats <= 290));
    const terminal = international ? "T2" : "T1";
    const gate = pick(r, terminal === "T1" ? t1Gates : t2Gates);
    const stand = `S${pad(Math.floor(r() * 80) + 1)}`;
    const reg = `Q${pick(r, ["M", "H", "D", "A"])}-${String.fromCharCode(65 + Math.floor(r() * 26))}${String.fromCharCode(65 + Math.floor(r() * 26))}`;
    const handler = pick(r, GROUND_HANDLERS);
    const nature = international ? "I" : "D";
    const flightNum = Math.floor(r() * 8900) + 100;

    // Arrival bank 06:00–21:00; turnaround 45–120 min.
    const arrMin = 360 + Math.floor(r() * 900);
    const turn = 45 + Math.floor(r() * 75);
    const depMin = arrMin + turn;
    const arrDelay = r() < 0.22 ? 10 + Math.floor(r() * 110) : 0;
    const depDelay = r() < 0.22 ? 10 + Math.floor(r() * 90) : Math.max(0, arrDelay - 10);
    const cancelled = r() < 0.015;

    const seats = ac.totalSeats;
    const load = 0.6 + r() * 0.35;
    const arrPax = Math.round(seats * load);
    const depPax = Math.round(seats * Math.min(0.98, load + (r() - 0.5) * 0.1));
    const beltNo = Math.floor(r() * 14) + 1;
    const ciFrom = Math.floor(r() * 40) + 1;

    const arrId = id++;
    const depId = id++;
    const aStatus = cancelled ? "CNL" : "ARR";
    const dStatus = cancelled ? "CNL" : "DEP";
    const codeshare = r() < 0.3 ? `${pick(r, AIRLINES).iata}|${airline.iata}` : "";
    const arrDelayCode = arrDelay > 0 ? pick(r, DELAY_CODES) : "";
    const depDelayCode = depDelay > 0 ? pick(r, DELAY_CODES) : "";

    // Arrival row (direction A): origin=other, destination=MQI
    rows.push([
      arrId, depId, "A", airline.iata, airline.icao, flightNum, `${airline.icao}${flightNum}`, "J", nature,
      other.code, "MQI", "", terminal,
      iso(dayStart, arrMin), iso(dayStart, arrMin + arrDelay), iso(dayStart, arrMin + arrDelay - 8),
      cancelled ? "" : iso(dayStart, arrMin + arrDelay - 8), cancelled ? "" : iso(dayStart, arrMin + arrDelay),
      "", "", stand, gate, "", `BELT${beltNo}`, reg, ac.code, seats, cancelled ? 0 : arrPax, aStatus,
      arrDelayCode, codeshare, handler, iso(dayStart, 1560),
    ].join(","));

    // Departure row (direction D): origin=MQI, destination=other
    const depGate = pick(r, terminal === "T1" ? t1Gates : t2Gates);
    rows.push([
      depId, arrId, "D", airline.iata, airline.icao, flightNum + 1, `${airline.icao}${flightNum + 1}`, "J", nature,
      "MQI", other.code, "", terminal,
      iso(dayStart, depMin), iso(dayStart, depMin + depDelay), iso(dayStart, depMin + depDelay + 12),
      cancelled ? "" : iso(dayStart, depMin + depDelay + 12), cancelled ? "" : iso(dayStart, depMin + depDelay),
      iso(dayStart, depMin + depDelay - 5), iso(dayStart, depMin + depDelay - 3),
      stand, depGate, `${terminal}-${String.fromCharCode(65 + Math.floor(r() * 8))}${pad(ciFrom)}-${ciFrom + 8}`,
      "", reg, ac.code, seats, cancelled ? 0 : depPax, dStatus, depDelayCode, codeshare, handler, iso(dayStart, 1560),
    ].join(","));
  }
  return rows.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Platform topology + inventory
// ---------------------------------------------------------------------------
export function generateTopology(): { terminals: Terminal[]; zones: Zone[]; checkpoints: Checkpoint[] } {
  const terminals: Terminal[] = TERMINALS.map((t) => ({ id: t.id, name: t.name, concourses: t.concourses }));
  const zones: Zone[] = ZONES.map((z) => ({ id: z.id, terminalId: z.terminalId, name: z.name, gates: z.gates, x: z.x, y: z.y }));
  const checkpoints: Checkpoint[] = [];
  for (const z of ZONES) {
    checkpoints.push({ id: `${z.id}-SEC`, zoneId: z.id, type: "security", name: `${z.name} security` });
    if (!z.domestic) checkpoints.push({ id: `${z.id}-IMM`, zoneId: z.id, type: "immigration", name: `${z.name} immigration` });
    if (z.gates.length > 0) checkpoints.push({ id: `${z.id}-BRD`, zoneId: z.id, type: "boarding", name: `${z.name} boarding` });
  }
  return { terminals, zones, checkpoints };
}

/** ~180 screens across the zones, biased to gate-dense international concourses. */
export function generateScreens(seed = 7): Screen[] {
  const r = rng(seed);
  const screens: Screen[] = [];
  const now = `${DAY}T06:00:00Z`;
  let n = 0;
  const perZone: Record<string, number> = { "T1-A": 24, "T1-B": 24, "T1-RET": 16, "T2-C": 46, "T2-D": 46, "T2-DF": 24 };
  for (const z of ZONES) {
    const count = perZone[z.id] ?? 20;
    for (let i = 0; i < count; i++) {
      const orientation: ScreenOrientation = r() < 0.5 ? "landscape" : "portrait";
      const roll = r();
      const status = roll < 0.9 ? "online" : roll < 0.96 ? "degraded" : "offline";
      const nearest = z.gates.length
        ? [z.gates[i % z.gates.length]!, z.gates[(i + 1) % z.gates.length]!]
        : [];
      screens.push({
        id: `SCR-${pad(++n, 4)}`,
        name: `${z.concourse ?? z.id} screen ${i + 1}`,
        zoneId: z.id,
        nearestGates: nearest,
        sizeInches: pick(r, [43, 49, 55, 65, 75, 86]),
        orientation,
        status,
        lastSeen: now,
        latencyMs: 20 + Math.floor(r() * 80),
      });
    }
  }
  return screens;
}

export function generateAdvertisersAndOutlets(): { advertisers: Advertiser[]; outlets: Outlet[] } {
  const advertisers: Advertiser[] = [];
  const outlets: Outlet[] = [];
  OUTLET_SEEDS.forEach((o, i) => {
    const advId = `ADV-${pad(i + 1, 3)}`;
    advertisers.push({ id: advId, name: o.name, type: o.type, category: o.category });
    outlets.push({ id: `OUT-${pad(i + 1, 3)}`, advertiserId: advId, name: o.name, zoneId: o.zoneId, category: o.category });
  });
  // Airlines as advertisers.
  AIRLINES.forEach((a, i) => {
    advertisers.push({ id: `ADV-AL-${a.iata}`, name: a.name, type: "airline", airlineCode: a.iata, category: "airline" });
  });
  return { advertisers, outlets };
}

export interface GeneratedData {
  flights: Flight[];
  aodbCsv: string;
  terminals: Terminal[];
  zones: Zone[];
  checkpoints: Checkpoint[];
  screens: Screen[];
  advertisers: Advertiser[];
  outlets: Outlet[];
  campaigns: Campaign[];
  creatives: Creative[];
  promoCodes: PromoCode[];
}

export { DAY, AIRLINE_BY_IATA };
export { generateCampaigns } from "./campaigns.js";

/** Build the whole dataset (flights via the real AODB adapter). */
export function generateAll(pairs = 450): Omit<GeneratedData, "campaigns" | "creatives" | "promoCodes"> {
  const aodbCsv = generateAodbCsv(pairs);
  const flights = parseAodbCsv(aodbCsv);
  const { terminals, zones, checkpoints } = generateTopology();
  const screens = generateScreens();
  const { advertisers, outlets } = generateAdvertisersAndOutlets();
  return { flights, aodbCsv, terminals, zones, checkpoints, screens, advertisers, outlets };
}
