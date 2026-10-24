/**
 * ACI ACRIS adapter (FIWARE Smart Data Models, NGSI-LD).
 *
 * Supplies airport topology (terminals, zones→concourses, checkpoints) and
 * passenger-flow measurements. In the POC, queue measurements are derived from
 * the pax dwelling in each zone; a live adapter would read NGSI-LD entities
 * (QueueingProcess / Measurement) from an ACRIS context broker unchanged.
 */
import type { Checkpoint, Flight, QueueMeasurement, Terminal, Zone } from "@arm/core";
import { generateTopology } from "../data/generator.js";

export class MockAcrisSource {
  readonly id = "mock-acris";
  private topo = generateTopology();

  async topology(): Promise<{ terminals: Terminal[]; zones: Zone[]; checkpoints: Checkpoint[] }> {
    return this.topo;
  }

  /**
   * Compute a queue measurement per checkpoint from the passengers currently in
   * the checkpoint's zone (pax / throughput → queue length and wait).
   */
  measure(now: string, paxByZone: Record<string, number>): QueueMeasurement[] {
    const out: QueueMeasurement[] = [];
    for (const cp of this.topo.checkpoints) {
      const zonePax = paxByZone[cp.zoneId] ?? 0;
      // Security/immigration form queues; boarding gauges gate crowding.
      const share = cp.type === "security" ? 0.5 : cp.type === "immigration" ? 0.35 : 0.8;
      const throughputPerMin = cp.type === "boarding" ? 25 : cp.type === "immigration" ? 12 : 18;
      const queueLength = Math.round(zonePax * share * 0.25);
      const waitMinutes = Math.round((queueLength / Math.max(1, throughputPerMin)) * 10) / 10;
      out.push({
        id: `QM-${cp.id}-${Date.parse(now)}`,
        checkpointId: cp.id,
        zoneId: cp.zoneId,
        at: now,
        queueLength,
        waitMinutes,
        throughputPerMin,
      });
    }
    return out;
  }

  /** NGSI-LD representation of a zone (for the feed-health / adapter demo). */
  static toNgsiLd(zone: Zone): Record<string, unknown> {
    return {
      id: `urn:ngsi-ld:AirportZone:MQI:${zone.id}`,
      type: "AirportZone",
      "@context": ["https://smart-data-models.github.io/dataModel.ACRIS/context.jsonld"],
      name: { type: "Property", value: zone.name },
      refTerminal: { type: "Relationship", object: `urn:ngsi-ld:Terminal:MQI:${zone.terminalId}` },
      gates: { type: "Property", value: zone.gates },
      location: {
        type: "GeoProperty",
        value: { type: "Point", coordinates: [zone.x, zone.y] },
      },
    };
  }
}
