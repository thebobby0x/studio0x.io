# GPT Handoff Report — Studio0x Sports Intelligence Engine™

**Transfer date:** 2026-06-19
**From:** Claude (Engineering assessment)
**To:** GPT (SIE Constitution, Master Architecture, Execution Roadmap, Module Library, Metric Registry)
**Repo:** `thebobby0x/studio0x.io`
**Source docs:** `docs/Current-State-Assessment.md`, `docs/SIE-Architecture-Planning-Extract.md`, `docs/SIE-MIGRATION-ASSESSMENT.md`

---

## Current Product Reality

**What exists:** A production web platform delivering real-time FIFA World Cup 2026 intelligence. It is live, receiving traffic, and stable. This is Deployment #1 of what is being repositioned as the Sports Intelligence Engine™ (SIE) — a multi-sport, multi-deployment platform.

**What it does today:**
- Real-time match data aggregation with live scores, probabilities, and goal timelines
- Prediction market overlay from two independent market sources (Kalshi + Polymarket)
- Four proprietary named analytics metrics (the "Match DNA" system)
- A fully operational team-anthem music platform with listen/share tracking
- AI-generated match commentary in three personas
- User match predictions saved per-account
- Tournament standings, schedule, and group-stage odds

**Maturity:** Early production. Core features stable. Several commercial systems (ads, white-label embed, partner portal) exist as database schema only — not yet surfaced to users.

**Strategic position:** The platform is further along than its World Cup branding suggests. The tenancy layer, versioned API, generic metric store, and vendor adapter isolation are already SIE-grade infrastructure. The product layer is football-specific.

---

## Current Architecture

**Stack:** Next.js 15 (App Router) + React 19 + TypeScript. Serverless deployment on Vercel. PostgreSQL via Neon (serverless). File storage via Vercel Blob. No separate backend — all API logic is Next.js route handlers.

**Key architectural decisions that constrain future planning:**

1. **Single monorepo, single deployment.** No service separation. All logic — API, auth, DB, AI — lives in one Next.js application. This is fine now; multi-sport expansion will require either monorepo discipline or service extraction.

2. **Prisma schema-first.** All data models are defined in a single Prisma schema. Every SIE expansion that adds a new entity (Sport, Competition, Competitor) requires a Prisma migration.

3. **Vendor adapters are isolated.** Each external data source lives in its own module. This is the correct pattern for a multi-source platform. New sports data sources should extend this pattern, not bypass it.

4. **In-memory cache, not shared.** Serverless instances do not share cache state. At current scale this is fine. Multi-instance deployment requires Redis or equivalent.

5. **Auth is role-based, not scope-based.** Four roles: SUPER_ADMIN, ADMIN, WHITE_LABEL, USER. No fine-grained permission scoping. Sufficient for current use; will need extension for multi-sport partner access controls.

6. **`v2/` API namespace already exists.** New routes should use it. Do not extend the unversioned API surface.

7. **The audio system is globally stateful.** A single shared audio context persists across page navigations. This is the correct pattern for the media layer — it is a reference implementation for how global platform state should work.

---

## Current Metrics

All four implemented metrics share one critical constraint: they consume only goal events as input. This is the most important limitation for the SIE Metric Registry to address.

| Metric | What It Measures |
|---|---|
| **Momentum Pulse™** | Score advantage at 15-minute checkpoints across the match timeline |
| **Strike Clock™** | Goal timing rhythm — first goal minute, average gap, cadence label |
| **Score Volatility™** | Match drama via lead changes and equalisers; produces a drama label |
| **Clutch Index™** | Per-scorer weighted impact; late-goal multiplier rewards decisive moments |
| **Live Win Probability** | Blended pre-match market odds + score-based logistic model; home/draw/away |
| **Group Winner Probability** | Per-group tournament advancement odds from prediction markets |
| **Tournament Win Probability** | All-team tournament winner rankings from prediction market |
| **Harville Advance Probability** | Mathematical derivation of group advancement probability from win odds |

**What is missing:** A generic `MomentEvent` type that allows the metric engine to ingest non-goal moments (overtakes, knockdowns, birdies). The four named metrics are the right primitives — they just need a sport-agnostic input layer.

---

## Current Data Sources

| Source | What It Provides | Status |
|---|---|---|
| **api-football.com** (Pro plan) | Live scores, match status, goal events, lineups, player data | Active, primary |
| **Kalshi** | Match outcome market prices (home win / draw / away win) | Active, public API |
| **Polymarket** | Tournament winner odds, group winner odds | Active, public API |
| **Anthropic Claude** (Haiku 4.5) | On-demand match commentary, 3 personas | Active |
| **OpenSky Network** | Aircraft positions between team basecamps and stadiums | Active, supplementary |
| **Suno AI** | Pre-generated team anthem audio (not a live API; files stored on Vercel Blob) | Active (static) |

**Fallback system:** When api-football is unavailable or returns no data, a deterministic seeded simulation generates plausible match state. This ensures the product never shows broken state. The simulation is football-specific and will need per-sport variants.

---

## Current AI Systems

**One active AI integration:** Claude Haiku 4.5 for match commentary.

- On-demand generation (not cached, not streamed)
- Three personas: analyst (BBC Sport style), fan (emotional), comedian (dry/absurdist)
- Input: match metadata + real match events from api-football
- Output: 1–12 numbered commentary lines

**What is not yet active:**
- Claude Sonnet/Opus for deeper match analysis or summaries
- Any AI for predictions, rankings, or simulation augmentation
- Streaming responses (currently blocking)
- Commentary caching (currently regenerated on every request)

**Anthropic SDK is installed.** The dependency is present; only one endpoint uses it.

---

## Current Sponsorship Systems

**Schema exists; nothing is displayed to users.**

The data model supports: sponsor records with tier classification, ad slots targeting specific page placements, match-level and group-level ad targeting, impression counting, click counting.

**What is active in production:** Zero. No ads are rendered. No impressions are counted. No self-serve portal exists. The infrastructure is ready; the activation has not been built.

**Tier classifications defined:** Title sponsor, match sponsor, group sponsor, anthem sponsor, banner.

**Placement targets defined:** Home hero, schedule top, match detail, standings, anthems section, sidebar.

**Revenue today:** $0.

---

## Current White Label Readiness

**Database model:** Complete. Fields for organisation name, logo, primary brand colour, custom domain, API embed key, plan tier (starter/pro/enterprise), and active status.

**Runtime implementation:** None. No embed widget, no partner onboarding flow, no partner dashboard, no plan enforcement, no branding injection.

**Summary score: 5/10.** The hardest parts of multi-tenancy (data model, auth roles, API key generation) are built. The customer-facing parts are not.

**Fastest path to v1:** Embed widget endpoint keyed by the existing API key + CSS variable injection for brand colour + partner CRUD API. Estimated 2–3 focused sprints.

---

## Most Important Technical Debt

Ranked by risk to future expansion:

1. **Vendor ID as primary key.** The api-football fixture integer is the core event identifier. Every other sport requires a different ID space. Must be replaced with an internal opaque event ID before a second sport is onboarded.

2. **2-participant event model.** The event schema assumes exactly two participants (home team / away team). F1, golf, UFC, and most other sports have more than two. This assumption is embedded across the schema, UI, metrics, and simulation.

3. **Goal-only metric engine.** All four named metrics accept only goal events. The SIE brand promise (cross-sport intelligence) cannot be delivered until a generic moment event type replaces this.

4. **Football-only outcome math.** Win probability calculations hardwire a three-outcome model (home win / draw / away win). Sports without draws require a different outcome model.

5. **Enum-encoded sponsorship surfaces.** Ad placement and sponsor tier classifications are database enums containing World Cup vocabulary. Changing them requires a schema migration.

6. **Group-stage standings model.** Standings are computed from a football group-stage format. No generic competition phase abstraction exists.

7. **Nation-flag team identity.** Teams are identified by flag emoji and three-letter national codes. Club teams, F1 drivers, and individual athletes don't have nation flags.

8. **Football simulation.** The fallback simulation generates football-specific statistics. A second sport would have no fallback without a new simulation variant.

9. **AI commentary not cached or streamed.** Every page load regenerates commentary. At match-day scale this is a cost and latency problem.

10. **Naming debt in new code.** The naming convention is football-specific. Without an enforced freeze, every sprint creates new names that will need migration later.

---

## Most Important Opportunities

1. **White-label commercial activation.** The infrastructure exists. One sprint to a shippable B2B product. Highest near-term revenue leverage.

2. **Sponsorship activation.** The schema, targeting model, and counters exist. One sprint to display ads and count impressions. Zero to revenue with no schema changes.

3. **Generalize the metric engine.** Replacing `GoalEvent` with `MomentEvent` makes all four named metrics cross-sport without changing their visual design. This is the single highest-leverage platform migration.

4. **Commentary caching + streaming.** Dramatically reduces Anthropic API costs and improves UX simultaneously. Low complexity, high impact.

5. **LiveMetric consumer UI.** The metric store (possession, shots, corners, etc.) is populated but has no dedicated visualisation. Building one surfaces data that already exists.

6. **Second sport onboarding.** Once the event model is generalised and the vendor adapter pattern is applied to a new sport, the platform's multi-sport identity becomes demonstrable rather than aspirational.

7. **AI match summaries.** Post-match narrative generation via Claude is a natural extension of the commentary system. High user value, low implementation complexity given the SDK is already wired.

8. **Tournament path probabilities surface.** The Harville/geometric probability calculations already exist. No consumer UI surfaces them yet. A "road to the final" visualisation would be high-engagement content.

9. **Partner analytics dashboard.** Once white-label partners exist, they will need per-partner metrics (embed usage, engagement, anthem plays). The data model supports this; the dashboard does not exist.

10. **`worldcup.studio0x.io` domain.** Brand consolidation. The platform currently runs on a Vercel subdomain.

---

## Immediate Priorities

1. **Freeze World Cup naming in new code now.** Every new route, model, and component created from today should use SIE vocabulary (Event, Athlete, Competitor, `/api/events/`). No migration needed — just discipline.

2. **Merge PR #42** (the three assessment documents) to main and establish `docs/` as the canonical planning reference for GPT and future engineers.

3. **Activate sponsorship display.** Build the ad slot render component and CRUD routes. No schema changes. Direct path to revenue.

4. **Cache AI commentary** (30-second in-memory cache per match + persona). Immediate cost reduction before knockout-round traffic.

5. **Verify goals simulation fallback.** The deterministic goal-event fallback may have been lost in a recent merge conflict. Confirm it is intact — it is what makes Match DNA visible on seeded matches.

6. **Begin white-label embed widget.** Partner embed endpoint + CSS variable injection. First revenue-generating feature.

7. **Add SSE streaming to commentary.** Progressive display of commentary lines. UX improvement with no model or prompt changes.

8. **Build internal event ID layer.** Introduce an opaque internal event ID alongside the existing api-football fixture ID. This is the first schema migration and unblocks all future multi-sport work.

9. **Define `MomentEvent` type.** Establish the generic moment event interface. Football `GoalEvent` becomes the first implementation. No migration to existing metrics required until other sports are added.

10. **Upload remaining team anthems.** Matchday 2 is approaching. Teams without anthems appear as "coming soon" in the anthem hub. This is a content gap, not an engineering gap.

---

## Critical Context GPT Must Know

**1. World Cup 2026 is live. Nothing resets.**
The platform is in production during an active tournament. All planning must assume the existing deployment continues unchanged. Migrations happen post-tournament.

**2. The audio platform is the most complete and most reusable system.**
Anthem Hub, global audio state, listen/share tracking, admin upload tooling — this is a finished media layer embedded in a sports product. When planning the Module Library, treat audio as a first-class reusable module, not a sports feature.

**3. `LiveMetric` is the cleanest SIE primitive in the codebase.**
A generic key/value/time store with string-typed metric names. No sport coupling. This model is what the SIE Metric layer should be built on — it already exists.

**4. The tenancy foundation is built; the product layer is not.**
`WhiteLabelPartner` model, embed keys, role hierarchy, and `v2/` API namespace are production-grade. The embed widget, partner portal, and plan enforcement do not exist. This gap is the most important commercial gap.

**5. Match DNA is the brand's highest-value IP.**
The four named metrics (Momentum Pulse™, Strike Clock™, Score Volatility™, Clutch Index™) are genuinely differentiated and already trademarked in the codebase. The SIE brand promise is cross-sport intelligence. These metrics are the delivery mechanism. Generalising them to `MomentEvent[]` is the most important product-layer decision in the post-launch roadmap.

**6. The vendor adapter pattern is the right data-source architecture.**
Each external data source is isolated in its own module. The Master Architecture should formalise this as a `SportsDataSource` interface. This is not a future refactor — it is a formalisation of a pattern that already works.

**7. Sponsorship is $0 on a working schema.**
The commercial infrastructure exists at the database layer. Nothing displays. This is the fastest path to revenue in the entire platform — it requires display components, not new architecture.

**8. The simulation engine is both a safety net and a liability.**
It makes the product resilient. But it encodes football-specific logic. Any new sport requires a new simulation variant. The Master Architecture should include a per-sport EventSimulator plugin pattern before a second sport is onboarded.

**9. The `Match.fixture` debt is the highest-risk item for future expansion.**
A third-party vendor integer is the primary event identifier and is embedded as a database unique constraint and a foreign key. This must be the first schema migration tackled post-tournament. Every multi-sport and multi-source expansion depends on resolving it.

**10. The SIE target hierarchy is the governing vocabulary.**
`Sport → Competition → Event → Venue → Team → Athlete → Hospitality → Travel → Sponsor → Metric`
Every planning document GPT produces should use this hierarchy as its naming spine. Deviation from it creates debt. Adherence to it costs nothing.

---

*End of GPT Handoff Report. For full detail, reference the three source documents in `docs/`. For code-level specifics, reference the repository directly.*
