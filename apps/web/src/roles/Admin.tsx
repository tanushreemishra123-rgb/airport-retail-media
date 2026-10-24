import React, { useEffect, useState } from "react";
import { api, type Network, type Incident, type Feed, type Decision, type Master } from "../api";
import { useStore } from "../store";
import { Card, Kpi, Badge, fmt, money, useLiveTick } from "../ui";

export function Admin() {
  const kpis = useStore((s) => s.kpis);
  const cfg = useStore((s) => s.config);
  const cur = cfg?.currency ?? "USD";
  return (
    <>
      <h1 className="page-title">Operator console</h1>
      <p className="page-sub">Network health, revenue, incidents and master data for {cfg?.airport} — live on the simulation clock.</p>
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Kpi label="Screens online" value={kpis ? `${kpis.screensOnlinePct}%` : "—"} tone={kpis && kpis.screensOnlinePct < 90 ? "warn" : "ok"} />
        <Kpi label="Ad plays today" value={kpis ? fmt(kpis.adPlaysToday) : "—"} />
        <Kpi label="Impressions today" value={kpis ? fmt(kpis.impressionsToday) : "—"} />
        <Kpi label="Revenue today" value={kpis ? money(kpis.revenueTodayCents, cur) : "—"} tone="ok" />
        <Kpi label="Active campaigns" value={kpis ? fmt(kpis.activeCampaigns) : "—"} />
        <Kpi label="Avg screen latency" value={kpis ? `${kpis.avgScreenLatencyMs} ms` : "—"} />
        <Kpi label="Redemptions today" value={kpis ? fmt(kpis.redemptionsToday) : "—"} />
        <Kpi label="Open incidents" value={kpis ? fmt(kpis.openIncidents) : "—"} tone={kpis && kpis.openIncidents > 0 ? "warn" : "ok"} />
      </div>
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <NetworkMap />
        <div className="grid" style={{ gridTemplateRows: "auto auto", gap: 14 }}>
          <Incidents />
          <Feeds />
        </div>
      </div>
      <div className="grid cols-2">
        <DecisionLog />
        <MasterData />
      </div>
    </>
  );
}

function NetworkMap() {
  const tick = useLiveTick();
  const [net, setNet] = useState<Network | null>(null);
  useEffect(() => { api.network().then(setNet); }, [tick]);
  if (!net) return <Card title="Live network map"><div className="muted">Loading…</div></Card>;
  const maxPax = Math.max(1, ...net.zones.map((z) => z.paxNow ?? 0));
  const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  return (
    <Card title="Live network map" hint="Terminal floor plan. Dots are screens (green online · amber degraded · red offline); blue halos are passenger presence.">
      <div className="map">
        {net.zones.map((z) => (
          <React.Fragment key={z.id}>
            {(z.paxNow ?? 0) > 0 && <div className="heatblob" style={{ left: `${z.x}%`, top: `${z.y}%`, width: 40 + (z.paxNow! / maxPax) * 160, height: 40 + (z.paxNow! / maxPax) * 160 }} />}
            <div className="zone-label" style={{ left: `${z.x}%`, top: `${z.y}%` }}>{z.id} · {fmt(z.paxNow ?? 0)} pax</div>
          </React.Fragment>
        ))}
        {net.screens.map((s) => {
          const z = net.zones.find((x) => x.id === s.zoneId);
          if (!z) return null;
          const h = hash(s.id);
          const ox = ((h % 23) - 11) * 0.9;
          const oy = (((h >> 5) % 23) - 11) * 0.7;
          return <div key={s.id} className={`dot ${s.status}`} style={{ left: `${z.x + ox}%`, top: `${z.y + oy}%` }} title={`${s.name} · ${s.status}`} />;
        })}
      </div>
      <div className="row" style={{ marginTop: 10, fontSize: 12 }}>
        <span><span className="dot online" style={{ position: "static", display: "inline-block", marginRight: 4 }} /> online</span>
        <span><span className="dot degraded" style={{ position: "static", display: "inline-block", marginRight: 4 }} /> degraded</span>
        <span><span className="dot offline" style={{ position: "static", display: "inline-block", marginRight: 4 }} /> offline</span>
      </div>
    </Card>
  );
}

function Incidents() {
  const tick = useLiveTick();
  const [items, setItems] = useState<Incident[]>([]);
  useEffect(() => { api.incidents().then(setItems); }, [tick]);
  const open = items.filter((i) => i.status !== "resolved");
  return (
    <Card title={`Incident & bug tracker (${open.length} open)`} hint="Auto-raised: screen offline, feed lag, failed creative.">
      <div className="scroll" style={{ maxHeight: 220 }}>
        <table>
          <thead><tr><th>Severity</th><th>Issue</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {open.length === 0 && <tr><td colSpan={4} className="muted">No open incidents.</td></tr>}
            {open.slice(0, 20).map((i) => (
              <tr key={i.id}>
                <td><Badge tone={i.severity === "critical" || i.severity === "high" ? "bad" : "warn"}>{i.severity}</Badge></td>
                <td>{i.message}</td>
                <td><Badge>{i.status}</Badge></td>
                <td><button className="btn sm" onClick={() => api.resolveIncident(i.id, "resolved").then(() => api.incidents().then(setItems))}>Resolve</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Feeds() {
  const tick = useLiveTick();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  useEffect(() => { api.feeds().then(setFeeds); }, [tick]);
  const now = useStore((s) => s.clock.now);
  return (
    <Card title="Data feed health" hint="AODB · AIDX · ACRIS adapters. Messages/min and last message age.">
      <table>
        <thead><tr><th>Feed</th><th>Adapter</th><th>Msgs/min</th><th>Status</th></tr></thead>
        <tbody>
          {feeds.map((f) => {
            const ageS = now ? Math.round((Date.parse(now) - f.lastMessageMs) / 1000) : 0;
            return (
              <tr key={f.source}>
                <td className="mono">{f.source.toUpperCase()}</td>
                <td className="muted">{f.source === "aodb" ? "mock-aodb" : f.source === "aidx" ? "mock-aidx" : "mock-acris"}</td>
                <td className="mono">{f.messagesPerMin}</td>
                <td>{f.lagInjected ? <Badge tone="bad">lagging {fmt(ageS)}s</Badge> : <Badge tone="ok">healthy</Badge>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function DecisionLog() {
  const tick = useLiveTick();
  const [rows, setRows] = useState<Decision[]>([]);
  const [engineFilter, setEngineFilter] = useState("");
  useEffect(() => { api.decisions({ limit: "60", ...(engineFilter ? { engine: engineFilter } : {}) }).then(setRows); }, [tick, engineFilter]);
  return (
    <Card title="Decision log (audit)" hint="Every ad decision with its engine, winner and evidence-gated verification.">
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)}>
          <option value="">All engines</option><option value="ai">AI (verified)</option><option value="rules">Rule fallback</option>
        </select>
      </div>
      <div className="scroll" style={{ maxHeight: 360 }}>
        <table>
          <thead><tr><th>Screen</th><th>Winner</th><th>Engine</th><th>Verified</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} title={d.winningReason}>
                <td className="mono">{d.screenId}</td>
                <td>{d.winnerCampaignId ?? <span className="muted">house</span>}</td>
                <td><Badge tone={d.engine === "ai" ? "ai" : "rules"}>{d.engine}</Badge></td>
                <td>{d.verification.passed ? <Badge tone="ok">pass</Badge> : <Badge tone="warn">fallback</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MasterData() {
  const [m, setM] = useState<Master | null>(null);
  const [tab, setTab] = useState<"advertisers" | "outlets" | "airlines" | "screens" | "zones">("advertisers");
  useEffect(() => { api.master().then(setM); }, []);
  if (!m) return <Card title="Master data"><div className="muted">Loading…</div></Card>;
  const tabs = ["advertisers", "outlets", "airlines", "screens", "zones"] as const;
  return (
    <Card title="Master data management" hint="Vendors, outlets, airlines, locations and screens.">
      <div className="row" style={{ marginBottom: 8 }}>
        {tabs.map((t) => <button key={t} className={`btn sm ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t} ({(m[t] as unknown[]).length})</button>)}
      </div>
      <div className="scroll" style={{ maxHeight: 320 }}>
        <table>
          <tbody>
            {tab === "advertisers" && m.advertisers.map((a) => <tr key={a.id}><td>{a.name}</td><td><Badge>{a.type}</Badge></td><td className="muted">{a.category}</td></tr>)}
            {tab === "outlets" && m.outlets.map((o) => <tr key={o.id}><td>{o.name}</td><td className="muted">{o.zoneId}</td><td className="muted">{o.category}</td></tr>)}
            {tab === "airlines" && m.airlines.map((a) => <tr key={a.iata}><td className="mono">{a.iata}/{a.icao}</td><td>{a.name}</td><td className="muted">{a.market}</td></tr>)}
            {tab === "screens" && m.screens.slice(0, 80).map((s) => <tr key={s.id}><td className="mono">{s.id}</td><td>{s.name}</td><td><Badge tone={s.status === "online" ? "ok" : s.status === "offline" ? "bad" : "warn"}>{s.status}</Badge></td></tr>)}
            {tab === "zones" && m.zones.map((z) => <tr key={z.id}><td className="mono">{z.id}</td><td>{z.name}</td><td className="muted">{z.gates.length} gates</td></tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
