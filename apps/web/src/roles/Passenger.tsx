import React, { useEffect, useState } from "react";
import { api, type Playing, type ScreenLite, type Zone } from "../api";
import { useStore } from "../store";
import { Card, Badge, SharesBars, useLiveTick } from "../ui";

export function Passenger() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [screens, setScreens] = useState<ScreenLite[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [screenId, setScreenId] = useState("");
  useEffect(() => { api.zones().then((z) => { setZones(z); setZoneId(z.find((x) => x.id === "T2-C")?.id ?? z[0]?.id ?? ""); }); }, []);
  useEffect(() => { if (zoneId) api.screens(zoneId).then((s) => { setScreens(s); setScreenId(s[0]?.id ?? ""); }); }, [zoneId]);
  return (
    <>
      <div className="between">
        <div>
          <h1 className="page-title">Passenger screen simulator</h1>
          <p className="page-sub">What a physical screen is showing right now — changes as flights board, delay and depart.</p>
        </div>
        <div className="row">
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
          <select value={screenId} onChange={(e) => setScreenId(e.target.value)}>{screens.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.orientation}</option>)}</select>
        </div>
      </div>
      {screenId && <div style={{ maxWidth: 900, margin: "0 auto" }}><PassengerScreen screenId={screenId} /></div>}
    </>
  );
}

export function PassengerScreen({ screenId, compact = false }: { screenId: string; compact?: boolean }) {
  const tick = useLiveTick();
  const now = useStore((s) => s.clock.now);
  const [p, setP] = useState<Playing | null>(null);
  const [why, setWhy] = useState(false);
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [claimed, setClaimed] = useState(false);
  useEffect(() => { api.playing(screenId).then(setP); }, [screenId, tick]);
  if (!p) return <div className="muted">Loading…</div>;

  const screen = p.screen;
  const cr = p.creative;
  const copy = cr ? (cr.copy[lang] ?? cr.copy.en) : null;
  const dec = p.decision;
  const topCandidates = dec ? [...dec.candidates].filter((c) => !c.filtered).sort((a, b) => b.finalScore - a.finalScore).slice(0, 3) : [];

  // countdown to the nearest boarding or promo expiry
  let countdown = "";
  if (now) {
    const target = p.promo?.validUntil ? Date.parse(p.nearby[0]?.time ?? p.promo.validUntil) : Date.parse(p.nearby[0]?.time ?? now);
    const secs = Math.max(0, Math.round((target - Date.parse(now)) / 1000));
    const m = Math.floor(secs / 60); countdown = `${m}:${String(secs % 60).padStart(2, "0")}`;
  }

  return (
    <div>
      {!compact && (
        <div className="row" style={{ justifyContent: "center", marginBottom: 10 }}>
          <button className={`btn sm ${lang === "en" ? "active" : ""}`} onClick={() => setLang("en")}>EN</button>
          <button className={`btn sm ${lang === "ar" ? "active" : ""}`} onClick={() => setLang("ar")}>AR</button>
          <button className={`btn sm ${why ? "active" : ""}`} onClick={() => setWhy((w) => !w)}>Why this ad?</button>
          <Badge tone={screen.status === "online" ? "ok" : "bad"}>{screen.status}</Badge>
          {dec && <Badge tone={dec.engine === "ai" ? "ai" : "rules"}>{dec.engine}{dec.verification.fallbackUsed ? " fallback" : ""}</Badge>}
        </div>
      )}
      <div className={`screen-frame ${screen.orientation}`}>
        {/* FIDS context strip */}
        <div className="fids">
          {p.nearby.slice(0, 4).map((f) => (
            <span key={f.flightNumber}>{f.flightNumber} {f.destination} {f.gate ?? ""} {f.time.slice(11, 16)} <b style={{ color: f.status === "delayed" ? "#ff8" : f.status === "boarding" ? "#8f8" : "#fff" }}>{f.status}</b></span>
          ))}
        </div>
        {/* Ad */}
        {cr && copy ? (
          <div className="ad" style={{ background: `linear-gradient(135deg, ${cr.bgColor}, #000)`, color: cr.fgColor, direction: lang === "ar" ? "rtl" : "ltr" }}>
            <h1>{copy.headline}</h1>
            <p>{copy.body}</p>
            <span className="cta">{copy.cta} →</span>
            {p.promo && (
              <>
                <img className="qr" alt="scan to claim" src={`/api/qr?code=${encodeURIComponent(p.promo.code)}`} />
                <div className="countdown">⏳ {countdown}</div>
              </>
            )}
          </div>
        ) : (
          <div className="ad" style={{ background: "#0b0f17", color: "#889" }}>
            <h1>{screen.status === "offline" ? "Screen offline" : "SkyReach"}</h1>
            <p>{screen.status === "offline" ? "This screen is being serviced." : "No targeted campaign for this crowd — house content."}</p>
          </div>
        )}
        {/* Why this ad overlay */}
        {why && dec && (
          <div className="whyad">
            <strong>Why this ad?</strong>
            <div className="muted" style={{ fontSize: 11, margin: "4px 0" }}>Crowd: {dec.crowdProfile.paxNow} pax · intl {Math.round(dec.crowdProfile.internationalShare * 100)}% · dwell {dec.crowdProfile.medianDwellMinutes}m</div>
            <SharesBars data={dec.crowdProfile.tripPurpose} limit={3} />
            <div style={{ marginTop: 6 }}>
              {topCandidates.map((c, i) => (
                <div key={c.campaignId} className="row between" style={{ fontSize: 11 }}>
                  <span>{i + 1}. {c.campaignId}</span><span className="mono">{Math.round(c.finalScore * 100) / 100}</span>
                </div>
              ))}
            </div>
            <div className="evidence" style={{ marginTop: 4 }}>✓ {dec.winningReason.slice(0, 90)}</div>
          </div>
        )}
      </div>
      {!compact && p.promo && (
        <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
          <span className="muted">Scan with your phone, or</span>
          <button className="btn sm primary" onClick={() => api.redeem(p.promo!.code).then(() => setClaimed(true))}>Simulate claim</button>
          {claimed && <Badge tone="ok">claimed — visible on retailer dashboard</Badge>}
          <a className="btn sm" href={`/claim/${p.promo.code}`} target="_blank" rel="noreferrer">Open claim page</a>
        </div>
      )}
    </div>
  );
}
