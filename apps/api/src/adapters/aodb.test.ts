import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseAodbFile } from "./aodb.js";
import { generateAodbCsv } from "../data/generator.js";
import { parseAodbCsv } from "./aodb.js";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(here, "../../../../aodb-samples/MQI_aodb_flights_2026-10-14_SYNTHETIC.csv");

test("parses the supplied AODB sample into canonical flights", () => {
  const flights = parseAodbFile(SAMPLE);
  assert.ok(flights.length >= 300, `expected ~320 legs, got ${flights.length}`);
  const arr = flights.find((f) => f.direction === "arrival")!;
  assert.ok(arr.profile, "each flight carries a crowd profile");
  // XH960 arrival from the sample (aodb_flight_id 100180) is international from ZHQ.
  const xh = flights.find((f) => f.id === "100180");
  assert.ok(xh);
  assert.equal(xh!.domesticInternational, "international");
  assert.equal(xh!.destination, "MQI");
});

test("generator output round-trips through the AODB adapter at scale", () => {
  const csv = generateAodbCsv(450);
  const flights = parseAodbCsv(csv);
  assert.equal(flights.length, 900);
  // every departure with a gate resolves to a zone
  const deps = flights.filter((f) => f.direction === "departure" && f.gate);
  assert.ok(deps.every((f) => f.zoneId), "gated departures map to a zone");
  // profiles sum to ~1 across trip-purpose shares
  const p = flights[0]!.profile;
  const sum = Object.values(p.tripPurpose).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1) < 0.01, `tripPurpose shares sum ~1 (${sum})`);
});
