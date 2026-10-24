import React, { useEffect, useState } from "react";
import { api, type ScreenLite, type SimTargets } from "../api";
import { useStore } from "../store";
import { PassengerScreen } from "./Passenger";
import { Card, Kpi, Badge, fmt, money, useLiveTick } from "../ui";

export function Demo() {
  const [screens, setScreens] = useState<ScreenLite[]>([]);
  const [screenId, setScreenId] = useState("");
  useEffect(() => { api.screens("T2-C").then((s) => { setScreens(s); setScreenId(s[0]?.id ?? ""); }); }, []);
  return (
    <>
      <h1 className="page-title">Split-screen demo</h1>
      <p className="page-sub">Cause and effect across roles: inject a flight event on the right, watch the passenger screen on the left react within ~2 seconds.</p>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={screenId} onChange={(e) => setScreenId(e.target.value)}>{screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <div className="split">
        <Card title="Passenger screen (Gate C)">{screenId && <PassengerScreen screenId={screenId} />}</Card>
        <LivePanel />
      </div>
    </>
  );
}

function LivePanel() {
  const kpis = useStore((s) => s.kpis);
  const lastEvent = useStore((s) => s.lastEvent);
  const lastRedeem = useStore((s) => s.lastRedeem);
  const cur = useStore((s) => s.config?.currency ?? "USD");
  const tick = useLiveTick();
  const [targets, setTargets] = useState<SimTargets | null>(null);
  useEffect(() => { api.targets().then(setTargets); }, [tick === 0 ? 0 : Math.floor(tick / 10)]);
  const delayFlight = targets?.flights.find((f) => f.international && (f.status === "boarding" || f.status === "estimated" || f.status === "scheduled"));
  return (
    <Card title="Operator — live">
      <div className="grid cols-2" style={{ marginBottom: 12 }}>
        <Kpi label="Revenue today" value={kpis ? money(kpis.revenueTodayCents, cur) : "—"} tone="ok" />
        <Kpi label="Redemptions" value={kpis ? fmt(kpis.redemptionsToday) : "—"} tone="ok" />
        <Kpi label="Ad plays" value={kpis ? fmt(kpis.adPlaysToday) : "—"} />
        <Kpi label="Open incidents" value={kpis ? fmt(kpis.openIncidents) : "—"} tone={kpis && kpis.openIncidents ? "warn" : "ok"} />
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn primary" disabled={!delayFlight} onClick={() => delayFlight && api.inject({ type: "delay", flightId: delayFlight.id, minutes: 60 })}>
          ⚡ Delay {delayFlight?.flightNumber ?? "intl flight"} +60m
        </button>
        {targets?.screens[0] && <button className="btn danger" onClick={() => { const s0 = targets.screens[0]; if (s0) api.inject({ type: "screen_offline", screenId: s0.id, offline: true }); }}>Screen offline</button>}
        <button className="btn" onClick={() => api.inject({ type: "feed_lag", source: "aidx", lag: true })}>AIDX lag</button>
      </div>
      <div className={`card ${lastRedeem ? "pulse" : ""}`} style={{ background: "var(--panel-2)" }}>
        <div className="muted" style={{ fontSize: 12 }}>Last live event</div>
        <div>{lastEvent ? <Badge tone="warn">{String(lastEvent.type)}</Badge> : <span className="muted">—</span>} {lastEvent?.flightId ? <span className="mono">{String(lastEvent.flightId)}</span> : ""}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Last redemption</div>
        <div>{lastRedeem ? <><Badge tone="ok">claimed</Badge> <span className="mono">{lastRedeem.code}</span> → {lastRedeem.campaignId}</> : <span className="muted">—</span>}</div>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Delay a Gulf-bound flight and watch the duty-free/goodwill ad take over the gate screen, the zone's passenger count rise, and (after a scan) revenue tick up.</p>
    </Card>
  );
}
