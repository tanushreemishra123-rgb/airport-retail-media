# Data Adapter Guide

The application core only ever sees the **canonical model** in
`packages/core/src/model.ts`. Every external feed is translated into it by an
adapter that implements a contract in `packages/core/src/adapters.ts`. Going
live with a real source means writing one new adapter and changing one env
value — no business-logic changes.

## Contracts

```ts
interface FlightSource {           // AODB snapshot + AIDX real-time updates
  snapshot(): Promise<{ flights: Flight[]; aircraftTypes: AircraftType[] }>;
  stream(signal: AbortLike): AsyncIterable<FlightEvent>;
}
interface QueueSource {            // ACRIS topology + passenger-flow measurements
  topology(): Promise<{ terminals; zones; checkpoints }>;
  stream(signal: AbortLike): AsyncIterable<QueueMeasurement>;
}
interface CreativeProvider {       // GenAI creative assistant
  generate(input): Promise<{ copy; bgColor; fgColor; template }>;
}
```

Selection is by environment variable:

```
FLIGHT_SOURCE    = mock-aidx   | vendor-api
QUEUE_SOURCE     = mock-acris  | acris-ngsi
CREATIVE_PROVIDER= mock-template | openai
```

## 1. AODB (flight movements) — `apps/api/src/adapters/aodb.ts`

Input: the 33-column CSV in `aodb-samples/` (one row per leg; arrival/departure
pairs linked by `linked_flight_id`; paired A-CDM columns `STA_STD`, `ETA_ETD`,
`ALDT_ATOT`, `AIBT_AOBT`, plus `TOBT`/`TSAT`).

Mapping highlights:

| CSV column | Canonical `Flight` field |
|---|---|
| `aodb_flight_id` | `id` |
| `direction` (A/D) | `direction` (arrival/departure) |
| `flight_nature` (D/I) | `domesticInternational` |
| `STA_STD` | `scheduledTime` (STA on A rows, STD on D rows) |
| `ETA_ETD` | `estimatedTime` → drives `delayMinutes` |
| `ALDT_ATOT` | `actualTime` |
| `AIBT_AOBT` | `aibt` (A) / `aobt` (D) |
| `gate`, `stand`, `terminal` | `gate`, `stand`, `terminalId` (+ `zoneId` via gate→zone) |
| `aircraft_type_icao`, `seats`, `pax_total` | `aircraftTypeCode`, (seat map), `paxCount` |
| `status` (ARR/DEP/CNL), `delay_codes` | `status`, `delayCode` |

The adapter also attaches a mock **crowd profile** per flight (see
`data/profile.ts`); a real deployment replaces that with airline aggregated
booking mix / APIS aggregates — nothing else changes.

**To go live:** implement `FlightSource.snapshot()` against the vendor API,
emit the same canonical `Flight[]`, set `FLIGHT_SOURCE=vendor-api`.

## 2. AIDX (real-time leg updates) — `apps/api/src/adapters/aidx.ts`

`parseAidxXml()` turns an `IATA_AIDX_FlightLegNotifRQ` message (see the sample)
into a canonical `FlightEvent` (status/gate/delay), reading `LegIdentifier`,
`PublicStatus`/`OperationalStatus`, `AirportResources` and `OperationTime`.
`toAidxXml()` serialises an event back to AIDX so the feed can be shown as real
messages. During the simulation these events are produced by the sim engine
(the airport's own AODB publishing AIDX, exactly as the sample's
`DeliveringSystem` indicates) and by injected events.

**To go live:** consume the vendor's AIDX stream, run each message through
`parseAidxXml()` with a leg-id resolver.

## 3. ACRIS (topology + queues) — `apps/api/src/adapters/acris.ts`

Supplies terminals, zones (concourses), checkpoints and `QueueMeasurement`s in
the ACI ACRIS / FIWARE Smart Data Models (NGSI-LD) style (`MockAcrisSource`,
with `toNgsiLd()` for the entity representation). Queue measurements are derived
from zone pax in the POC.

**To go live:** read NGSI-LD entities (`QueueingProcess`, `Measurement`) from an
ACRIS context broker, map to `QueueMeasurement`, set `QUEUE_SOURCE=acris-ngsi`.

## 4. Creative provider — `apps/api/src/adapters/creative.ts`

`mock-template` turns a brief into a bilingual (EN + configured second language)
ad page with no API key, so the demo always works. `CREATIVE_PROVIDER=openai`
would swap a real provider behind the same `generate()` interface.

## Derived signal: passenger presence

`packages/core/src/presence.ts` rolls per-flight profiles up to a per-zone,
per-5-minute `ZonePresence`, weighted by gate proximity and time-to-boarding.
Every dashboard KPI and ad decision uses it, and it always carries the evidence
(AODB + ACRIS records with source, timestamp and freshness) that the decision
verification gate checks.
