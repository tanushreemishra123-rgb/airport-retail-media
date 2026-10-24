# 15-Minute Demo Script

Audience: airport operator + advertiser stakeholders. Goal: show measured,
evidence-first ad targeting and cause-and-effect across roles. Open the deployed
playground URL; no setup needed.

**Before you start:** top-right shows the simulation clock. Use the sim bar
(play/pause, 1×/10×/60×, jump, ⚡ inject). Start paused at 06:00, speed 10×.

---

### 1 · The problem & the data (2 min) — Platform Admin
- Open **Platform Admin**. Point at the **network map**: every screen as a dot
  (green/amber/red), blue halos = live passenger presence per zone.
- KPI strip: screens online, ad plays, impressions, **revenue today**, latency.
- **Feed health**: AODB / AIDX / ACRIS adapters, messages/min. "All airport data
  is mocked but in real industry formats — going live is one adapter."
- Press **Play** (10×). Watch KPIs and the map move.

### 2 · The decision, and why it's trustworthy (3 min) — Passenger screen
- Switch to **Passenger screen**, pick zone **T2 Concourse C**. A targeted ad is
  playing with a **QR + countdown** and a FIDS strip of nearby flights.
- Toggle **"Why this ad?"**: the crowd profile bars, the top-3 candidate scores,
  and the winning rule. Note the **AI / verified** badge.
- Key line: *"Every input is measured and timestamped. The AI ranks, but the ad
  only plays after a deterministic check that each cited fact exists in a trusted
  feed, is fresh, and the score reproduces. A hallucination can't reach the
  glass — it falls back to a rule-based default."*

### 3 · Cause and effect in under a minute (3 min) — Split-screen demo
- Open **Split-screen demo** (passenger left, operator right).
- Hit **⚡ Delay <intl flight> +60m**. Within ~2 s: the gate's passenger count
  rises, the duty-free / **delay-goodwill** ad takes the screen (delay trigger
  boost), and the Airline view flags the delay.
- Scan the on-screen **QR** with a phone (or "Simulate claim"). The mobile claim
  page opens; claim it. **Redemptions and revenue tick up** on the right.
  *"A flight event changed what a passenger sees, they claimed a code, and money
  showed up — across four roles, live."*

### 4 · The retailer's self-serve (3 min) — Retailer
- Switch to **Retailer**, pick **Lumière Perfumes**.
- **Passenger flow near my store**: pax next 60 min, international %, top
  destinations.
- **Campaign builder**: drag segment weights (holiday, family), toggle
  *international only*, pick zones — the **live audience-match preview** updates
  ("matches X% of the crowd now, ~N impressions"). Submit for approval.
- **GenAI assistant**: type *"Festive sweets, 20% off, families flying domestic"*
  → a ready bilingual (EN/Arabic) ad page. Show **campaign history + ROI** and
  "run again".

### 5 · Selling the inventory (2 min) — Media Manager
- **Inventory calendar** (zone × hour, premium slots), **yield & pricing** from
  predicted footfall, the **approval queue** (approve the retailer's new
  campaign — watch it go live), **segment heatmap**.

### 6 · Resilience (1 min) — Admin
- From the sim bar, **inject a feed lag** (AIDX) or **take a screen offline**.
  An **incident** auto-raises in Admin; decisions on affected screens show the
  **rule-based fallback** (verification fails on stale evidence). Clear it.
- Close: *"Evidence-first targeting, auditable decisions, real feed formats, one
  command to run, one URL to review."*

---

**Reset:** reload the page, or redeploy. Jump the clock (e.g. to 14:00) to land
in a busy international bank for the richest crowds. The reproducible worked
example (delayed Gulf-bound gate → duty-free perfume wins) is in the decision
unit tests (`npm test`).
