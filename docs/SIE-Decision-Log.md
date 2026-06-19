# SIE Decision Log

**Project:** Studio0x Sports Intelligence Engine™
**Started:** 2026-06-18
**Maintained by:** Engineering + Founder
**Purpose:** Historical record of all major architectural, strategic, and commercial decisions. Future team members and AI sessions should read this before making decisions that could conflict with prior commitments.

> Each entry answers: *Why did we make this decision?*

---

## Decision Registry

---

### DEC-001 — World Cup 2026 Becomes Deployment #1

**Date:** 2026-06-18
**Status:** Confirmed

**Decision:**
The FIFA World Cup 2026 platform is not a standalone product. It is the first deployment of the Studio0x Sports Intelligence Engine™. It is referred to internally as "Deployment #1."

**Reason:**
The platform was built with reusable primitives (generic metric store, white-label tenancy model, isolated vendor adapters) that exceed the scope of a single tournament product. Repositioning it as Deployment #1 captures this architectural reality and sets the correct frame for all future investment decisions. Treating it as a standalone product would mean re-architecting from scratch for every new sport — which is unnecessary given what was already built.

**Impact:**
- All future architecture decisions must ask: "does this work across deployments, or only for World Cup?"
- New code must not create World Cup-specific structures unless unavoidable, and exceptions must be documented
- The World Cup platform stays live and unchanged — it is not reset or refactored to accommodate this framing

**Revisit date:** Post-tournament (after 2026 World Cup final) — assess whether Deployment #2 validates the model

---

### DEC-002 — Studio0x Sports Intelligence Engine™ Becomes the Platform Identity

**Date:** 2026-06-18
**Status:** Confirmed

**Decision:**
The project is formally renamed from "World Cup 2026 App" to "Studio0x Sports Intelligence Engine™" (SIE). This name applies to all internal references, documentation, PR naming, branch naming, and strategic planning.

**Reason:**
The platform's ambition — powering FIFA, F1, Olympics, UEFA, NFL, PGA, UFC, Esports, and future sports — cannot be communicated under a World Cup-specific identity. The SIE name signals the platform's nature as infrastructure, not as a one-off product. It also enables white-label and B2B conversations that would be impossible under tournament-specific branding.

**Impact:**
- All documentation produced from 2026-06-18 onward uses "SIE" as the canonical product name
- "World Cup 2026" is a deployment name, not the product name
- External brand identity (public-facing product name per deployment) may differ from the internal platform name

**Revisit date:** When SIE powers its second deployment — at that point the brand may benefit from public announcement

---

### DEC-003 — SIE Naming Convention Adopted as Standard

**Date:** 2026-06-18
**Status:** Active standard — not yet enforced by tooling

**Decision:**
All new code (models, routes, components, type names, field names) must use SIE vocabulary rather than football-specific terminology. The governing hierarchy is:
`Sport → Competition → Event → Venue → Team → Athlete → Hospitality → Travel → Sponsor → Metric`

Preferred terms: `Event`, `Athlete`, `Competitor`, `sport`, `competition`
Forbidden in new code: `match`, `player`, `world_cup_*`, `group_stage`, `fixture` (as a concept, not the legacy field)

**Reason:**
Every new piece of code written with football-specific naming becomes technical debt that must be migrated before a second sport can be onboarded. The convention freeze costs nothing and prevents the debt from compounding. The existing World Cup-specific code is grandfathered — only new code is subject to the convention.

**Impact:**
- New API routes: `/api/events/` not `/api/matches/`
- New components: `components/event/` not `components/match/`
- New models: `Event`, `Athlete` not `Match`, `Player`
- Exceptions require a documented justification
- A `CONTRIBUTING.md` note or ADR must enforce this formally

**Revisit date:** None — this is a permanent standard. The specific terms may expand as new sports introduce new vocabulary.

---

### DEC-004 — Protected Architectural Assets Designated

**Date:** 2026-06-18 (ratified in Architecture Seed 2026-06-19)
**Status:** Confirmed — per SIE Constitution

**Decision:**
Five systems are designated Protected Architectural Assets. They may evolve. They must not be casually replaced or abandoned.

1. **LiveMetric** — universal time-series metric store
2. **Match DNA™** (Momentum Pulse™, Strike Clock™, Score Volatility™, Clutch Index™) — proprietary analytics IP
3. **WhiteLabelPartner** — multi-tenant deployment engine
4. **AudioStream** — universal media layer
5. **Vendor Adapter Pattern** — external service isolation mechanism

**Reason:**
These five systems represent the platform's highest-value assets. Each took meaningful engineering investment to build correctly. Casually replacing them — or building parallel systems that duplicate their function — would fragment the platform and create maintenance debt. Formal designation ensures future engineers and AI sessions treat them with appropriate weight before proposing changes.

**Impact:**
- Any proposal to replace or significantly restructure a protected asset must go through a formal decision process (new DEC entry)
- Extensions and generalisations are encouraged; replacements require justification
- The Constitution (`002 - SIE Constitution.md`) carries these designations as the highest-authority document

**Revisit date:** Annually — the list may grow as new high-value assets are built

---

### DEC-005 — White-Label-First Commercial Strategy

**Date:** 2026-06-19
**Status:** Confirmed as primary B2B revenue strategy

**Decision:**
The platform's primary commercial model for B2B revenue is white-label deployments: partners pay to embed SIE-powered intelligence under their own brand, domain, and colour scheme. The `WhiteLabelPartner` model with `embedKey`, `domain`, `primaryColor`, and `planName` is the commercial engine.

**Reason:**
White-label is the most scalable B2B model for an intelligence platform. It does not require the platform to own the fan relationship — it enables others (leagues, broadcasters, hospitality companies, sports brands) to leverage SIE's intelligence under their own identity. The schema is already built. The `WhiteLabelPartner` model was designed with this model in mind. The activation cost is low relative to the revenue potential.

**Impact:**
- The embed widget endpoint is Priority 1 in the commercial build queue
- Partner onboarding flow and CRUD API follow immediately after
- Plan tiers (starter/pro/enterprise) must be designed before the first partner conversation
- podiumSelect is the first named white-label deployment (see DEC-010)

**Revisit date:** After first paying white-label partner — validate pricing and tier assumptions

---

### DEC-006 — Sponsored Intelligence as Primary Direct Revenue Model

**Date:** 2026-06-19
**Status:** Confirmed — per SIE Constitution

**Decision:**
The platform's primary direct (non-B2B) revenue model is Sponsored Intelligence: brand sponsors are associated with specific intelligence metrics rather than with generic banner placements. Examples: "Clutch Index™ Presented by [Brand]", "Momentum Pulse™ Powered by [Brand]". This model is preferred over interstitial or banner advertising.

**Reason:**
Sponsored Intelligence aligns the sponsor's brand with a moment of insight rather than an interruption. It is more valuable to sponsors (brand association with intelligence, not noise), more valuable to users (contextual rather than disruptive), and more defensible as a product category. The `Sponsor` and `AdSlot` schema already support this model. The sponsorship activation path requires display components, not new architecture.

**Impact:**
- The Clutch Index™ is the leading candidate for the first sponsored metric (highest dramatic moment association)
- Ad slot placements should be defined around metric moments, not page locations
- The `SponsorTier` and `AdSlotPlacement` enums will need to be replaced with generic surface IDs in a post-launch migration (they currently encode World Cup vocabulary)
- Self-serve sponsor portal is a Phase 2 build; initial campaigns are manually onboarded

**Revisit date:** After first sponsored metric goes live — validate CPM/sponsorship fee model

---

### DEC-007 — Match → Event Migration Deferred to Post-Launch

**Date:** 2026-06-18
**Status:** Deferred — planned for post-tournament window

**Decision:**
The `Match` Prisma model will be renamed to `Event` and its shape will be generalised (replacing `homeTeam`/`awayTeam` with a `participants[]` join table). This migration is deferred until after the World Cup 2026 tournament concludes.

**Reason:**
`Match` appears in ~30 API routes, all four named metrics, the simulation engine, prediction markets, user predictions, and the sponsorship targeting layer. Migrating it during a live tournament carries unacceptable deployment risk. The benefits (multi-sport readiness) do not materialise until a second sport is onboarded, which also cannot happen during the live tournament. Deferring avoids risk with zero opportunity cost.

**Impact:**
- `Match` is grandfathered as a legacy name until migration
- New code must not add new routes, components, or fields that deepen the `Match`-specific coupling
- The migration is the first post-launch schema migration and the gate to multi-sport capability
- `Prediction.fixtureId` (which references the api-football fixture ID) must also migrate at the same time

**Revisit date:** First week post-tournament — scope the migration sprint

---

### DEC-008 — Player → Athlete Migration Deferred to Post-Launch

**Date:** 2026-06-18
**Status:** Deferred — planned for post-tournament window

**Decision:**
The `Player` Prisma model will be renamed to `Athlete`. Migration deferred to post-tournament.

**Reason:**
F1 drivers, Olympic sprinters, UFC fighters, and golfers are not "players." The term breaks immediately when SIE moves to its second sport. However, the migration surface is smaller than `Match → Event` (primarily squad displays, lineup pages, player stat routes, and the Clutch Index™ scorer rankings) and can proceed as part of the same post-launch migration sprint. Deferring avoids unnecessary risk during a live tournament.

**Impact:**
- `Player` is grandfathered until migration
- New features involving individual competitors should use `Athlete` in naming even while the underlying model is still `Player`
- The Clutch Index™ scorer display should be designed to accept a generic `Athlete` type

**Revisit date:** Same sprint as Match → Event migration

---

### DEC-009 — GoalEvent → MomentEvent Migration Identified as Highest-Value Product Migration

**Date:** 2026-06-19
**Status:** Deferred — planned for post-tournament window; interface to be defined beforehand

**Decision:**
The `GoalEvent` input type that powers all four Match DNA™ metrics will be replaced with a generic `MomentEvent` type. A `MomentEvent` represents any defining moment in any sport: a goal, an overtake, a birdie, a knockdown, a try, a basket. Migration deferred to post-tournament; the `MomentEvent` interface will be defined in documentation before implementation begins.

**Reason:**
All four named metrics (Momentum Pulse™, Strike Clock™, Score Volatility™, Clutch Index™) are built on `GoalEvent[]` only. This means the platform's most differentiated IP — the Match DNA™ system — is currently football-only. The SIE brand promise is cross-sport intelligence. Until `MomentEvent` replaces `GoalEvent`, that promise cannot be delivered for any other sport. Defining the interface in advance prevents the metric primitives from being redesigned reactively when the second sport arrives.

**Impact:**
- All four named metrics must be updated to accept `MomentEvent[]` at migration time
- The simulation engine must produce `MomentEvent[]` rather than goal events only
- New sports get their defining moments (overtakes, knockdowns, birdies) automatically powered by the existing metric engine
- The metric engine transitions from "Match DNA™" to "Event DNA™" (or retains the Match DNA™ brand with expanded scope — TBD)

**Revisit date:** When second sport adapter is being designed — the `MomentEvent` interface must be finalised before the adapter ships

---

### DEC-010 — AudioStream Designated as Universal Media Layer

**Date:** 2026-06-19
**Status:** Confirmed — Protected Architectural Asset

**Decision:**
The `AudioStream` model and its supporting infrastructure (global `AudioContext`, Vercel Blob storage, admin upload tooling, listen/share tracking) is designated the universal media layer for all audio content on the platform. All future audio use cases — AI commentary audio, race radio, match recaps, podcasts, daily briefings, athlete profiles — must route through `AudioStream`, not create parallel models.

**Reason:**
The anthem hub is the most complete and most reusable feature on the platform. The `AudioStream` model is sport-agnostic: `title`, `artistCredit`, `audioUrl`, `durationSecs`, `playCount`, `listenSeconds`, `shareClicks`. Only the "anthem" framing in naming is sport-specific. Building a separate model for commentary audio or race radio would fracture the media layer and duplicate tracking infrastructure. The global audio state (`AudioContext`) that persists across page navigations is a user experience asset — it should not be duplicated for different content types.

**Impact:**
- AI commentary audio (when implemented) will be an `AudioStream` record, not a new model
- Race radio for Formula 1 will be an `AudioStream` record
- The admin upload tooling extends to new content types, not new systems
- "Anthem" branding in the UI and model naming is a deferred rename (low risk, post-launch)

**Revisit date:** When audio volume significantly exceeds current use case — re-evaluate Vercel Blob cost model

---

### DEC-011 — LiveMetric Designated as Foundational Metric Layer

**Date:** 2026-06-19
**Status:** Confirmed — Protected Architectural Asset

**Decision:**
The `LiveMetric` model (`matchId`, `teamCode`, `metricType` [string], `value` [float], `recordedAt`) is designated the foundational metric storage layer for the SIE Metric Registry. All future SIE metric categories — Match Intelligence, Tournament Intelligence, Fan Intelligence, Performance Intelligence, Influence Intelligence, Commercial Intelligence — will be stored in `LiveMetric` records.

**Reason:**
`LiveMetric` is the cleanest SIE-native primitive in the codebase. The `metricType` field is a free string, not an enum — there is no sport coupling in the schema. Any metric that can be expressed as a numeric value at a point in time can be stored here without schema changes. The alternative — a separate model per metric category or per sport — would fragment the metric layer and make cross-sport analytics impossible. The existing `LiveMetric` rows are currently not consumed by a dedicated analytics UI, but the store is production-ready and being populated.

**Impact:**
- The Metric Registry (`007 - Metric Registry v1.md`) defines the `metricType` string vocabulary
- New metrics are new `metricType` values, not new models or tables
- A dedicated analytics UI must be built to surface `LiveMetric` data (currently none exists)
- The `teamCode` field will eventually need to become a generic `participantId` reference (post-tournament migration)

**Revisit date:** When `LiveMetric` row volume exceeds PostgreSQL query performance thresholds — evaluate time-series DB migration (InfluxDB, TimescaleDB)

---

### DEC-012 — podiumSelect Designated as Premium Concierge Deployment

**Date:** 2026-06-19
**Status:** Confirmed as deployment target — timeline TBD

**Decision:**
podiumSelect is designated as a premium concierge deployment of SIE. It is not a separate product — it is a `WhiteLabelPartner` deployment of SIE configured for high-value fans and corporate hospitality. It consumes Travel Intelligence, Hospitality Intelligence, White Label branding, Sponsored Intelligence, and the `AudioStream` media layer.

**Reason:**
Premium sports hospitality is a high-margin commercial segment. The platform already has the infrastructure primitives (travel matrix, VIP endpoint stub, white-label tenancy, audio, sponsorship) to power a premium experience. Building podiumSelect as a SIE deployment rather than a standalone product means it benefits from every platform improvement automatically. It also validates the white-label commercial model with an internally-owned reference deployment before the model is sold to external partners.

**Impact:**
- The Hospitality Intelligence Engine and Travel Intelligence Engine are not optional future layers — they are prerequisites for podiumSelect
- The `WhiteLabelPartner` model is the tenancy primitive for podiumSelect
- VIP suite data, live hotel inventory, and transport APIs must be integrated before podiumSelect can launch
- podiumSelect's requirements should inform the white-label v1 design

**Revisit date:** When white-label v1 is shipped — assess whether podiumSelect launches as the first external partner or the first internal deployment

---

### DEC-013 — Formula 1 Identified as Leading Second-Sport Candidate

**Date:** 2026-06-19
**Status:** Leading candidate — not yet confirmed

**Decision:**
Formula 1 is identified as the leading candidate for SIE's second sport adapter, ahead of Olympics, UEFA, NFL, PGA, and UFC.

**Reason:**
Formula 1 has the best publicly available data infrastructure of any major sport. OpenF1 is a free, real-time F1 telemetry and timing API with lap data, position data, driver data, and session data. This means the second sport adapter can be built without a paid API contract, reducing the commercial barrier to entry. F1 also has clear `MomentEvent` equivalents (overtake, fastest lap, pit stop, safety car) that map well to the Match DNA™ metric framework. The fan demographic (global, high-value, tech-savvy) overlaps well with the platform's positioning.

**Impact:**
- The `SportsDataSource` interface (to be formalised) should be designed against both the api-football adapter and a theoretical OpenF1 adapter
- The `MomentEvent` type (DEC-009) must include F1 moment types in its design
- The Event Simulator (Match Simulator → Event Simulator migration) must include a deterministic F1 fallback
- Naming: an F1 "race" is an `Event`; an F1 driver is an `Athlete`; the F1 `Competitor` is both driver and team

**Revisit date:** When `Match → Event` migration is complete and the second sport is formally prioritised — confirm F1 or select an alternative

---

### DEC-014 — Match.fixture Vendor ID Identified as Highest-Risk Schema Debt

**Date:** 2026-06-19
**Status:** Acknowledged — mitigation plan required

**Decision:**
The api-football fixture integer (`Match.fixture`) embedded as a unique constraint and as `Prediction.fixtureId` FK is formally acknowledged as the highest-risk technical debt item. An internal opaque event ID must be introduced before a second sport's data source is integrated.

**Reason:**
Every sport and every data source has a different ID space. If the platform's core event identifier remains a vendor-specific integer, every new sport onboarding requires either (a) shoehorning its IDs into the same integer field (collision risk), or (b) a separate model per sport (fragmentation). Neither is acceptable. An internal UUID or ULID as the primary event identifier, with an `external_refs` map for vendor IDs, is the standard pattern for multi-source platforms. This migration must happen before the second sport adapter ships — not after.

**Impact:**
- `Match.fixture` is frozen: no new features should reference it as a business key
- `Prediction.fixtureId` must migrate to the internal event ID at the same time as the `Match → Event` rename
- The internal event ID format (UUID vs. ULID vs. slug) is a Key Decision that must be resolved before implementation
- The `external_refs` map design must accommodate multiple vendor sources per event

**Revisit date:** When `Match → Event` migration is scoped — the identity migration must be included in the same sprint plan

---

### DEC-015 — Post-Tournament Migration Window Established

**Date:** 2026-06-19
**Status:** Confirmed

**Decision:**
All schema migrations, model renames, and broad refactoring work is deferred to the post-tournament migration window — beginning after the FIFA World Cup 2026 final. The live deployment is not modified for platform-generalization purposes during the tournament.

**Reason:**
The World Cup 2026 tournament is live. The platform is receiving real traffic. Schema migrations and broad code sweeps carry deployment risk that is unacceptable during a live event with no ability to pause or roll back without user impact. The generalization benefits (multi-sport readiness) do not materialise during the tournament itself — they are needed for future deployments. Deferring all migration work to the post-tournament window allows the team to focus on product quality and feature delivery during the tournament without incurring migration debt.

**Migrations in the post-tournament queue (in order):**
1. Introduce internal opaque event ID + `external_refs` map
2. `Match → Event` rename + `participants[]` join table
3. `Player → Athlete` rename
4. `GoalEvent → MomentEvent` abstraction
5. Match Simulator → Event Simulator plugin pattern
6. `SponsorTier` / `AdSlotPlacement` enums → generic surface IDs
7. `Team.groupStage` → generic `Stage`/`Phase` model
8. `Team.flagEmoji` / TLA → `badge`/`logo` + optional nationality

**Impact:**
- All migrations blocked until post-tournament
- Documentation and interface design (e.g., `MomentEvent` spec, `SportsDataSource` interface) can and should proceed during the tournament
- New code written during the tournament must not deepen existing coupling

**Revisit date:** First week after World Cup 2026 final — begin migration sprint planning

---

## Decision Index

| ID | Decision | Date | Status |
|---|---|---|---|
| DEC-001 | World Cup 2026 → Deployment #1 | 2026-06-18 | Confirmed |
| DEC-002 | Platform identity → SIE™ | 2026-06-18 | Confirmed |
| DEC-003 | SIE naming convention adopted | 2026-06-18 | Active standard |
| DEC-004 | Protected Architectural Assets designated | 2026-06-18 | Confirmed |
| DEC-005 | White-label-first commercial strategy | 2026-06-19 | Confirmed |
| DEC-006 | Sponsored Intelligence revenue model | 2026-06-19 | Confirmed |
| DEC-007 | Match → Event migration deferred | 2026-06-18 | Deferred |
| DEC-008 | Player → Athlete migration deferred | 2026-06-18 | Deferred |
| DEC-009 | GoalEvent → MomentEvent (highest-value migration) | 2026-06-19 | Deferred |
| DEC-010 | AudioStream → universal media layer | 2026-06-19 | Confirmed |
| DEC-011 | LiveMetric → foundational metric layer | 2026-06-19 | Confirmed |
| DEC-012 | podiumSelect → premium concierge deployment | 2026-06-19 | Confirmed |
| DEC-013 | Formula 1 → leading second-sport candidate | 2026-06-19 | Leading candidate |
| DEC-014 | Match.fixture vendor ID → highest-risk debt | 2026-06-19 | Acknowledged |
| DEC-015 | Post-tournament migration window established | 2026-06-19 | Confirmed |

---

*This log is a living document. New decisions should be added as DEC-016, DEC-017, etc. Decisions should not be deleted — only superseded (with a note referencing the superseding decision).*
