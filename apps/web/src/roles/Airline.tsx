import React, { useEffect, useState } from "react";
import { api, type Airline as AirlineT, type AirlineFlight, type CrowdProfile, type Offer, type Advertiser } from "../api";
import { Card, Badge, SharesBars, Kpi, fmt, useLiveTick } from "../ui";

export function Airline() {
  const [airlines, setAirlines] = useState<AirlineT[]>([]);
  const [code, setCode] = useState("");
  useEffect(() => { api.airlines().then((a) => { setAirlines(a); setCode(a.find((x) => x.market !== "domestic")?.iata ?? a[0]?.iata ?? ""); }); }, []);
  const airline = airlines.find((a) => a.iata === code);
  return (
    <>
      <div className="between">
        <div>
          <h1 className="page-title">Airline representative</h1>
          <p className="page-sub">Your flights, your passengers, and gate-area messaging.</p>
        </div>
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          {airlines.map((a) => <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>)}
        </select>
      </div>
      {code && <Body code={code} airline={airline} />}
    </>
  );
}

function Body({ code, airline }: { code: string; airline?: AirlineT }) {
  const tick = useLiveTick();
  const [flights, setFlights] = useState<AirlineFlight[]>([]);
  const [profile, setProfile] = useState<CrowdProfile | null>(null);
  useEffect(() => { api.airlineFlights(code).then(setFlights); api.airlineProfile(code).then(setProfile); }, [code, tick]);
  const departures = flights.filter((f) => f.direction === "departure");
  const delayed = departures.filter((f) => f.delayMinutes >= 45);
  return (
    <>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <Card title="My flights today" className="" >
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{departures.length} departures · {delayed.length} delayed ≥45 min</div>
          <div className="scroll" style={{ maxHeight: 420 }}>
            <table>
              <thead><tr><th>Flight</th><th>Dest</th><th>Gate</th><th>Dep</th><th>Status</th></tr></thead>
              <tbody>
                {departures.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.flightNumber}</td><td>{f.destination}</td><td>{f.gate}</td>
                    <td className="mono">{(f.estimatedTime ?? f.scheduledTime).slice(11, 16)}</td>
                    <td><Badge tone={f.status === "delayed" ? "bad" : f.status === "boarding" ? "ok" : undefined}>{f.status}{f.delayMinutes ? ` +${f.delayMinutes}` : ""}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Aggregated crowd profile" hint="Across your departing passengers (shares only).">
          {profile ? <>
            <div className="muted" style={{ fontSize: 12 }}>Trip purpose</div>
            <SharesBars data={profile.tripPurpose} />
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Cabin</div>
            <SharesBars data={profile.cabin} />
            <div className="row" style={{ marginTop: 10 }}>
              <span className="flag">intl {Math.round(profile.internationalShare * 100)}%</span>
              <span className="flag">FF {Math.round(profile.frequentFlyerShare * 100)}%</span>
            </div>
          </> : <div className="muted">No departures right now.</div>}
        </Card>
        <Card title="Gate-area messaging & goodwill" hint="Schedule sponsored content for your boarding windows.">
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <p>Partner offers ranked for your passengers: upgrades, lounge passes and destination partners play on your gate screens during boarding (airline priority ×1.5 in the decision engine).</p>
            <div className="card" style={{ background: "var(--panel-2)" }}>
              <strong>⚡ Delay goodwill automation</strong>
              <div className="muted" style={{ fontSize: 12, margin: "4px 0" }}>When a flight is delayed past 45 min, a meal/lounge voucher co-funded with an F&B retailer auto-pushes to the gate screens.</div>
              {delayed.length > 0
                ? delayed.map((f) => <div key={f.id} className="row between" style={{ padding: "4px 0" }}><span>{f.flightNumber} → {f.destination} <Badge tone="bad">+{f.delayMinutes}m</Badge></span><Badge tone="ok">voucher pushed</Badge></div>)
                : <div className="muted" style={{ fontSize: 12 }}>No qualifying delays now. Inject a delay from the sim bar to trigger one.</div>}
            </div>
          </div>
        </Card>
      </div>
      <div className="grid cols-3">
        <GateSchedule code={code} />
        <CoMarketing code={code} />
        <OwnPerformance code={code} />
      </div>
    </>
  );
}

function GateSchedule({ code }: { code: string }) {
  const [headline, setHeadline] = useState("Upgrade to Business from $89");
  const [body, setBody] = useState("Lie-flat comfort and priority boarding.");
  const [zoneIds] = useState<string[]>(["T2-C", "T2-D"]);
  const [done, setDone] = useState<string | null>(null);
  const schedule = async () => { const r = await api.scheduleGate(code, zoneIds, headline, body); setDone(r.campaignId); };
  return (
    <Card title="Gate-area messaging" hint="Schedule sponsored content on your gate screens for the boarding window.">
      <input value={headline} onChange={(e) => setHeadline(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
      <input value={body} onChange={(e) => setBody(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Zones: {zoneIds.join(", ")} · airline priority ×1.5 during boarding</div>
      <button className="btn primary" onClick={schedule}>Schedule to my gates</button>
      {done && <Badge tone="ok" >Scheduled {done}</Badge>}
    </Card>
  );
}

function CoMarketing({ code }: { code: string }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [retailers, setRetailers] = useState<Advertiser[]>([]);
  const [sel, setSel] = useState("");
  const [desc, setDesc] = useState("10% off for your passengers");
  const refresh = () => api.offers(code).then(setOffers);
  useEffect(() => {
    api.master().then((m) => { const rs = m.advertisers.filter((a) => a.type !== "airline"); setRetailers(rs); setSel(rs[0]?.id ?? ""); });
    refresh();
  }, [code]);
  const propose = async () => { await api.createOffer(sel, code, desc); refresh(); };
  return (
    <Card title="Co-marketing marketplace" hint="Retailers offer deals to your passengers; accept with one click.">
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ flex: 1 }}>{retailers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 1 }} />
        <button className="btn sm" onClick={propose}>Propose</button>
      </div>
      <div className="scroll" style={{ maxHeight: 220 }}>
        {offers.length === 0 && <div className="muted">No offers yet.</div>}
        {offers.map((o) => (
          <div key={o.id} className="row between" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <div><div>{o.retailerName}</div><div className="muted" style={{ fontSize: 12 }}>{o.description}</div></div>
            {o.accepted ? <Badge tone="ok">accepted</Badge> : <button className="btn sm primary" onClick={() => api.acceptOffer(o.id).then(refresh)}>Accept</button>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function OwnPerformance({ code }: { code: string }) {
  const tick = useLiveTick();
  const [p, setP] = useState<{ impressions: number; redemptions: number; campaigns: number } | null>(null);
  useEffect(() => { api.airlinePerformance(code).then(setP); }, [code, tick]);
  return (
    <Card title="Performance (my passengers)" hint="Impressions and redemptions on campaigns at your gate zones.">
      <div className="grid cols-2">
        <Kpi label="Impressions" value={p ? fmt(p.impressions) : "—"} />
        <Kpi label="Redemptions" value={p ? fmt(p.redemptions) : "—"} tone="ok" />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{p?.campaigns ?? 0} campaigns running at your gates.</div>
    </Card>
  );
}
