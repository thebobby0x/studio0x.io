# SIE Architecture Planning Extract

**Source:** `docs/Current-State-Assessment.md`
**Date:** 2026-06-19
**Purpose:** Condensed signal for architecture planning, governance docs, and SIE Constitution drafting

---

## 1. Current Product Snapshot

### Purpose
A real-time sports intelligence web platform deployed for FIFA World Cup 2026. It aggregates live match data, overlays prediction-market probability signals, generates AI commentary, and operates a full team-anthem music platform with social sharing and listen tracking.

### Maturity Level
**Early production.** The platform is live and receiving real traffic. Core features are stable. Instrumentation (listen counts, share clicks, ad impressions) is wired but no analytics dashboard consumes it yet. Several systems exist as schema-only (sponsorship display, white-label embed).

### Deployment Status
- **Live:** Dashboard, Schedule, Match Detail, Standings, Anthems, AI Commentary, Auth, Admin panel
- **Schema-ready, not shipped:** Ad slot rendering, White-label embed widget, Partner onboarding, Plan enforcement
- **Stub / placeholder:** VIP suite data, Travel stats route, Broadcast schedule

### Current Strengths
1. **Real-time data pipeline** — api-football.com → live metrics → derived probabilities — works end-to-end with graceful simulation fallback.
2. **Prediction market integration** — Kalshi + Polymarket wired cleanly; live odds on every match and group.
3. **Proprietary metric IP** — Four named analytics primitives (Momentum Pulse™, Strike Clock™, Score Volatility™, Clutch Index™) are working and differentiated.
4. **Music platform** — Full-featured anthem hub with global audio state, playlist management, listen/share tracking, and social deep links. Unusually complete for a sports data product.
5. **Tenancy foundation** — `WhiteLabelPartner` model, `embedKey`, role system, and `v2/` API namespace are all in place — the hardest part of multi-tenancy is already built.
6. **Vendor isolation** — Every external data source lives behind its own adapter module. Swapping or adding sources is a contained operation.
7. **Deterministic fallback** — Seeded simulation means the product never shows broken state, even without API keys.

### Current Weaknesses
1. **2-participant event model is pervasive** — `homeTeam`/`awayTeam` is hardwired through the schema, components, simulation, and metrics. The most expensive debt to unwind.
2. **Vendor ID as primary key** — `Match.fixture` (api-football int) is a unique constraint and a FK in `Prediction`. Cross-sport or multi-source expansion requires a new identity layer.
3. **Football-only outcome math** — Home/draw/away 3-way is the only outcome model. No abstraction exists.
4. **Goal-centric metrics** — All four named metrics consume only `GoalEvent[]`. The brand promise (cross-sport intelligence) outpaces the current implementation.
5. **Monetization not activated** — Sponsorship schema and ad slot model are complete; nothing renders ads or counts impressions in production.
6. **No caching on AI commentary** — Commentary regenerated on every request; no SSE streaming; meaningful Anthropic API cost at scale.
7. **White-label commercially unbuilt** — Model exists, embed widget and partner portal do not.

---

## 2. Existing Systems Inventory

| System | Status | Maturity (1–5) | Reusability (1–5) | Notes |
|---|---|---|---|---|
| **Dashboard** | Live | 4 | 3 | Tile/list toggle, live card, DNA inline. World Cup framing in copy/layout. |
| **Schedule** | Live | 4 | 4 | Clean date/status list. Only coupling: football status codes (NS/HT/FT). |
| **Standings** | Live | 3 | 2 | Group-stage only. Hardwired to football group format. Low reusability. |
| **Match DNA / Pulse** | Live | 4 | 2 | The core IP. Goal-centric today. High generalisation value, high migration cost. |
| **Predict** | Live | 3 | 3 | Score prediction per user per fixture. `fixtureId` coupling is the main blocker. |
| **Anthems** | Live | 5 | 5 | Strongest reusable system. `AudioStream` model is generic. Only "anthem" naming is sport-specific. |
| **Commentary** | Live | 3 | 4 | Claude Haiku, 3 personas, on-demand. No caching, no streaming. Prompt is football-framed but swappable. |
| **Sponsorship** | Schema only | 2 | 3 | Models complete. No display components, no impression counting, no self-serve. |
| **Analytics** | Partial | 2 | 3 | Listen/share counters exist in DB. Admin stats page shows anthem data. No broader analytics surface. |
| **Admin** | Live | 3 | 3 | Anthem upload + batch import functional. No ad slot CRUD, no partner management. |
| **User System** | Live | 5 | 5 | NextAuth v5 + Google OAuth + Prisma-backed sessions + role hierarchy. Completely sport-agnostic. |
| **White Label** | Schema only | 2 | 5 | Model is excellent. Nothing above the DB layer exists. |
| **Travel / VIP** | Stub | 1 | 3 | `v2/` routes exist. Data is hardcoded. OpenSky flight map works visually. |
| **Win Probability** | Live | 4 | 2 | Harville + logistic blend. Maths assumes football 3-way outcomes. |
| **Simulation Engine** | Live | 4 | 2 | Deterministic fallback for match state. Football stat types baked in. |

---

## 3. Existing Data Architecture

### APIs (External)

| Source | Type | Auth | Caching | Purpose |
|---|---|---|---|---|
| api-football.com | REST (Pro) | Header key | 10s live / 2m today / 1h past | Live scores, events, lineups, players |
| Kalshi | REST (public) | None | 10s per match | Match outcome market prices |
| Polymarket Gamma | REST (public) | None | 5m tournament / 10s group | Tournament + group winner probabilities |
| Anthropic (Claude Haiku 4.5) | SDK | API key | None | On-demand match commentary |
| OpenSky Network | REST (public) | None | Not specified | Aircraft positions for flight map |

### Data Models (14 Prisma models)

**Sport domain:** `Team`, `Player`, `Match`, `LiveMetric`, `KalshiMarket`

**Media:** `AudioStream`

**User:** `User`, `Account`, `Session`, `VerificationToken`, `Prediction`

**Commerce:** `Sponsor`, `AdSlot`, `WhiteLabelPartner`

**Key coupling:** `Match.fixture` (Int, api-football ID) is both a unique constraint and the FK used by `Prediction.fixtureId`. This is the primary identity debt.

**Key generic asset:** `LiveMetric` — pure key/value/time store with `metricType` as a string. Zero sport coupling. Ready for SIE Metric layer as-is.

### Data Storage

| Store | Technology | Used for |
|---|---|---|
| Primary DB | Neon PostgreSQL (serverless) | All Prisma models |
| File storage | Vercel Blob | Audio files, cover art |
| In-memory cache | Custom `InMemoryCache<T>` (TTL + FIFO) | API responses (Kalshi, football) |
| CDN cache | Next.js `next: { revalidate: N }` | Route-level response caching |

No Redis. No persistent queue. No event stream. Cache is per-instance (adequate now; will need Redis or Upstash at multi-instance scale).

### External Service Dependencies

| Service | Criticality | Fallback |
|---|---|---|
| api-football.com | High | Deterministic simulation |
| Neon PostgreSQL | Critical | None |
| Vercel (hosting + Blob) | Critical | None |
| Anthropic API | Medium | HTTP 503 (commentary disabled) |
| Kalshi | Medium | Omitted from response |
| Polymarket | Medium | Omitted from response |
| Google OAuth | High | Sign-in unavailable |
| OpenSky | Low | Map empty |

---

## 4. Existing Metrics Registry

| Metric | Purpose | Inputs | Visualization |
|---|---|---|---|
| **Momentum Pulse™** | Score advantage across match timeline | `GoalEvent[]`, match elapsed time | Horizontal 0–90′ bar; coloured goal dots at exact minute; home/away/level colour coding |
| **Strike Clock™** | Goal timing rhythm and scoring cadence | `GoalEvent[]` | First goal minute, avg gap, rhythm label (Explosive / High-Scoring / Late Drama / Steady) |
| **Score Volatility™** | Match drama via lead changes | `GoalEvent[]` | Lead change count, equaliser count, drama label (High Drama / Tense / Shifted / Dominant) |
| **Clutch Index™** | Per-scorer weighted impact; late-goal bonus | `GoalEvent[]`, minute, match state at each goal | Ranked scorer list with weighted CI score |
| **Live Win Probability** | Blended pre-match + score-based home/draw/away | Polymarket tournament odds + live score + elapsed time | Three-bar meter (home / draw / away %) |
| **Harville Advance Probability** | P(team advances from group) | All group teams' tournament win probabilities | Implicit (used in group winner tickers) |
| **Tournament Path Probabilities** | P(reach R16/QF/SF/Final) | P(win tournament) + P(advance group) | Not yet surfaced as dedicated UI |
| **Group Winner Tickers** | Live group winner probabilities | Polymarket group markets per group | Probability bars per group, all teams |
| **Tournament Odds** | All-teams tournament win % | Polymarket tournament markets | Ranked list with win % |

**Registry gap:** No metric currently consumes `LiveMetric` rows directly in a consumer UI. The `LiveMetric` store (possession, shots, corners, fouls, cards) is populated but only used in the live API response — no standalone visualisation exists.

---

## 5. Existing Technical Debt

| Item | Type | Rank |
|---|---|---|
| `Match.fixture` (vendor int) as unique constraint + `Prediction.fixtureId` FK | Architectural | **High** |
| 2-participant assumption (`homeTeam`/`awayTeam`) pervasive across schema, components, simulation, metrics | Architectural | **High** |
| `GoalEvent[]` as the only moment type feeding all four named metrics | Architectural | **High** |
| Football 3-way outcome math (`home`/`draw`/`away`) hardwired in `probabilities.ts` and Kalshi integration | Logic | **High** |
| `SponsorTier` enum values (`MATCH`, `GROUP`, `ANTHEM`) encode World Cup surfaces | Schema | **Medium** |
| `AdSlotPlacement` enum values (`MATCH_DETAIL`, `STANDINGS`, `ANTHEMS`) encode World Cup pages | Schema | **Medium** |
| `Team.groupStage`, `/api/standings`, group-market routes — single tournament format | Architectural | **Medium** |
| `Team.flagEmoji` + 3-letter TLA as required team identity — doesn't generalise to clubs, F1, golf | Data model | **Medium** |
| `lib/simulation.ts` — football stat types hardcoded (`possession`, `shots`, `corners`, `fouls`, `cards`); `MEX`/`RSA` team codes referenced | Logic | **Medium** |
| AI commentary not cached; no SSE streaming | Performance | **Medium** |
| `components/match/`, `components/anthem/` directory naming | Naming | **Low** |
| `Match` model name, `Player` model name, `KalshiMarket` model name | Naming | **Low** |
| `/api/matches/*` route surface | Naming | **Low** |
| `AudioStream.artistCredit` defaults to `"Suno AI × Studio0x"` — vendor name in schema default | Data model | **Low** |
| In-memory cache not shared across serverless instances | Infrastructure | **Low** (at current scale) |

---

## 6. White Label Readiness Score

| System | Score (1–10) | Rationale |
|---|---|---|
| **User System / Auth** | 9 | Roles, sessions, Google OAuth — fully sport-agnostic and multi-tenant ready |
| **WhiteLabelPartner model** | 8 | All fields exist: `embedKey`, `domain`, `primaryColor`, `planName`. No runtime implementation yet |
| **Anthem / Audio** | 8 | Generic `AudioStream` model. Player, tracking, sharing all reusable. Only "anthem" naming needs updating |
| **LiveMetric store** | 8 | Pure key/value/time — zero sport coupling, ready to ingest any sport's metrics |
| **Vendor adapters** | 7 | Isolated modules behind clean function interfaces. Adding a new sport data source is a contained operation |
| **Sponsorship schema** | 6 | Core fields generic; enum values need replacement. No display layer exists |
| **Admin panel** | 5 | Anthem management is functional. No partner management, no ad slot CRUD, no plan enforcement |
| **Commentary (AI)** | 5 | Model/SDK layer is reusable. Prompt is football-framed and would need sport-specific variants |
| **Match DNA / Metrics** | 3 | Proprietary IP but goal-centric. Needs `MomentEvent[]` abstraction to be reusable across sports |
| **Dashboard / Schedule / Standings** | 3 | Pages reference football-specific concepts (groups, match, fixture, elapsed) in layout and copy |
| **Win Probability** | 2 | Maths hardwires 3-way football outcomes. Unusable for other sports without replacement |
| **Simulation engine** | 2 | Football stat types and team-code logic baked in. Needs per-sport plugin pattern |

**Overall white-label readiness: 5/10.** The platform and tenancy *infrastructure* is strong; the sport-specific *product layer* is not yet abstracted.

---

## 7. SIE Readiness Assessment

### Already Aligned ✅

| System | Reason |
|---|---|
| `WhiteLabelPartner` | Multi-deployment tenancy primitive; no sport coupling |
| `LiveMetric` | Generic key/value/time metric store; `metricType` is a free string |
| `v2/` API namespace | Forward-compatible surface; venue/VIP routes keyed by `venueId` not match |
| Vendor adapters | Isolated behind function interfaces; swappable per the SIE data-source pattern |
| Auth & roles | Standard; sport-independent |
| Audio / Anthem engine | Generic `AudioStream` model; only naming is sport-flavored |
| Travel + hospitality | Coordinate/venue-driven; maps to SIE Hospitality + Travel layers |
| Sponsor + AdSlot core fields | `name`, `logoUrl`, `tier`, `active`, date window are generic ad-platform primitives |
| Infra: `lib/cache.ts`, `lib/prisma.ts`, `lib/api.ts` | Pure infrastructure; zero sport coupling |

### Partially Aligned ⚡

| System | Reason |
|---|---|
| Commentary | Model/SDK layer is SIE-ready; prompt and persona framing is football-specific |
| Schedule page | Structure is generic; field names and status codes reference football |
| Admin panel | Anthem management works; partner/ad-slot management not built |
| Sponsorship | Schema is partially generic; enums encode WC surfaces; no display layer |
| `Predict` feature | Concept is sport-agnostic; `fixtureId` coupling is the blocker |

### Not Aligned ❌

| System | Reason |
|---|---|
| `Match` model | `homeTeam`/`awayTeam` 2-participant shape; `fixture` vendor key; football status codes |
| `Player` model | Name is football-specific; generalises to `Athlete` |
| Win Probability | 3-way outcome math (home/draw/away) is football-only |
| Match DNA metrics | `GoalEvent[]`-only input; entire metric family needs `MomentEvent[]` abstraction |
| Simulation engine | Football stat types and logic hardcoded |
| Standings / Groups | `groupStage` field, group-stage routes encode a single tournament format |
| Team identity | `flagEmoji` + TLA are international-football conventions; break for clubs, F1, golf |

---

## 8. Recommended Evolution Path

### Keep Unchanged
- `User`, `Account`, `Session`, `VerificationToken`, `WhiteLabelPartner` — sport-agnostic as written
- `LiveMetric` — generic store; no changes needed, only new consumers
- `AudioStream` model (fields only; rename "anthem" framing in naming)
- `lib/cache.ts`, `lib/prisma.ts`, `lib/api.ts`, `lib/flags.ts`, `lib/units.tsx`
- Vendor adapter isolation pattern — this is the right architecture; extend it, don't change it
- `v2/` API namespace — continue building new routes here

### Should Become Reusable Platform Infrastructure
- **Event model** — generalise `Match` → `Event` with `participants[]` join table and flexible `scoreline`
- **Athlete model** — generalise `Player` → `Athlete`
- **MomentEvent system** — abstract `GoalEvent[]` → `MomentEvent[]`; Match DNA metrics become the first consumer
- **OutcomeModel interface** — abstract `home/draw/away` into a per-sport strategy; football 3-way becomes one implementation
- **EventSimulator plugin** — abstract simulation into per-sport plugins; football is implementation #1
- **Stage/Phase model** — replace `groupStage` + standings with a generic `Competition → Stage → Phase` hierarchy
- **Sponsor/Ad placement system** — replace enum-encoded surfaces with generic placement IDs + sport/competition scoping
- **SportsDataSource interface** — formalise what `footballData`, `kalshi`, `polymarket` already informally satisfy
- **Commentary prompt layer** — extract sport-specific prompt framing into per-sport configurations; keep SDK layer generic
- **White-label embed + partner API** — build on the existing model; highest near-term commercial leverage

### Remain World Cup Specific
- Current page copy, branding, and visual identity
- api-football.com league=1/season=2026 wiring
- `Team.flagEmoji` + TLA codes (migrate nationality to optional metadata post-launch)
- `Match.fixture` (api-football ID) — retain as `external_ref` after internal ID is introduced
- All group-stage routes, standings logic, and group-market Polymarket mapping
- Existing `Prediction` records (preserve data; migrate schema post-launch)

---

## 9. Critical Findings

1. **The tenancy layer is the most underrated asset.** `WhiteLabelPartner` + `embedKey` + role system is the foundation of a B2B SaaS product. It's built; it just needs the runtime layer on top. This should be the first post-launch commercial sprint.

2. **`Match.fixture` is the highest-risk technical debt.** A third-party integer is a unique constraint and a FK. Every future sport or data source has a different ID space. An internal opaque event ID + `external_refs` map must be the first schema migration post-launch.

3. **The 2-participant assumption is the most pervasive debt.** It touches the schema, `LiveMatchCard`, `MatchDNA`, all four named metrics, simulation, and probability math. It cannot be unwound incrementally — it requires a planned migration with full test coverage.

4. **`LiveMetric` is the hidden gem.** It is the cleanest SIE-native primitive in the codebase. A generic key/value/time store with `teamCode` and `metricType` as strings. Everything the SIE Metric layer needs to become is already implicit in this model.

5. **Match DNA is the brand's highest-value IP and its tightest constraint.** The four named metrics are genuinely differentiated. But they only work on `GoalEvent[]`. Generalising to `MomentEvent[]` is the most important product-layer migration in the post-launch roadmap — it's what turns the brand promise into a reality.

6. **The audio platform is more complete than any other system.** Global audio state, playlist management, listen tracking, share tracking, social deep links, admin upload tooling — this system is at a higher maturity level than the core sports features. It is a reusable media layer, not a sports feature.

7. **Monetization is zero dollars on a working foundation.** Sponsor + AdSlot schema, impression/click counters, placement targeting — all exist. Nothing renders an ad. The activation cost is low (one sprint for display components + CRUD routes). This is the fastest path to revenue.

8. **AI commentary is the most fragile system.** No caching, no streaming, direct Anthropic API calls on every request. At match-day traffic scale this is a cost and latency problem. Commentary caching + SSE streaming should be prioritised before the knockout rounds.

9. **The simulation engine is a strategic liability that's currently a strength.** It makes the product resilient when APIs fail. But it encodes football-specific stat types. As new sports are added, each will need its own simulation variant — the plugin pattern should be introduced before a second sport is onboarded.

10. **The naming convention debt is low-cost to stop accruing today.** Every new table, route, and component created between now and the post-launch migration sprint is a decision. Adopting `Event`, `Athlete`, `Competitor`, `/api/events/`, `components/event/` in all new code costs nothing and prevents the debt from compounding. This is the only migration recommendation that should begin immediately.

---

*End of Architecture Planning Extract. Companion documents: `Current-State-Assessment.md`, `SIE-MIGRATION-ASSESSMENT.md`.*
