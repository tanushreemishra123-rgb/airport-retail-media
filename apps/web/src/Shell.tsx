import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, type SimTargets } from "./api";
import { useStore, type Role } from "./store";

const ROLES: Array<{ id: Role; label: string; path: string }> = [
  { id: "admin", label: "Platform Admin", path: "/admin" },
  { id: "retailer", label: "Retailer", path: "/retailer" },
  { id: "media", label: "Media Manager", path: "/media" },
  { id: "airline", label: "Airline Rep", path: "/airline" },
  { id: "passenger", label: "Passenger Screen", path: "/passenger" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { config, clock, connected, role, setRole } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const theme = role === "admin" ? "dark" : "light";
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => {
    if (config?.brandColor) document.documentElement.style.setProperty("--accent", config.brandColor);
  }, [config]);

  const simTime = clock.now ? new Date(clock.now).toISOString().slice(0, 16).replace("T", " ") + "Z" : "—";

  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <div className="brand">
            <span className="logo">{(config?.brandName ?? "S")[0]}</span>
            <div>{config?.brandName ?? "SkyReach"}<small>{config?.airport ?? "MQI"} · Meridian International · retail media</small></div>
          </div>
          <div className="spacer" />
          <span className="clock" title="Simulation time">🕑 {simTime} · {clock.speed}×</span>
          <span className={`conn ${connected ? "on" : ""}`} title={connected ? "live" : "reconnecting"} />
        </div>
        <div className="roletabs">
          {ROLES.map((r) => (
            <button key={r.id} className={`roletab ${role === r.id ? "active" : ""}`}
              onClick={() => { setRole(r.id); nav(r.path); }}>{r.label}</button>
          ))}
          <button className={`roletab ${loc.pathname.startsWith("/demo") ? "active" : ""}`} onClick={() => nav("/demo")}>Split-screen demo</button>
        </div>
        <SimBar />
      </header>
      <main className="main">{children}</main>
    </div>
  );
}

function SimBar() {
  const { clock } = useStore();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<SimTargets | null>(null);
  const [jump, setJump] = useState("");

  const refreshTargets = () => api.targets().then(setTargets);
  useEffect(() => { if (open && !targets) refreshTargets(); }, [open]);

  return (
    <div className="simbar">
      <div className="grp">
        {clock.running
          ? <button className="btn" onClick={() => api.pause()}>⏸ Pause</button>
          : <button className="btn primary" onClick={() => api.play()}>▶ Play</button>}
      </div>
      <div className="grp">
        {[1, 10, 60].map((s) => (
          <button key={s} className={`btn sm ${clock.speed === s ? "active" : ""}`} onClick={() => api.speed(s)}>{s}×</button>
        ))}
      </div>
      <div className="grp">
        <input type="time" value={jump} onChange={(e) => setJump(e.target.value)} style={{ width: 110 }} />
        <button className="btn sm" onClick={() => { if (jump) api.jump(`2026-10-14T${jump}:00Z`); }}>Jump</button>
      </div>
      <div className="spacer" />
      <button className={`btn ${open ? "active" : ""}`} onClick={() => setOpen((o) => !o)}>⚡ Inject event</button>
      {open && targets && <InjectPanel targets={targets} onDone={refreshTargets} />}
    </div>
  );
}

function InjectPanel({ targets, onDone }: { targets: SimTargets; onDone: () => void }) {
  const [flightId, setFlightId] = useState(targets.flights[0]?.id ?? "");
  const [screenId, setScreenId] = useState(targets.screens[0]?.id ?? "");
  const run = async (body: Record<string, unknown>) => { await api.inject(body); onDone(); };
  const flight = targets.flights.find((f) => f.id === flightId);
  return (
    <div className="card" style={{ position: "absolute", right: 18, top: 150, zIndex: 30, width: 420 }}>
      <h3>Inject live event</h3>
      <div className="hint">Takes effect on the next tick — watch dashboards and the passenger screen react within ~2s.</div>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={flightId} onChange={(e) => setFlightId(e.target.value)} style={{ flex: 1 }}>
          {targets.flights.map((f) => <option key={f.id} value={f.id}>{f.flightNumber} → {f.destination} · gate {f.gate} · {f.status}</option>)}
        </select>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn sm" onClick={() => run({ type: "delay", flightId, minutes: 60 })}>Delay +60 min</button>
        <button className="btn sm" onClick={() => flight?.zoneId && run({ type: "gate_change", flightId, gate: flight.gate ?? "C9", zoneId: flight.zoneId })}>Gate change</button>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={screenId} onChange={(e) => setScreenId(e.target.value)} style={{ flex: 1 }}>
          {targets.screens.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.status}</option>)}
        </select>
        <button className="btn sm danger" onClick={() => run({ type: "screen_offline", screenId, offline: true })}>Offline</button>
        <button className="btn sm" onClick={() => run({ type: "screen_offline", screenId, offline: false })}>Restore</button>
      </div>
      <div className="row">
        <span className="muted" style={{ fontSize: 12 }}>Feeds:</span>
        {targets.feeds.map((f) => (
          <span key={f} className="row" style={{ gap: 2 }}>
            <button className="btn sm danger" onClick={() => run({ type: "feed_lag", source: f, lag: true })}>{f} lag</button>
            <button className="btn sm" onClick={() => run({ type: "feed_lag", source: f, lag: false })}>✓</button>
          </span>
        ))}
      </div>
    </div>
  );
}
