/**
 * AODB adapter.
 *
 * Translates the airport operational database CSV (33 columns, one row per
 * flight leg, arrival/departure pairs linked by `linked_flight_id`, paired
 * A-CDM columns) into canonical {@link Flight} records. The mock reads a file;
 * a real vendor adapter would implement the same {@link FlightSource} snapshot
 * from the vendor API and nothing else in the app would change.
 */
import { readFileSync } from "node:fs";
import type { Flight, FlightStatus, DomesticInternational } from "@arm/core";
import { buildFlightProfile } from "../data/profile.js";
import { AIRLINE_BY_IATA, zoneForGate } from "../data/reference.js";

const COLS = [
  "aodb_flight_id", "linked_flight_id", "direction", "airline_iata", "airline_icao",
  "flight_number", "callsign", "service_type", "flight_nature", "origin", "destination",
  "via", "terminal", "STA_STD", "ETA_ETD", "ELDT_ETOT", "ALDT_ATOT", "AIBT_AOBT", "TOBT",
  "TSAT", "stand", "gate", "checkin_counters", "baggage_belt", "aircraft_reg",
  "aircraft_type_icao", "seats", "pax_total", "status", "delay_codes", "codeshares",
  "handler", "last_update_utc",
] as const;
type Col = (typeof COLS)[number];

function parseCsv(text: string): Array<Record<Col, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0]!.split(",");
  const rows: Array<Record<Col, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",");
    const row = {} as Record<Col, string>;
    header.forEach((h, idx) => {
      (row as Record<string, string>)[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

const nullable = (v: string): string | null => (v && v.length > 0 ? v : null);

function minutesBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return Math.round((Date.parse(b) - Date.parse(a)) / 60000);
}

/** Parse the AODB CSV into canonical flights (+ profiles). */
export function parseAodbCsv(text: string): Flight[] {
  const rows = parseCsv(text);
  const flights: Flight[] = [];
  for (const r of rows) {
    const direction = r.direction === "A" ? "arrival" : "departure";
    const domesticInternational: DomesticInternational = r.flight_nature === "I" ? "international" : "domestic";
    const scheduledTime = r.STA_STD;
    const estimatedTime = nullable(r.ETA_ETD);
    const actualTime = nullable(r.ALDT_ATOT);
    const delayMinutes = Math.max(0, minutesBetween(scheduledTime, estimatedTime));
    const status: FlightStatus = r.status === "CNL" ? "cancelled" : "scheduled";
    const gate = nullable(r.gate);
    const zone = zoneForGate(gate);
    const lowCost = AIRLINE_BY_IATA.get(r.airline_iata)?.lowCost ?? false;
    const paxCount = Number.parseInt(r.pax_total || "0", 10) || 0;

    const profile = buildFlightProfile({
      flightId: r.aodb_flight_id,
      direction,
      domestic: domesticInternational === "domestic",
      destination: r.destination,
      scheduledTime,
      aircraftTypeCode: r.aircraft_type_icao,
      paxCount,
      delayMinutes,
      lowCost,
    });

    flights.push({
      id: r.aodb_flight_id,
      airlineCode: r.airline_iata,
      flightNumber: `${r.airline_iata}${r.flight_number}`,
      direction,
      origin: r.origin,
      destination: r.destination,
      via: nullable(r.via),
      domesticInternational,
      aircraftTypeCode: r.aircraft_type_icao,
      paxCount,
      scheduledTime,
      estimatedTime,
      actualTime,
      tobt: nullable(r.TOBT),
      tsat: nullable(r.TSAT),
      aibt: direction === "arrival" ? nullable(r.AIBT_AOBT) : null,
      aobt: direction === "departure" ? nullable(r.AIBT_AOBT) : null,
      stand: nullable(r.stand),
      gate,
      checkInCounters: nullable(r.checkin_counters),
      belt: nullable(r.baggage_belt),
      status,
      delayCode: nullable(r.delay_codes),
      delayMinutes,
      terminalId: r.terminal || (domesticInternational === "international" ? "T2" : "T1"),
      zoneId: zone?.id ?? null,
      profile,
    });
  }
  return flights;
}

export function parseAodbFile(path: string): Flight[] {
  return parseAodbCsv(readFileSync(path, "utf8"));
}
