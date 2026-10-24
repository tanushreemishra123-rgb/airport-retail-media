/**
 * Simulation clock. Advances simulation time faster than wall-clock by `speed`
 * (1x / 10x / 60x), supports pause and jump, and emits a `tick` with the new
 * simulation time. All dashboards share this one clock.
 */
import { EventEmitter } from "node:events";

const REAL_TICK_MS = 250;

export class SimClock extends EventEmitter {
  private simMs: number;
  private speed: number;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(startIso: string, speed = 10) {
    super();
    this.simMs = Date.parse(startIso);
    this.speed = speed;
  }

  now(): Date {
    return new Date(this.simMs);
  }
  nowIso(): string {
    return new Date(this.simMs).toISOString().replace(".000Z", "Z");
  }
  getSpeed(): number {
    return this.speed;
  }
  isRunning(): boolean {
    return this.running;
  }

  play(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.simMs += REAL_TICK_MS * this.speed;
      this.emit("tick", this.nowIso());
    }, REAL_TICK_MS);
    this.emit("state", this.state());
  }

  pause(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emit("state", this.state());
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.emit("state", this.state());
  }

  jumpTo(iso: string): void {
    this.simMs = Date.parse(iso);
    this.emit("tick", this.nowIso());
    this.emit("state", this.state());
  }

  state() {
    return { now: this.nowIso(), speed: this.speed, running: this.running };
  }

  stop(): void {
    this.pause();
    this.removeAllListeners();
  }
}
