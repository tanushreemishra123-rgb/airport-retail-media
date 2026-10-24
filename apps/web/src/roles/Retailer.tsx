import React, { useEffect, useMemo, useState } from "react";
import { api, type Outlet, type RetailerDashboard, type Preview, type Zone, type Campaign } from "../api";
import { useStore } from "../store";
import { Card, Kpi, Badge, fmt, money, Sparkline, useLiveTick } from "../ui";

export function Retailer() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  useEffect(() => { api.retailerOutlets().then((o) => { setOutlets(o); setOutletId(o[0]?.id ?? ""); }); }, []);
  return (
    <>
      <div className="between">
        <div>
          <h1 className="page-title">Retailer dashboard</h1>
          <p className="page-sub">Live performance and passenger flow for your outlet.</p>
        </div>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.zoneId}</option>)}
        </select>
      </div>
      {outletId && <RetailerBody outletId={outletId} />}
    </>
  );
}

function RetailerBody({ outletId }: { outletId: string }) {
  const tick = useLiveTick();
  const cur = useStore((s) => s.config?.currency ?? "USD");
  const [d, setD] = useState<RetailerDashboard | null>(null);
  useEffect(() => { api.retailerDashboard(outletId).then(setD); }, [outletId, tick]);
  if (!d) return <div className="muted">Loading…</div>;
  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Kpi label="Impressions" value={fmt(d.kpis.impressions)} />
        <Kpi label="Scans / redemptions" value={fmt(d.kpis.redemptions)} tone="ok" />
        <Kpi label="Conversion rate" value={`${d.kpis.conversionRate}%`} />
        <Kpi label="Revenue attributed" value={money(d.kpis.revenueCents, cur)} tone="ok" />
      </div>
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <Flow d={d} />
        <CampaignBuilder outletAdvertiser={d.outlet.advertiserId} />
      </div>
      <div className="grid cols-2">
        <Creatives advertiserId={d.outlet.advertiserId} />
        <History campaigns={d.campaigns} cur={cur} />
      </div>
    </>
  );
}

function Flow({ d }: { d: RetailerDashboard }) {
  const f = d.flow;
  return (
    <Card title="Passenger flow near my store" hint="Derived from upcoming departures in the outlet's zone.">
      <div className="row" style={{ gap: 18, marginBottom: 10 }}>
        <div><div className="kpi" style={{ padding: 0, border: 0 }}><div className="v">{fmt(f.next60Pax)}</div><div className="l">pax next 60 min</div></div></div>
        <div><div className="v mono" style={{ fontSize: 22 }}>{f.internationalPct}%</div><div className="l muted">international</div></div>
        <div style={{ flex: 1 }}>
          <div className="muted" style={{ fontSize: 12 }}>Next 2 hours</div>
          <Sparkline points={f.buckets.map((b) => b.pax)} />
        </div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="muted" style={{ fontSize: 12 }}>Top destinations:</span>
        {f.topDestinations.map((c) => <span key={c} className="flag">{c}</span>)}
        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>nationalities:</span>
        {f.topNationalities.map((c) => <span key={c} className="flag">{c}</span>)}
      </div>
      <div className="scroll" style={{ maxHeight: 160 }}>
        <table>
          <thead><tr><th>Flight</th><th>Dest</th><th>Gate</th><th>Dep</th><th>Pax</th></tr></thead>
          <tbody>
            {f.upcoming.map((u) => <tr key={u.flightNumber}><td className="mono">{u.flightNumber}</td><td>{u.destination}</td><td>{u.gate}</td><td className="mono">{u.time.slice(11, 16)}</td><td>{u.pax}</td></tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const SEGMENTS = ["business", "holiday", "family", "couple"] as const;

function CampaignBuilder({ outletAdvertiser }: { outletAdvertiser: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState("New airport offer");
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({ holiday: 0.8, family: 0.5 });
  const [intlOnly, setIntlOnly] = useState(false);
  const [minDwell, setMinDwell] = useState(0);
  const [budget, setBudget] = useState(5000);
  const [delayTrigger, setDelayTrigger] = useState(false);
  const [delayMin, setDelayMin] = useState(30);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  useEffect(() => { api.zones().then((z) => setZones(z.filter((x) => x.gates.length || x.id.endsWith("DF") || x.id.endsWith("RET")))); }, []);

  const body = useMemo(() => {
    const sw: Record<string, Record<string, number>> = { tripPurpose: {}, partyType: {} };
    for (const [k, v] of Object.entries(weights)) {
      if (k === "business" || k === "holiday") sw.tripPurpose![k] = v;
      if (k === "family" || k === "couple") sw.partyType![k] = v;
    }
    return { segmentWeights: sw, hardFilters: { internationalOnly: intlOnly, minDwellMinutes: minDwell || undefined }, zoneIds: selectedZones };
  }, [weights, intlOnly, minDwell, selectedZones]);

  useEffect(() => { const t = setTimeout(() => api.previewCampaign(body).then(setPreview), 250); return () => clearTimeout(t); }, [body]);

  const create = async () => {
    const res = await api.createCampaign({
      advertiserId: outletAdvertiser, name, status: "pending_approval",
      segmentWeights: body.segmentWeights, hardFilters: body.hardFilters,
      placement: { zoneIds: selectedZones, screenIds: [], gates: [], scheduleStart: "2026-10-14T00:00:00Z", scheduleEnd: "2026-10-14T23:59:59Z", hoursOfDay: [] },
      budget: { totalCents: budget * 100, dailyCapCents: budget * 100, spentCents: 0, frequencyCapPerHour: 12 },
      triggers: delayTrigger ? [{ kind: "delay_over", threshold: delayMin, boost: 1.5 }] : [],
    });
    setCreated(res.campaign.id);
  };

  return (
    <Card title="Campaign builder" hint="Target the crowd, preview the live audience match, then submit for approval.">
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <div className="muted" style={{ fontSize: 12, margin: "4px 0" }}>Segment weights</div>
      {SEGMENTS.map((s) => (
        <div className="bar" key={s} style={{ gridTemplateColumns: "80px 1fr 36px" }}>
          <span>{s}</span>
          <input type="range" min={0} max={1} step={0.1} value={weights[s] ?? 0} onChange={(e) => setWeights((w) => ({ ...w, [s]: Number(e.target.value) }))} />
          <span className="val">{Math.round((weights[s] ?? 0) * 100)}%</span>
        </div>
      ))}
      <div className="row" style={{ margin: "10px 0" }}>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={intlOnly} onChange={(e) => setIntlOnly(e.target.checked)} /> International only</label>
        <label className="row" style={{ gap: 4 }}>Min dwell <input type="number" value={minDwell} onChange={(e) => setMinDwell(Number(e.target.value))} style={{ width: 64 }} /> min</label>
        <label className="row" style={{ gap: 4 }}>Budget $<input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={{ width: 80 }} /></label>
      </div>
      <div className="row" style={{ marginBottom: 6 }}>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={delayTrigger} onChange={(e) => setDelayTrigger(e.target.checked)} /> Trigger rule: if flight delayed &gt;</label>
        <input type="number" value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} style={{ width: 56 }} disabled={!delayTrigger} /> <span className="muted">min, boost ×1.5</span>
      </div>
      <div className="row" style={{ marginBottom: 10, gap: 4 }}>
        {zones.map((z) => (
          <button key={z.id} className={`btn sm ${selectedZones.includes(z.id) ? "active" : ""}`}
            onClick={() => setSelectedZones((s) => s.includes(z.id) ? s.filter((x) => x !== z.id) : [...s, z.id])}>{z.id}</button>
        ))}
      </div>
      {preview && (
        <div className="card" style={{ background: "var(--panel-2)", marginBottom: 10 }}>
          <div className="row between">
            <div><div className="v mono" style={{ fontSize: 24, fontWeight: 800 }}>{preview.matchPct}%</div><div className="l muted">crowd match now · {preview.zones.length || "all"} zones</div></div>
            <div style={{ textAlign: "right" }}>
              <div>~{fmt(preview.expectedImpressions)} impressions</div>
              <div className="muted">~{fmt(preview.expectedRedemptions)} redemptions · {fmt(preview.paxNow)} pax</div>
            </div>
          </div>
        </div>
      )}
      <button className="btn primary" onClick={create}>Submit campaign for approval</button>
      {created && <span className="badge ok" style={{ marginLeft: 8 }}>Created {created} — pending approval</span>}
    </Card>
  );
}

function Creatives({ advertiserId }: { advertiserId: string }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.creatives>>>([]);
  const [brief, setBrief] = useState("Festive sweets, 20% off, families flying domestic");
  const refresh = () => api.creatives().then((c) => setList(c.filter((x) => x.advertiserId === advertiserId || x.aiGenerated).slice(0, 8)));
  useEffect(() => { refresh(); }, [advertiserId]);
  const gen = async () => { await api.generateCreative({ brief, orientation: "landscape", advertiserId }); refresh(); };
  return (
    <Card title="Creative library + GenAI assistant" hint="Reuse ad pages or generate one from a brief in English + Arabic.">
      <div className="row" style={{ marginBottom: 10 }}>
        <input value={brief} onChange={(e) => setBrief(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary" onClick={gen}>✨ Generate</button>
      </div>
      <div className="grid cols-2">
        {list.map((c) => (
          <div key={c.id} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--line)" }}>
            <div style={{ background: c.bgColor, color: c.fgColor, padding: 12, minHeight: 84 }}>
              <div style={{ fontWeight: 800 }}>{c.copy.en?.headline}</div>
              <div style={{ fontSize: 12, opacity: .85 }}>{c.copy.en?.body}</div>
              {c.copy.ar && <div style={{ fontSize: 12, opacity: .85, direction: "rtl", marginTop: 4 }}>{c.copy.ar.headline}</div>}
            </div>
            <div className="row between" style={{ padding: "6px 8px" }}>
              <span className="muted" style={{ fontSize: 11 }}>{c.aiGenerated ? "AI" : c.orientation}</span>
              <Badge tone={c.approvalStatus === "approved" ? "ok" : "warn"}>{c.approvalStatus}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function History({ campaigns, cur }: { campaigns: Campaign[]; cur: string }) {
  const [stock, setStock] = useState<Record<string, boolean>>({});
  const [ab, setAb] = useState<Record<string, { a: number; b: number }>>({});
  const toggleStock = async (c: Campaign) => {
    const next = !(stock[c.id] ?? c.stockAvailable !== false);
    await api.setStock(c.id, next);
    setStock((s) => ({ ...s, [c.id]: next }));
  };
  const setupAb = async (c: Campaign) => {
    const variant = c.creativeIds[1] ?? c.creativeIds[0];
    if (!variant) return;
    await api.setAb(c.id, variant, 0.5);
    const r = await api.getAb(c.id);
    setAb((m) => ({ ...m, [c.id]: { a: r.variantA.impressions, b: r.variantB?.impressions ?? 0 } }));
  };
  return (
    <Card title="Campaign history, ROI, pacing & A/B" hint="Re-run, stock-pause, or A/B a campaign. Bars show budget pacing (spent / daily cap).">
      <div className="scroll" style={{ maxHeight: 340 }}>
        <table>
          <thead><tr><th>Campaign</th><th>ROI</th><th>Pacing</th><th>Controls</th></tr></thead>
          <tbody>
            {campaigns.map((c) => {
              const hist = c.history ?? [];
              const spend = hist.reduce((s, h) => s + h.spendCents, 0) + c.budget.spentCents;
              const rev = hist.reduce((s, h) => s + h.revenueCents, 0);
              const roi = spend ? Math.round((rev / spend) * 100) : 0;
              const pace = c.budget.dailyCapCents ? Math.min(100, Math.round((c.budget.spentCents / c.budget.dailyCapCents) * 100)) : 0;
              const inStock = stock[c.id] ?? c.stockAvailable !== false;
              const abs = ab[c.id];
              return (
                <tr key={c.id}>
                  <td>{c.name}{abs && <div className="muted" style={{ fontSize: 11 }}>A/B: A {fmt(abs.a)} · B {fmt(abs.b)}</div>}</td>
                  <td><Badge tone={roi >= 100 ? "ok" : "warn"}>{roi}%</Badge></td>
                  <td style={{ minWidth: 90 }}><div className="track" style={{ height: 8 }}><div className="fill" style={{ width: `${pace}%`, background: pace > 85 ? "var(--warn)" : "var(--accent)" }} /></div><span className="muted mono" style={{ fontSize: 10 }}>{pace}%</span></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn sm" onClick={() => api.duplicateCampaign(c.id)}>Run again</button>
                      <button className={`btn sm ${inStock ? "" : "danger"}`} onClick={() => toggleStock(c)}>{inStock ? "In stock" : "Out — paused"}</button>
                      <button className="btn sm" onClick={() => setupAb(c)}>A/B</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
