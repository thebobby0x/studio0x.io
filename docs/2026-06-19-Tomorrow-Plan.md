# 2026-06-19 — Tomorrow Plan

**Prepared:** End of day 2026-06-19
**Scope:** Architecture, documentation, and strategic planning — no coding tasks
**Inputs:** Current-State-Assessment.md, SIE-Architecture-Planning-Extract.md, 002 - SIE Constitution.md, 003 - Architecture Seed.md

---

## Top 10 Priorities

### 1. Merge PR #42 to Main
**Why first:** Everything else builds on these documents being canonical. Until they're in `main`, the baseline is a branch, not a fact.
**Action:** Mark PR #42 as ready (remove draft), merge to main. This closes the documentation sprint and makes all six documents discoverable by future sessions without branch context.
**Dependencies:** None. CI is green. Preview is live.
**Revenue / strategic:** Foundational — all commercial work depends on shared understanding of what exists.

---

### 2. Define the SIE Naming Convention as Enforceable Standard
**Why:** Every day this isn't formalised, new code can create new World Cup-specific naming that becomes migration debt. The Constitution and Architecture Seed both name this as an immediate action.
**Action:** Create `CONTRIBUTING.md` or an ADR in `docs/` that explicitly states:
- All new models use: `Event`, `Athlete`, `Competitor`
- All new routes use: `/api/events/`, `/api/athletes/`
- All new components use: `components/event/`, `components/audio/`
- Deviation requires documented exception
**Dependencies:** PR #42 merged first so the Architecture Seed is canonical reference.
**Strategic:** Prevents compounding debt between now and the post-launch migration window.

---

### 3. Sponsorship Activation Design
**Why:** The sponsorship schema is complete. Impression counters, click counters, match-level and group-level targeting — all modelled. Revenue is $0 on a working foundation. Match-day inventory is being lost.
**Action:** Define the activation design (not implementation):
- What does an ad slot look like in production? (placement, format, fallback if no sponsor)
- What is the sponsor onboarding flow? (admin creates sponsor → creates slot → slot goes live)
- Which placements launch first? Recommend: `HOME_HERO` + `MATCH_DETAIL` for immediate visibility
- What counts as an impression? (page load vs. viewport entry)
- What is the first sponsored metric? (Clutch Index™ Presented by X is the Constitution's preferred model)
**Output:** Document: `004 - Sponsorship Activation Plan.md`
**Revenue:** Highest near-term revenue path on the platform.

---

### 4. White-Label v1 Interface Design
**Why:** `WhiteLabelPartner` schema is production-ready. The runtime layer is the missing commercial product. The faster this is designed, the faster it ships.
**Action:** Define the white-label v1 scope (not implementation):
- What does the embed widget do? (iframe? JS snippet? both?)
- What does `primaryColor` injection look like? (CSS variables in `<head>`? Tailwind theme? Runtime stylesheet?)
- What is the partner onboarding flow? (admin creates partner → `embedKey` generated → partner receives snippet)
- What is the minimum viable partner experience? (one sport, one embed, one colour, one logo)
- What does `planName: "starter"` grant vs. `"pro"`?
**Output:** Document: `005 - White Label v1 Design.md`
**Revenue:** Highest B2B revenue path. Foundation for podiumSelect.

---

### 5. Commentary Strategy Document
**Why:** The Constitution designates commentary as a strategic capability with future modes (Broadcast, Analyst, Concierge, Fan, Executive Briefing, Multilingual, Audio). The current system is on-demand text with no caching and no streaming — functional but not scalable.
**Action:** Define the commentary evolution path:
- Near-term: caching strategy (TTL per match state vs. per persona?) and streaming design (SSE vs. WebSocket?)
- Medium-term: multi-sport prompt configuration (how does the analyst persona change for F1 vs. football?)
- Long-term: audio commentary (does `AudioStream` carry AI commentary? what is the text-to-speech provider strategy?)
- What triggers re-generation? (goal scored? match state change? user refresh?)
**Output:** Document: `006 - Commentary Strategy.md`
**Strategic:** Commentary is the most visible AI capability. Getting the architecture right avoids expensive rewrites.

---

### 6. Metric Registry — First Pass
**Why:** The Constitution defines six metric categories (Match, Tournament, Fan, Performance, Influence, Commercial) with named metrics in each. No formal registry exists. `LiveMetric` is the storage layer — the registry defines what goes in it.
**Action:** Create a first-pass metric registry:
- For each metric named in the Constitution, document: name, category, inputs required, output type, visualisation type, sponsorable? (yes/no), sport-agnostic? (yes/no)
- Identify which metrics are already implemented vs. planned
- Identify which metrics require the `MomentEvent` abstraction before they can be built
- Flag which metrics are highest-priority for the next sport adapter
**Output:** Document: `007 - Metric Registry v1.md`
**Strategic:** The registry is required before the Module Library can be written. It defines what the Intelligence Layer builds toward.

---

### 7. Internal Event ID Design
**Why:** `Match.fixture` (api-football vendor integer) is the highest-risk architectural debt. Every multi-sport expansion is blocked until an internal opaque event ID is introduced. This must be designed before implementation so the migration is deliberate, not reactive.
**Action:** Define the design (not the migration):
- What is the internal event ID format? (UUID? ULID? human-readable slug?)
- Where does it live in the schema? (new field alongside `fixture`? replaces it?)
- How does `external_refs` work? (JSON map of `{source: id}` pairs?)
- What happens to `Prediction.fixtureId`? (must migrate to internal ID)
- When does this migration happen? (immediately post-tournament? before second sport?)
**Output:** Section in `003-Architecture-Seed.md` or new `ADR-001-Event-Identity.md`
**Dependencies:** Should inform the timing of the `Match → Event` migration.

---

### 8. MomentEvent Interface Definition
**Why:** All four named Match DNA™ metrics are blocked from cross-sport use until `GoalEvent` is replaced with `MomentEvent`. This is the single highest-value Intelligence Layer upgrade. Defining the interface now means it can be implemented as soon as the post-tournament window opens.
**Action:** Define the `MomentEvent` interface at a conceptual level:
- What fields are universal? (minute/timestamp, team/participant, player/athlete, moment type)
- What fields are sport-specific? (detail, penalty flag, own-goal flag → football; position gained → F1; round → UFC)
- How do the four metrics map to `MomentEvent`? (Momentum Pulse at each checkpoint; Strike Clock timing; Volatility on lead changes; Clutch Index on game-state-changing moments)
- What is the moment type taxonomy? (goal, overtake, birdie, knockdown, try, basket…)
**Output:** Section in Architecture Seed or new `ADR-002-MomentEvent.md`
**Strategic:** Gates the brand's cross-sport promise.

---

### 9. Data Source Library — First Pass
**Why:** The Master Deliverables Index lists `006 - Data Sources & APIs` as a Phase 3 document. A first-pass library would document all current and planned data sources, their adapter status, and their sport coverage — critical context for any second-sport onboarding decision.
**Action:** Create:
- Current adapters: api-football, Kalshi, Polymarket, Anthropic, OpenSky, Suno AI — document status, auth model, rate limits, caching strategy, fallback
- Planned adapters: F1 data source candidates, UEFA API candidates, OpenF1 (public F1 API), Ergast (historical F1), official sports federation APIs
- Adapter interface spec: formalise the `SportsDataSource` interface the Constitution requires
**Output:** Document: `006 - Data Source Library v1.md`
**Dependencies:** Informs which second sport is easiest to onboard (best public API availability).

---

### 10. podiumSelect Integration Scope
**Why:** podiumSelect is named in the Constitution as a "Premium Concierge Deployment" of SIE. It sits at the intersection of Travel Intelligence, Hospitality Intelligence, and White Label. Defining its scope early prevents the white-label and hospitality layers from being designed without it in mind.
**Action:** Define the scope (not the product):
- What does podiumSelect consume from the platform? (VIP suite data, travel matrix, event schedule, anthem media, sponsorship placements)
- What is the tenancy model? (one `WhiteLabelPartner` record? multiple?)
- What are the first five features a podiumSelect user experiences?
- What data gaps must be filled before podiumSelect can launch? (real VIP suite data, live hotel inventory, transport APIs)
**Output:** Section in Architecture Seed or new `008 - podiumSelect Scope.md`
**Strategic:** Defines the premium commercial ceiling of the platform.

---

## Key Decisions Needed

| Decision | Why It's Blocking |
|---|---|
| **Embed widget format: iframe vs. JS snippet vs. both** | Determines the white-label v1 technical design entirely. Different security models, different theming approaches. |
| **First sponsored metric: which one?** | The Constitution's "Sponsored Intelligence" model requires choosing which metric gets its first brand partner. Clutch Index™ is the strongest candidate. |
| **Commentary re-generation trigger** | Without a defined trigger (user action vs. match state change vs. TTL), caching cannot be designed. |
| **Internal event ID format** | UUID vs. ULID vs. slug affects how events are referenced in URLs, analytics, and external integrations. |
| **Second sport target** | Which sport after football? The answer determines which data source adapters to prioritise. Formula 1 has the best public API (OpenF1). Olympics has the widest audience. Clarity here focuses the adapter library work. |
| **podiumSelect timeline** | Is podiumSelect a 2026 product or a 2027 product? The answer determines whether hospitality/travel intelligence is near-term or deferred. |

---

## Recommended Documents To Create

Listed in creation priority:

| # | Document | Phase | Depends On |
|---|---|---|---|
| `004 - Sponsorship Activation Plan.md` | This week | PR #42 merged |
| `005 - White Label v1 Design.md` | This week | PR #42 merged |
| `006 - Data Source Library v1.md` | This week | Architecture Seed |
| `007 - Metric Registry v1.md` | This week | SIE Constitution (metric categories) |
| `006 - Commentary Strategy.md` | Next week | Metric Registry |
| `ADR-001 - Event Identity.md` | Next week | Architecture Seed |
| `ADR-002 - MomentEvent.md` | Next week | Metric Registry |
| `008 - podiumSelect Scope.md` | Next week | White Label v1 Design |
| `009 - Module Library v1.md` | Phase 2 | All above |
| `010 - Execution Roadmap v1.md` | Phase 2 | All above |

---

## Risks To Monitor

| Risk | Status | Watch For |
|---|---|---|
| **Goals simulation fallback** | Unverified | Match DNA invisible on seeded matches if fallback is missing. Check before Matchday 2. |
| **Missing team anthems** | Content gap | Teams with "coming soon" on Matchday 2 create visible product gaps. |
| **AI commentary cost at match-day scale** | Growing | No caching = every page load = API call. Costs accelerate with traffic. |
| **Naming drift in new code** | Active | Without an enforced convention, every sprint adds migration debt. |
| **White-label commercial window** | Narrowing | World Cup is live now. Potential partners are watching. Delay shrinks the Deployment #1 case study. |
| **`Match.fixture` debt spreading** | Active | Any new feature that references `fixture` deepens the migration cost. Freeze `fixture` usage in new code. |

---

## Opportunities To Pursue

| Opportunity | Timing | Why Now |
|---|---|---|
| **First sponsor conversation** | This week | Schema is ready. Having a live partner in place before knockouts adds credibility to the platform. |
| **Announce SIE brand** | This week | The platform has a new identity. A brief announcement (social, newsletter, partner email) signals the pivot. |
| **F1 data source evaluation** | This week | OpenF1 is a free public F1 API. Evaluating it now means the second sport adapter design is informed by reality. |
| **Metric sponsorship pitch** | Next week | "Clutch Index™ Presented by [Brand]" is a concrete sponsorship product that can be pitched before the Metric Registry is even finished. |
| **podiumSelect waitlist** | Next week | A landing page and waitlist for podiumSelect premium concierge costs nothing and validates demand. |
| **Commentary audio pilot** | Next week | ElevenLabs or similar for text-to-speech on commentary lines. Routes into existing AudioStream. Could be a differentiating feature for the knockouts. |

---

## Success Criteria For Tomorrow

Tomorrow is successful if:

- [ ] PR #42 is merged to main — the documentation baseline is canonical
- [ ] `CONTRIBUTING.md` or naming ADR exists and is committed — the convention freeze is enforceable
- [ ] `004 - Sponsorship Activation Plan.md` is drafted — the first revenue path has a design
- [ ] `005 - White Label v1 Design.md` is drafted — the first B2B product has a design
- [ ] `007 - Metric Registry v1.md` is started — the intelligence layer has a defined target
- [ ] Goals simulation fallback is confirmed intact — Match DNA is reliable for Matchday 2
- [ ] The second sport decision is at least framed — the platform's next expansion target is named

A secondary success: at least one of the Key Decisions above is resolved and documented.

---

*Tomorrow Plan prepared 2026-06-19. Review at start of next session.*
