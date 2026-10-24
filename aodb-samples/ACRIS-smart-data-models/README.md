# ACRIS Smart Data Models (NGSI-LD) — reference entities

These example entities and minimal JSON Schemas illustrate the ACI ACRIS /
FIWARE Smart Data Models shape the ACRIS adapter consumes (terminals,
concourses/zones, checkpoints and passenger-queue measurements). They follow the
public **dataModel.ACRIS** project
(https://github.com/smart-data-models/dataModel.ACRIS) conventions; the values
are synthetic for the fictional airport **MQI (Meridian International)**.

The POC's `MockAcrisSource` (`apps/api/src/adapters/acris.ts`) emits the same
canonical `Terminal` / `Zone` / `Checkpoint` / `QueueMeasurement` shapes and
exposes `toNgsiLd()` to render entities like `AirportZone.example.jsonld`. A live
deployment reads these NGSI-LD entities from an ACRIS context broker unchanged
and sets `QUEUE_SOURCE=acris-ngsi`.

Files:
- `Terminal.example.jsonld` — an airport terminal entity.
- `AirportZone.example.jsonld` — a concourse/zone with gates and a location.
- `Checkpoint.example.jsonld` — a security/boarding checkpoint (PassengerProcess).
- `QueueMeasurement.example.jsonld` — a queue/throughput measurement.
- `QueueMeasurement.schema.json` — minimal JSON Schema for the measurement.
