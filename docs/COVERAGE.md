# Requirement Coverage

Maps the challenge's scored items to where they're implemented. **Must** items
are scored; **Should** items earn extra points. ✅ = implemented.

## Platform Admin
| Item | | Where |
|---|---|---|
| Live network map + presence heat | ✅ Must | `web/roles/Admin.tsx` NetworkMap, `/api/admin/network` |
| KPI strip | ✅ Must | Admin KPIs, `/api/admin/kpis` (live over WS) |
| Incident & bug tracker (auto-raised) | ✅ Must | `engine.detectIncidents`, `/api/admin/incidents` |
| Master data (list + create/edit) | ✅ Must | Admin MasterData form, `POST /api/admin/master` (`engine.upsertScreen/upsertOutlet`) |
| Data feed health | ✅ Should | Admin Feeds, `/api/admin/feeds` |
| Performance panel (p95, build time, uptime) | ✅ Should | Admin Performance, `/api/admin/performance` |

## Retailer
| Item | | Where |
|---|---|---|
| Live dashboard (impr/scans/redemptions/conv/revenue) | ✅ Must | `web/roles/Retailer.tsx`, `/api/retailer/:id/dashboard` |
| Passenger flow near store | ✅ Must | Flow panel, `passengerFlow()` |
| Campaign builder + live audience preview | ✅ Must | CampaignBuilder, `POST /api/campaigns/preview` |
| Creative library (reuse, duplicate) | ✅ Must | Creatives, `/api/creatives`, duplicate |
| Promo codes + QR + share-to-family | ✅ Must | Passenger QR, `/api/claim/:code(/share)` |
| Campaign history + ROI + run again | ✅ Must | History, `duplicateCampaign` |
| Trigger rules (delay → boost) | ✅ Should | Builder trigger + `engine.boostFor` |
| Stock-aware offers (pause) | ✅ Should | History toggle, `POST /api/campaigns/:id/stock` |
| Budget pacing + A/B creative | ✅ Should | History pacing bar + A/B, `/api/campaigns/:id/ab` |

## Media Manager
| Item | | Where |
|---|---|---|
| Inventory calendar | ✅ Must | `web/roles/MediaManager.tsx`, `/api/media/inventory` |
| Yield & pricing + 7-day forecast | ✅ Must | YieldPanel, `/api/media/yield` |
| Approval queue + brand-safety | ✅ Must | Approvals2, `/api/media/approvals` |
| Advertiser overview + under-delivering | ✅ Must | Advertisers, `/api/media/advertisers` |
| Segment heatmap | ✅ Must | HeatmapPanel, `/api/media/heatmap` |
| Package builder | ✅ Should | PackageBuilder, `/api/media/packages` |
| One-click advertiser report (shareable) | ✅ Should | report link, `GET /api/media/report/:id` (printable HTML → PDF) |

## Airline Representative
| Item | | Where |
|---|---|---|
| My flights today | ✅ Must | `web/roles/Airline.tsx`, `/api/airline/:code/flights` |
| Gate-area messaging (schedule) | ✅ Must | GateSchedule, `POST /api/airline/:code/schedule` |
| Delay-goodwill automation | ✅ Must | goodwill campaign + delay trigger, engine |
| Aggregated crowd profile | ✅ Must | `/api/airline/:code/profile` |
| Co-marketing marketplace | ✅ Should | CoMarketing, `/api/offers` + accept |
| Own-passenger performance | ✅ Should | OwnPerformance, `/api/airline/:code/performance` |

## Passenger screen
| Item | | Where |
|---|---|---|
| Full-screen 16:9 / 9:16 render | ✅ Must | `web/roles/Passenger.tsx` |
| FIDS context strip | ✅ Must | PassengerScreen fids |
| Dynamic selection as time moves | ✅ Must | live WS tick → `/api/screen/:id/playing` |
| Promo QR + countdown + LAN claim | ✅ Must | QR (`/api/qr`), `Claim.tsx`, `PUBLIC_BASE_URL` |
| "Why this ad?" overlay | ✅ Must | whyad overlay (profile + top-3 + rule) |

## WOW / demo
| Item | | Where |
|---|---|---|
| Simulation control bar (play/speed/jump/inject) | ✅ | `web/Shell.tsx` SimBar, `/api/sim/*` |
| Live cause-and-effect < 2s | ✅ | inject → immediate re-decide + WS delta |
| Split-screen demo | ✅ | `web/roles/Demo.tsx` |
| GenAI creative assistant (EN + 2nd lang) | ✅ | `/api/creative/generate`, mock provider |
| Smart recommendation (best 3 slots) | ✅ | MediaManager SlotRecommender, `/api/recommend/slots` |

## Technical requirements
| Item | | Where |
|---|---|---|
| Open, justified stack | ✅ | README "Why this stack" |
| Separate FE/BE, REST + WS, isolated adapters | ✅ | `apps/web`, `apps/api`, `adapters/` |
| Embedded DB + migrations + seed | ✅ | SQLite/Drizzle, `apps/api/drizzle/`, `seed.ts` |
| One-command start | ✅ | `docker compose up` |
| Full-scale mock data | ✅ | generator: 900 flights/180 screens/40 outlets/11 airlines/25 campaigns/30d history |
| Mock AODB/AIDX/ACRIS behind adapters | ✅ | `adapters/aodb|aidx|acris.ts`, `aodb-samples/` |
| Pluggable AI, default mock | ✅ | `CreativeProvider`, `creative.ts` |
| Responsive, dark admin / light business, mobile claim, white-label, i18n | ✅ | `styles.css`, themes by role, `Claim.tsx`, `BRAND_*`, `i18n.ts` |
| Performance (<2s, 60×) | ✅ | engine tick + WS deltas |
| Docs (README, architecture, adapter guide, API spec) | ✅ | `docs/` |

## Requires the reviewer's environment (not doable from the build sandbox)
- **Deployed public playground URL** — deploy per `docs/DEPLOYMENT.md` (Render blueprint included).
- **`docker compose up` on a Docker host** — image is standard; the identical build/run path is verified without the daemon.
