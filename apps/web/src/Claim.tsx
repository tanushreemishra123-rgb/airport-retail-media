import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type ClaimInfo } from "./api";

/** Mobile claim page opened by scanning the on-screen QR. Standalone (no shell). */
export function Claim() {
  const { code = "" } = useParams();
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    api.claim(code).then(setInfo);
  }, [code]);

  if (!info) return <div className="claim"><div className="muted">Loading…</div></div>;
  if (!info.ok) return <div className="claim"><div className="claim-card"><div className="claim-body"><h2>Invalid code</h2><p className="muted">This offer could not be found.</p></div></div></div>;

  const cr = info.creative;
  const copy = cr?.copy.en;
  return (
    <div className="claim">
      <div className="claim-card">
        <div className="claim-hero" style={{ background: cr ? `linear-gradient(135deg, ${cr.bgColor}, #000)` : "#222", color: cr?.fgColor ?? "#fff" }}>
          <div style={{ fontSize: 13, opacity: .8 }}>{info.campaign?.advertiserName}</div>
          <h1 style={{ margin: "6px 0", fontSize: 26 }}>{copy?.headline ?? info.campaign?.name}</h1>
          <p style={{ margin: 0, opacity: .9 }}>{copy?.body}</p>
        </div>
        <div className="claim-body">
          <div className="between" style={{ marginBottom: 12 }}>
            <span className="mono chip">{info.code}</span>
            <span className="muted" style={{ fontSize: 12 }}>valid until {info.validUntil?.slice(11, 16)}Z</span>
          </div>
          {claimed ? (
            <>
              <div className="badge ok" style={{ fontSize: 14, padding: "8px 14px" }}>✓ Claimed — show this screen at the counter</div>
              <button className="btn" style={{ marginTop: 12, width: "100%" }} onClick={() => api.share(info.code!).then((r) => setShareCode(r.code ?? null))}>Share a code with family</button>
              {shareCode && <div className="chip mono" style={{ marginTop: 10, display: "block", textAlign: "center", padding: 10 }}>{shareCode}</div>}
            </>
          ) : (
            <button className="btn primary" style={{ width: "100%", padding: 12, fontSize: 16 }} onClick={() => api.redeem(info.code!).then(() => setClaimed(true))}>
              {copy?.cta ?? "Claim offer"}
            </button>
          )}
          <p className="muted" style={{ fontSize: 11, marginTop: 14, textAlign: "center" }}>Powered by SkyReach · aggregated targeting only · no personal data</p>
        </div>
      </div>
    </div>
  );
}
