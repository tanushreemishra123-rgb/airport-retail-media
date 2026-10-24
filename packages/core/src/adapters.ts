/**
 * Adapter contracts.
 *
 * Each external source is reached ONLY through one of these interfaces. A mock
 * implementation (reads the bundled sample feeds) and a stub `Live`
 * implementation (the shape a real vendor integration would take) exist for
 * each. Switching is a single config value, e.g.:
 *
 *   FLIGHT_SOURCE = mock-aidx | vendor-api
 *   QUEUE_SOURCE  = mock-acris | acris-ngsi
 *
 * The app core depends on these interfaces, never on a concrete source, so
 * going live means writing one new adapter and changing one env value.
 */
import type {
  AircraftType,
  Checkpoint,
  Flight,
  FlightEvent,
  QueueMeasurement,
  Terminal,
  Zone,
} from "./model.js";

/**
 * Minimal, environment-agnostic stop signal. A real `AbortSignal` (Node or DOM)
 * satisfies this structurally, so `core` needs no DOM/Node lib to stay portable
 * between the backend and the browser bundle.
 */
export interface AbortLike {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

/** Flight movements + real-time leg updates (AODB snapshot + AIDX stream). */
export interface FlightSource {
  readonly id: string; // e.g. "mock-aidx"
  /** One-day snapshot of all flight legs (canonical). */
  snapshot(): Promise<{ flights: Flight[]; aircraftTypes: AircraftType[] }>;
  /**
   * Real-time flight-leg updates as they occur in simulation time. The
   * simulation clock drives emission; each yielded event carries its evidence.
   */
  stream(signal: AbortLike): AsyncIterable<FlightEvent>;
}

/** Airport topology + passenger-flow measurements (ACRIS / FIWARE). */
export interface QueueSource {
  readonly id: string; // e.g. "mock-acris"
  topology(): Promise<{ terminals: Terminal[]; zones: Zone[]; checkpoints: Checkpoint[] }>;
  stream(signal: AbortLike): AsyncIterable<QueueMeasurement>;
}

/** A pluggable GenAI provider for the creative assistant. */
export interface CreativeProvider {
  readonly id: string; // "mock-template" | "openai" | ...
  generate(input: {
    brief: string;
    orientation: "portrait" | "landscape";
    languages: string[]; // BCP-47 codes
  }): Promise<{
    copy: Record<string, { headline: string; body: string; cta: string }>;
    bgColor: string;
    fgColor: string;
    template: string;
  }>;
}

/** Factory signatures resolved from configuration at startup. */
export type FlightSourceFactory = (cfg: Record<string, string>) => FlightSource;
export type QueueSourceFactory = (cfg: Record<string, string>) => QueueSource;
export type CreativeProviderFactory = (cfg: Record<string, string>) => CreativeProvider;
