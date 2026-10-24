import React, { useEffect, useState } from "react";
import { api, type Airline as AirlineT, type AirlineFlight, type CrowdProfile } from "../api";
import { Card, Badge, SharesBars, fmt, useLiveTick } from "../ui";

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
    </>
  );
}
