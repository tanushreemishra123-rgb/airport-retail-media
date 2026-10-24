import { create } from "zustand";
import { api, type AppConfig, type ClockState, type Kpis } from "./api";

export type Role = "admin" | "retailer" | "media" | "airline" | "passenger";

interface LiveEvent { type: string; [k: string]: unknown; }

interface State {
  config: AppConfig | null;
  clock: ClockState;
  kpis: Kpis | null;
  presence: Record<string, number>;
  role: Role;
  lastEvent: LiveEvent | null;
  lastRedeem: { code: string; campaignId: string; at: string } | null;
  connected: boolean;
  tick: number; // increments on every delta so views can refetch
  setRole: (r: Role) => void;
  init: () => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  config: null,
  clock: { now: "", speed: 10, running: false },
  kpis: null,
  presence: {},
  role: "admin",
  lastEvent: null,
  lastRedeem: null,
  connected: false,
  tick: 0,
  setRole: (r) => set({ role: r }),
  init: async () => {
    const config = await api.config();
    set({ config });
    connectWs(set, get);
  },
}));

function connectWs(set: (p: Partial<State>) => void, get: () => State) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => set({ connected: true });
  ws.onclose = () => {
    set({ connected: false });
    setTimeout(() => connectWs(set, get), 1500);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as LiveEvent;
    if (msg.type === "clock") {
      set({ clock: { now: msg.now as string, speed: msg.speed as number, running: msg.running as boolean } });
    } else if (msg.type === "delta") {
      const presence: Record<string, number> = {};
      for (const p of (msg.presence as Array<{ zoneId: string; paxNow: number }>) ?? []) presence[p.zoneId] = p.paxNow;
      set({ kpis: msg.kpis as Kpis, presence, clock: { ...get().clock, now: msg.now as string }, tick: get().tick + 1 });
    } else if (msg.type === "event") {
      set({ lastEvent: msg.event as LiveEvent, tick: get().tick + 1 });
    } else if (msg.type === "redeem") {
      set({ lastRedeem: { code: msg.code as string, campaignId: msg.campaignId as string, at: msg.at as string }, tick: get().tick + 1 });
    }
  };
}
