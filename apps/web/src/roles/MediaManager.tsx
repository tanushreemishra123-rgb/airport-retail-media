import React, { useEffect, useState } from "react";
import { api, type Inventory, type YieldForecast, type Approvals, type AdvertiserRow, type Heatmap, type InventoryPackage, type Campaign, type Slot, type Zone } from "../api";
import { useStore } from "../store";
import { Card, Badge, fmt, money, useLiveTick } from "../ui";

export function MediaManager() {
  return (
    <>
      <h1 className="page-title">Media manager — sales & inventory</h1>
      <p className="page-sub">Sell and schedule inventory, price on predicted footfall, approve creatives.</p>
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <InventoryCalendar />
        <YieldPanel />
      </div>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <Approvals2 />
        <Advertisers />
        <HeatmapPanel />
      </div>
      <div className="grid cols-2">
        <PackageBuilder />
        <SlotRecommender />
      </div>
    </>
  );
}

function PackageBuilder() {
  const cur = useStore((s) => s.config?.currency ?? "USD");
  const [zones, setZones] = useState<Zone[]>([]);
  const [packages, setPackages] = useState<InventoryPackage[]>([]);
  const [name, setName] = useState("International Departures Premium Pack");
  const [sel, setSel] = useState<string[]>(["T2-C", "T2-D", "T2-DF"]);
  const [price, setPrice] = useState(15000);
  const refresh = () => api.packages().then(setPackages);
  useEffect(() => { api.zones().then((z) => setZones(z.filter((x) => x.gates.length || x.id.endsWith("DF") || x.id.endsWith("RET")))); refresh(); }, []);
  const create = async () => { await api.createPackage(name, sel, price * 100); refresh(); };
  return (
    <Card title="Package builder" hint="Bundle screens/zones into a sellable pack with predicted reach.">
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <div className="row" style={{ marginBottom: 8, gap: 4 }}>
        {zones.map((z) => <button key={z.id} className={`btn sm ${sel.includes(z.id) ? "active" : ""}`} onClick={() => setSel((s) => s.includes(z.id) ? s.filter((x) => x !== z.id) : [...s, z.id])}>{z.id}</button>)}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="row" style={{ gap: 4 }}>Price $<input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ width: 90 }} /></label>
        <button className="btn sm primary" onClick={create}>Create package</button>
      </div>
      <div className="scroll" style={{ maxHeight: 180 }}>
        <table><thead><tr><th>Package</th><th>Screens</th><th>Pred. impr/day</th><th>Price</th></tr></thead>
          <tbody>{packages.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.screenCount}</td><td>{fmt(p.predictedDailyImpressions)}</td><td>{money(p.priceCents, cur)}</td></tr>)}</tbody>
        </table>
      </div>
    </Card>
  );
}

function SlotRecommender() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [cid, setCid] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  useEffect(() => { api.campaigns().then((c) => { setCampaigns(c); setCid(c[0]?.id ?? ""); }); }, []);
  useEffect(() => { if (cid) api.recommend(cid).then(setSlots); }, [cid]);
  return (
    <Card title="Smart recommendation — best 3 slots tomorrow" hint="Predicted impressions × audience match for the selected campaign.">
      <select value={cid} onChange={(e) => setCid(e.target.value)} style={{ width: "100%", marginBottom: 10 }}>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {slots.length === 0 ? <div className="muted">No qualifying slots.</div> : (
        <div className="grid cols-3">
          {slots.map((s, i) => (
            <div key={i} className="card" style={{ background: "var(--panel-2)" }}>
              <div className="v mono" style={{ fontSize: 22, fontWeight: 800 }}>{String(s.hour).padStart(2, "0")}:00</div>
              <div className="muted" style={{ fontSize: 12 }}>{s.zoneId}</div>
              <div style={{ marginTop: 6 }}><Badge tone="ok">{s.score}% match</Badge></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>~{fmt(s.predictedImpressions)} impr</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function InventoryCalendar() {
  const [inv, setInv] = useState<Inventory | null>(null);
  useEffect(() => { api.inventory().then(setInv); }, []);
  if (!inv) return <Card title="Inventory calendar"><div className="muted">Loading…</div></Card>;
  const color = (occ: number, premium: boolean) => premium ? `rgba(255,159,10,${0.3 + occ / 160})` : `rgba(79,140,255,${0.15 + occ / 170})`;
  return (
    <Card title="Inventory calendar" hint="Every zone × hour. Amber = premium (high predicted footfall); fill = booked %.">
      <div className="scroll">
        <table>
          <thead><tr><th>Zone</th>{inv.hours.map((h) => <th key={h} style={{ textAlign: "center" }}>{h}</th>)}</tr></thead>
          <tbody>
            {inv.zones.map((z) => (
              <tr key={z.zoneId}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{z.zoneId}</td>
                {z.cells.map((c) => (
                  <td key={c.hour} style={{ background: color(c.occupancyPct, c.premium), textAlign: "center", padding: 4 }}
                    title={`${c.occupancyPct}% booked · ${fmt(c.pax)} pax · ${c.screens} screens${c.premium ? " · PREMIUM" : ""}`}>
                    <span className="mono" style={{ fontSize: 10 }}>{c.occupancyPct}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function YieldPanel() {
  const cur = useStore((s) => s.config?.currency ?? "USD");
  const [y, setY] = useState<YieldForecast | null>(null);
  useEffect(() => { api.yield().then(setY); }, []);
  if (!y) return <Card title="Yield & pricing"><div className="muted">Loading…</div></Card>;
  return (
    <Card title="Yield & pricing" hint="Suggested CPM from predicted presence; occupancy and a 7-day revenue forecast.">
      <table>
        <thead><tr><th>Zone</th><th>Avg pax</th><th>Suggested CPM</th><th>Occupancy</th></tr></thead>
        <tbody>
          {y.rows.map((r) => (
            <tr key={r.zoneId}><td className="mono">{r.zoneId}</td><td>{fmt(r.avgPax)}</td><td>{money(r.suggestedCpmCents, cur)}</td><td><Badge tone={r.occupancyPct > 70 ? "ok" : "warn"}>{r.occupancyPct}%</Badge></td></tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12, alignItems: "flex-end", gap: 4, height: 70 }}>
        {y.forecast.map((f) => {
          const max = Math.max(...y.forecast.map((x) => x.revenueCents));
          return <div key={f.day} title={money(f.revenueCents, cur)} style={{ flex: 1, background: "var(--accent)", height: `${(f.revenueCents / max) * 100}%`, borderRadius: 4 }} />;
        })}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>7-day revenue forecast</div>
    </Card>
  );
}

function Approvals2() {
  const tick = useLiveTick();
  const [a, setA] = useState<Approvals | null>(null);
  const refresh = () => api.approvals().then(setA);
  useEffect(() => { refresh(); }, [tick]);
  return (
    <Card title="Approval queue" hint="Campaigns & creatives awaiting review.">
      <div className="scroll" style={{ maxHeight: 360 }}>
        {a?.campaigns.length === 0 && a?.creatives.length === 0 && <div className="muted">Queue empty.</div>}
        {a?.campaigns.map((c) => (
          <div key={c.id} className="between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div><div>{c.name}</div><div className="muted" style={{ fontSize: 12 }}>{c.advertiserName}</div></div>
            <div className="row">
              <button className="btn sm" onClick={() => api.approveCampaign(c.id, "approve").then(refresh)}>Approve</button>
              <button className="btn sm danger" onClick={() => api.approveCampaign(c.id, "reject").then(refresh)}>Reject</button>
            </div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Brand-safety checklist applied on approval.</div>
    </Card>
  );
}

function Advertisers() {
  const cur = useStore((s) => s.config?.currency ?? "USD");
  const [rows, setRows] = useState<AdvertiserRow[]>([]);
  const tick = useLiveTick();
  useEffect(() => { api.advertisers().then(setRows); }, [tick]);
  return (
    <Card title="Advertiser overview" hint="Top advertisers by spend; under-delivering flagged.">
      <div className="scroll" style={{ maxHeight: 360 }}>
        <table>
          <thead><tr><th>Advertiser</th><th>Spend</th><th>Running</th><th>Report</th></tr></thead>
          <tbody>
            {rows.slice(0, 15).map((r) => (
              <tr key={r.id}><td>{r.name}{r.underdelivering > 0 && <Badge tone="warn"> under-delivering</Badge>}</td><td>{money(r.spentCents, cur)}</td><td>{r.running}/{r.campaigns}</td><td><a className="btn sm" href={api.reportUrl(r.id)} target="_blank" rel="noreferrer">PDF</a></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HeatmapPanel() {
  const [hm, setHm] = useState<Heatmap | null>(null);
  const [seg, setSeg] = useState("holiday");
  useEffect(() => { api.heatmap().then(setHm); }, []);
  if (!hm) return <Card title="Segment heatmap"><div className="muted">Loading…</div></Card>;
  const cells = hm.cells.filter((c) => c.segment === seg);
  const color = (v: number) => `rgba(79,140,255,${0.1 + v / 130})`;
  return (
    <Card title="Segment heatmap" hint="Segment × hour × zone — price and target by crowd mix.">
      <select value={seg} onChange={(e) => setSeg(e.target.value)} style={{ marginBottom: 8 }}>
        {hm.segments.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="scroll">
        <table>
          <thead><tr><th></th>{hm.hours.filter((_, i) => i % 2 === 0).map((h) => <th key={h} style={{ textAlign: "center" }}>{h}</th>)}</tr></thead>
          <tbody>
            {hm.zones.map((z) => (
              <tr key={z.id}>
                <td className="mono">{z.id}</td>
                {hm.hours.filter((_, i) => i % 2 === 0).map((h) => {
                  const c = cells.find((x) => x.zoneId === z.id && x.hour === h);
                  return <td key={h} style={{ background: color(c?.value ?? 0), textAlign: "center", padding: 4 }} title={`${c?.value ?? 0}%`}><span className="mono" style={{ fontSize: 10 }}>{c?.value ?? 0}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
