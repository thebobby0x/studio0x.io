# 003 — Architecture Seed

**Document type:** Architecture Baseline
**Version:** 1.0
**Status:** Seed — not the final architecture
**Authority:** Subordinate to `002 - SIE Constitution.md`
**Companion docs:** `Current-State-Assessment.md`, `SIE-Architecture-Planning-Extract.md`

> This document is not the Master Architecture. It is the seed from which the Master Architecture will grow. It captures what exists, names what must be protected, and defines the direction without prescribing the path.

---

## 1. Current Core Assets

These are the assets the platform is built on today. Future architecture work must account for each one — not necessarily by preserving their current form, but by understanding what they do and why they matter.

---

### LiveMetric

**Purpose:** Universal time-series metric store. Records any measurable value against a team, match, time, and metric type. The metric type is a free string — there are no sport-specific enums.

**Current maturity:** Production. Populated by the live match API pipeline. Not yet consumed by a dedicated analytics UI.

**Strategic value:** Highest. This is the cleanest SIE-native primitive in the codebase. It is what the SIE Metric layer needs to become — and it already is that thing. Every future metric category defined in the Constitution (Match Intelligence, Fan Intelligence, Performance Intelligence, Commercial Intelligence) can be stored here without schema changes.

**Reusability:** 5/5. Zero sport coupling. Ready for any event type, any sport, any metric name.

**Risks:** In-memory cache is not shared across serverless instances. At multi-instance scale, a shared cache layer (Redis/Upstash) is needed. The store also has no consumer UI — data exists but is not yet surfaced.

---

### Match DNA™

**Purpose:** Proprietary analytics engine that transforms event moments into four named intelligence primitives: Momentum Pulse™, Strike Clock™, Score Volatility™, Clutch Index™.

**Current maturity:** Production. Rendered on the dashboard (featured match) and on every match detail page. Scaffold renders even at 0–0 with placeholder states.

**Strategic value:** Highest. This is the platform's differentiating IP. The SIE brand promise — cross-sport intelligence — is delivered through this system. It is what separates SIE from a data aggregator.

**Reusability:** 2/5 today. The metric logic is sound and the visual primitives are reusable. The blocker is the input layer: all four metrics accept only `GoalEvent[]`. Until the input is replaced with a generic `MomentEvent[]`, the engine cannot serve any sport other than football.

**Risks:** Goal-event coupling is the single highest-value technical migration on the platform. If left unaddressed, the brand promise of cross-sport intelligence cannot be delivered.

---

### WhiteLabelPartner

**Purpose:** Multi-tenant deployment engine. Stores per-partner branding (colour, logo, domain), API access key (`embedKey`), plan tier (starter/pro/enterprise), and active status.

**Current maturity:** Schema complete, production. Runtime implementation (embed widget, partner portal, plan enforcement, branding injection) does not exist.

**Strategic value:** Highest. This is the foundation of the B2B commercial layer. Every future SIE deployment — podiumSelect, F1, UEFA — routes through this model. It is the mechanism by which SIE becomes a platform rather than a product.

**Reusability:** 5/5. Completely sport-agnostic. The model requires no changes for new sports or new partners.

**Risks:** Commercial risk: the model exists, the business layer does not. There is nothing to sell to a white-label partner today. The embed widget and partner portal are the two highest-priority commercial gaps.

---

### AudioStream

**Purpose:** Universal media layer. Stores audio assets with metadata (title, artist credit, duration, cover art), engagement counters (plays, listen seconds, shares), and social deep links (TikTok).

**Current maturity:** Production. The anthem hub is the most complete feature on the platform — global audio state, playlist management, shuffle/loop, social sharing, admin upload tooling, listen tracking, share tracking.

**Strategic value:** High. Audio is a first-class capability per the Constitution. The media layer extends naturally beyond anthems: AI commentary audio, race radio, match recaps, daily briefings, athlete profiles. The model and infrastructure support all of these without changes.

**Reusability:** 5/5. The model is generic. Only the "anthem" framing in naming is sport-specific. The underlying system is sport-agnostic.

**Risks:** Low. The only risk is naming drift — new audio use cases should not create parallel models. All audio assets should flow through `AudioStream`.

---

### Vendor Adapter Pattern

**Purpose:** Isolation of all external data providers. Each source (api-football, Kalshi, Polymarket, Anthropic) lives in its own module behind a clean function interface. Business logic never calls vendor APIs directly.

**Current maturity:** Implemented informally. The isolation is real and working; it is not yet formalised as a typed interface.

**Strategic value:** High. This pattern is what allows the platform to swap or add data sources without touching business logic. For a multi-sport platform with potentially dozens of data sources, this is the correct architecture.

**Reusability:** 4/5. The pattern is correct. The gap is that no formal `SportsDataSource` interface has been defined. Formalising this interface is a low-cost, high-value action.

**Risks:** Without a formal interface, new engineers may bypass the pattern and wire vendor APIs directly into business logic. The interface should be defined before the second data source for any new sport is integrated.

---

### Commentary System

**Purpose:** On-demand AI-generated match commentary via Claude Haiku 4.5. Three personas: analyst (tactical, BBC Sport style), fan (emotional, emoji), comedian (dry, absurdist).

**Current maturity:** Production. Functional but unoptimised — no response caching, no streaming. Every page load generates a fresh API call.

**Strategic value:** Medium-high. The Constitution defines commentary as a strategic capability with future modes: Broadcast, Analyst, Concierge, Fan, Executive Briefing, Multilingual. The current implementation is the seed of a much more capable system.

**Reusability:** 4/5. The SDK and model layer are sport-agnostic. Only the system prompt is football-framed. Per-sport prompt configurations are a low-complexity addition.

**Risks:** At match-day scale, uncached commentary generates significant Anthropic API cost. Caching and streaming are the two immediate engineering priorities for this system.

---

### Sponsorship System

**Purpose:** Commercial layer for sponsor management and ad slot targeting. Supports tier-based sponsor classification, placement-targeted ad slots, match/group-level targeting, impression and click counting.

**Current maturity:** Schema production-ready. Zero runtime implementation — no ads are displayed, no impressions are counted, no self-serve portal exists.

**Strategic value:** High. The Constitution specifies "Sponsored Intelligence" as the preferred sponsorship model. The schema already supports this. The activation cost is low.

**Reusability:** 3/5 today. Core sponsor fields are generic. The tier and placement enums encode World Cup vocabulary (`GROUP`, `ANTHEM`, `MATCH_DETAIL`) and resist multi-sport reuse. These enums are the primary migration target in the sponsorship layer.

**Risks:** Revenue is $0 on a working foundation. The longer activation is deferred, the more match-day inventory is lost. Sponsorship activation is the fastest path to revenue on the platform.

---

### User / Auth System

**Purpose:** Full identity and access management. Google OAuth via NextAuth v5, Prisma-backed session storage, four-tier role hierarchy (SUPER_ADMIN / ADMIN / WHITE_LABEL / USER).

**Current maturity:** Production. Stable and complete.

**Strategic value:** Medium. The system works. The role hierarchy is the right shape for a multi-tenant platform. The constraint is that roles are coarse-grained — no scoped permissions exist yet (e.g., a WHITE_LABEL partner scoped to a single sport or competition).

**Reusability:** 5/5. Completely sport-agnostic. Will scale to multi-sport, multi-tenant deployment without structural changes.

**Risks:** At B2B scale, the four-role hierarchy may need extension: partner-scoped access, sport-scoped access, competition-scoped access. This is a future addition, not a current gap.

---

## 2. Current Platform Layers

### Presentation Layer

Next.js 15 App Router with React 19. Server components fetch data at request time; client islands maintain interaction state. Dark theme; gold brand accent (#F5B800). All pages are sport-specific in their copy and layout — this is the layer most visibly tied to World Cup 2026. The Presentation Layer will need the most adaptation for each new deployment, and is deliberately not expected to generalise fully.

### Intelligence Layer

The core differentiation layer. Combines live match data (api-football), prediction market signals (Kalshi, Polymarket), and derived probability mathematics (Harville, logistic blend) into the Match DNA™ analytics suite. This layer is where proprietary IP lives. Currently football-specific in its inputs and output vocabulary. The `GoalEvent → MomentEvent` migration is the primary upgrade needed to make this layer multi-sport.

### Data Layer

Prisma ORM on Neon PostgreSQL. 14 models. All external sources isolated behind vendor adapters. In-memory TTL cache per-instance. Next.js `revalidate` for CDN caching. The data layer is the most directly coupled to World Cup 2026 through `Match.fixture` (vendor integer as primary key) and the 2-participant event shape. These are the two schema-level migrations needed before a second sport is onboarded.

### Media Layer

`AudioStream` model + global `AudioContext` React state + Vercel Blob storage + admin upload tooling. The most complete and most reusable layer on the platform. Persists across page navigations. Tracks engagement at the second-level granularity. Ready to carry AI commentary audio, race radio, match recaps, and any future audio capability without structural changes.

### Sponsorship Layer

Exists at the schema level only. `Sponsor` and `AdSlot` models are defined. Tier classification, placement targeting, match-level and group-level targeting, impression/click counters — all modelled. Nothing renders in the product. Activation requires display components and CRUD routes, not new architecture.

### White Label Layer

Exists at the schema level. `WhiteLabelPartner` model, `embedKey`, role assignment, plan classification — all present. The runtime layer (embed widget, partner portal, branding injection, plan enforcement) is the next commercial build. The schema is the foundation; it does not need to change for the first partner onboarding.

---

## 3. Future Platform Layers

These are defined at purpose level only. Architecture and implementation are out of scope for this document.

---

### Sports Intelligence Engine (Core)

The intelligence substrate that all deployments run on. Provides event data ingestion, metric computation, probability derivation, and real-time state management for any sport via sport adapters. World Cup 2026 is its first running instance.

---

### Human Performance Lab™

An analytics layer focused on athlete biometrics, physical performance, and physiological intelligence. Metrics include Climate Advantage Index™, Recovery Debt™, Fuel Tank Index™, Human Performance Delta™. Feeds into both the Intelligence Layer and the Commentary Engine. Distinct from match event intelligence — this layer operates on athlete-level data rather than event-level data.

---

### Commentary Engine

An evolution of the current commentary system into a full multi-persona, multi-sport, multi-format AI commentary platform. Future modes include Broadcast, Analyst, Concierge, Fan, Executive Briefing, and Multilingual. The engine should eventually support audio output (streaming to `AudioStream`), not only text. Relationship to the Media Layer: Commentary Engine produces content; Media Layer delivers it.

---

### Global Sports Events DB

A canonical, sport-agnostic database of sports events, competitions, and sporting properties. Serves as the authoritative source for the `Sport → Competition → Event` hierarchy. Distinct from api-football or any single vendor — this is an internal catalogue that vendor adapters populate. The foundation for multi-sport scheduling, standings, and routing.

---

### Travel Intelligence Engine

An extension of the current travel matrix and flight map into a full travel intelligence system. Covers fan and athlete travel routing, stadium proximity, transport demand modelling, and Travel Pulse™ metrics. Current foundation: `lib/travelMatrix.ts`, `lib/teamHomeCoords.ts`, OpenSky flight integration, `v2/travel-matrix` API route.

---

### Hospitality Intelligence Engine

Management of premium event experiences: VIP suites, concierge services, hospitality packages. Current foundation: `lib/vipSimulator.ts`, `v2/vip/[venueId]` route (stub). VIP Demand Index™ and Hotel Nights™ metrics belong to this layer. Relationship to the White Label Layer: premium partners (podiumSelect) are the primary consumers.

---

### podiumSelect Integration Layer

A premium concierge deployment of SIE targeted at high-value fans and corporate hospitality. Pulls from Hospitality Intelligence, Travel Intelligence, White Label Layer, and Sponsorship Layer. It is a deployment configuration of SIE, not a new product. The `WhiteLabelPartner` model is its tenancy primitive.

---

### Future Sport Adapters

Isolated vendor adapter modules for each new sport: Formula 1 data source, Olympics data source, UEFA data source, NFL data source, PGA data source, UFC data source. Each adapter implements the formal `SportsDataSource` interface. Each brings its own simulation fallback. No sport adapter should couple to the business logic layer directly.

---

## 4. Protected Architectural Assets

As designated in `002 - SIE Constitution.md`. These assets may evolve. They must not be casually replaced.

| Asset | Why Protected |
|---|---|
| **LiveMetric** | The only generic, sport-agnostic metric store in the platform. All future metric categories (Match, Fan, Performance, Commercial, Influence) can be stored here without schema changes. Replacing it means replacing the foundation of SIE's metric intelligence layer. |
| **Match DNA™** (metric primitives) | Core differentiating IP. Momentum Pulse™, Strike Clock™, Score Volatility™, and Clutch Index™ are the product's brand promise made concrete. They should be generalised (via `MomentEvent`), not replaced. |
| **WhiteLabelPartner** | The tenancy primitive for all B2B deployments. Every future partner, every future sport deployment, every future concierge product routes through this model. Its `embedKey` and role integration make it the commercial engine of the platform. |
| **AudioStream** | The only media primitive. Replacing it with a parallel model for a new audio use case (commentary audio, race radio, podcasts) would fracture the media layer. All audio assets should flow through this model. |
| **Vendor Adapter Pattern** | The isolation mechanism for all external dependencies. Breaking this pattern (wiring vendor APIs directly into business logic) creates coupling that is expensive to unwind. Each new data source must go through an adapter. |
| **`v2/` API Namespace** | The forward-compatible API surface. New routes should extend `v2/`. The unversioned API surface should not be extended with new sport-specific routes. |
| **Role Hierarchy** | SUPER_ADMIN / ADMIN / WHITE_LABEL / USER. Foundational for access control across multi-tenant deployment. Extensions are additive (scoped roles); the hierarchy itself should not be restructured. |

---

## 5. Major Future Migrations

These are the four migrations that materially change the platform's multi-sport capability. No implementation design is provided here — only the strategic case for each.

---

### Match → Event

**Why it matters:** `Match` encodes a football-specific concept. A Formula 1 race, a PGA round, a UFC bout, and an Olympic heat are all Events — but none of them are Matches. The rename is the gateway to a multi-sport event model.

**Risks:** The `Match` model is the central entity of the platform. It appears in ~30 API routes, all metric computations, the simulation engine, prediction markets, user predictions, and the sponsorship targeting layer. This is the widest-surface migration on the platform.

**Expected benefits:** Every future sport is an `Event`. The `Sport → Competition → Event` hierarchy in the Constitution becomes implementable. The Intelligence Layer can accept event data from any sport without structural changes.

---

### Player → Athlete

**Why it matters:** Formula 1 drivers, Olympic sprinters, UFC fighters, and PGA golfers are not "players." The naming assumption breaks the moment SIE moves to its second sport. `Athlete` is the correct universal term for any individual competitor.

**Risks:** Lower surface than `Match → Event`. Affects the `Player` model, team squad displays, lineup pages, player stat routes, and the Clutch Index™ scorer rankings. Manageable as a focused migration.

**Expected benefits:** The platform's entity naming aligns with the SIE Constitution. The `Athlete` model can carry sport-specific metadata (TLA for football, car number for F1, weight class for UFC) without structural changes.

---

### GoalEvent → MomentEvent

**Why it matters:** This is the most strategically important migration on the platform. The entire Match DNA™ system — the platform's differentiating IP — currently operates on `GoalEvent[]` only. An F1 overtake, a PGA birdie, a UFC knockdown, and a basketball buzzer beater are all moments. Without a generic `MomentEvent` type, none of them can power Momentum Pulse™, Strike Clock™, Score Volatility™, or Clutch Index™.

**Risks:** All four named metrics must be updated to accept the new type. The simulation engine must produce `MomentEvent[]` rather than simulating only goal events. The API response shape for the goals route changes. The risk is contained to the Intelligence Layer — the Data Layer and Presentation Layer are unaffected.

**Expected benefits:** Match DNA™ becomes the Event DNA™ engine: a sport-agnostic intelligence primitive that delivers the same four metrics for any sport's defining moments. The brand promise of cross-sport intelligence becomes deliverable.

---

### Match Simulator → Event Simulator

**Why it matters:** The current simulation engine generates football-specific statistics (possession, shots, corners, fouls, cards) seeded by a football fixture ID. When api-football is unavailable, this is the fallback. For any new sport, this fallback does not exist — the product would show broken state.

**Risks:** Low per-migration; high if deferred until a second sport is live. The simulator must be extended before a second sport is onboarded, not after.

**Expected benefits:** Each sport has a deterministic fallback simulation. The platform is resilient regardless of which sport's API is unavailable. The `EventSimulator` plugin pattern makes adding a new sport's fallback a contained, independent operation.

---

## 6. Architectural North Star

**What Studio0x Sports Intelligence Engine™ becomes over three years:**

SIE becomes the intelligence infrastructure layer for premium sports experiences — not one app, but the engine behind many.

In Year 1, it completes World Cup 2026 as Deployment #1 and activates the commercial layer: white-label embed, sponsored intelligence, and the partner portal. The intelligence engine is generalised from football-specific to event-agnostic. The naming convention is frozen in all new code.

In Year 2, the platform onboards its second sport. podiumSelect launches as a premium concierge deployment on the SIE platform — pulling from Travel Intelligence, Hospitality Intelligence, and the White Label Layer. The Commentary Engine evolves from on-demand text to streaming multi-format audio intelligence. Formula 1 or the Olympics becomes the second sport adapter.

In Year 3, SIE operates across three or more sports simultaneously, each as an independent deployment sharing the same intelligence infrastructure: LiveMetric, Match DNA™ (generalised), AudioStream, WhiteLabelPartner, and the Vendor Adapter Layer. A white-label partner can deploy a branded sports intelligence product for any supported sport without a platform fork. The Global Sports Events DB is the canonical event catalogue. Sponsored Intelligence is the primary commercial model — metrics and commentary moments are sponsorable inventory, not banner ads.

The platform is judged not by the number of sports it covers, but by the depth of intelligence it provides for each one — and by the speed at which it can deliver that intelligence for any new sport that is added.

---

*End of Architecture Seed. This document should be revisited and elevated into the Master Architecture once the `Match → Event` migration is scoped and the white-label v1 is shipped.*
