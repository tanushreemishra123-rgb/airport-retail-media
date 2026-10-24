/**
 * IATA AIDX adapter.
 *
 * Real-time flight-leg updates. This adapter:
 *   - parses an `IATA_AIDX_FlightLegNotifRQ` message into a canonical
 *     {@link FlightEvent} (proves ingestion of the sample message shape);
 *   - serialises a canonical event back to an AIDX message (so the feed can be
 *     shown as real AIDX XML in the UI / feed-health panel).
 *
 * The live stream of events during the simulation is produced by the simulation
 * engine (boarding/departure transitions and injected delays/gate changes),
 * which is the airport's own AODB publishing AIDX — exactly the sample's
 * `DeliveringSystem CompanyShortName="AODB"`.
 */
import type { Evidence, FlightEvent } from "@arm/core";

const AIDX_NS = "http://www.iata.org/IATA/2007/00";

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`));
  return m ? m[1]!.trim() : null;
}

/**
 * Parse an AIDX FlightLegNotifRQ into a canonical FlightEvent. `flightId`
 * resolves the leg to an AODB id (the caller supplies the lookup).
 */
export function parseAidxXml(
  xml: string,
  resolveFlightId: (airline: string, flightNumber: string, origin: string, dest: string) => string | null,
): FlightEvent | null {
  const airline = tag(xml, "Airline");
  const flightNumber = tag(xml, "FlightNumber");
  const dep = tag(xml, "DepartureAirport");
  const arr = tag(xml, "ArrivalAirport");
  const publicStatus = tag(xml, "PublicStatus"); // ARR | DEP | ...
  const opStatus = tag(xml, "OperationalStatus"); // ONB, etc.
  const tsMatch = xml.match(/TimeStamp="([^"]+)"/);
  const at = tsMatch ? tsMatch[1]! : new Date().toISOString();
  if (!airline || !flightNumber || !dep || !arr) return null;

  const flightId = resolveFlightId(airline, flightNumber, dep, arr);
  // Determine event type from operational status.
  const type: FlightEvent["type"] =
    opStatus === "ONB" || publicStatus === "ARR" ? "status_change" : "status_change";

  const evidence: Evidence = {
    source: "aidx",
    entityType: "FlightLeg",
    entityId: `${airline}${flightNumber}`,
    observedAt: at,
    freshnessMs: 0,
    value: { publicStatus, operationalStatus: opStatus },
  };

  return {
    id: `AIDX-${airline}${flightNumber}-${Date.parse(at)}`,
    flightId: flightId ?? `${airline}${flightNumber}`,
    type,
    at,
    change: { publicStatus: publicStatus ?? "", operationalStatus: opStatus ?? "" },
    evidence,
  };
}

/** Serialise a canonical FlightEvent as an AIDX FlightLegNotifRQ message. */
export function toAidxXml(e: FlightEvent, leg: {
  airline: string; flightNumber: string; departureAirport: string; arrivalAirport: string;
  terminal: string; gate: string | null; status: string; international: boolean;
}): string {
  const seq = String(Date.parse(e.at)).slice(-6);
  return `<?xml version="1.0" encoding="UTF-8"?>
<IATA_AIDX_FlightLegNotifRQ xmlns="${AIDX_NS}" Version="16.1" Target="Production"
    TimeStamp="${e.at}" TransactionIdentifier="MQI-AODB-${seq}" SequenceNmbr="${seq}">
  <Originator CompanyShortName="MQI" Code="MQI" CodeContext="3"/>
  <DeliveringSystem CompanyShortName="AODB"/>
  <FlightLeg>
    <LegIdentifier>
      <Airline CodeContext="3">${leg.airline}</Airline>
      <FlightNumber>${leg.flightNumber}</FlightNumber>
      <DepartureAirport CodeContext="3">${leg.departureAirport}</DepartureAirport>
      <ArrivalAirport CodeContext="3">${leg.arrivalAirport}</ArrivalAirport>
    </LegIdentifier>
    <LegData InternalDomesticIndicator="${!leg.international}">
      <PublicStatus>${leg.status}</PublicStatus>
      <AirportResources Usage="Actual">
        <Resource>
          <PassengerGate>${leg.gate ?? ""}</PassengerGate>
          <AircraftTerminal>${leg.terminal}</AircraftTerminal>
        </Resource>
      </AirportResources>
      <OperationTime OperationQualifier="${e.type}" TimeType="ACT">${e.at}</OperationTime>
    </LegData>
  </FlightLeg>
</IATA_AIDX_FlightLegNotifRQ>`;
}
