# SIE Migration Assessment — World Cup 2026 → Sports Intelligence Engine™

**Date:** 2026-06-18
**Author:** Engineering
**Status:** Assessment only — no code refactor performed
**Source directive:** `SIE_Identity__Naming_Convention.md`

---

## 0. Scope & Ground Rules

This document is an **assessment**, not an implementation. Per the directive:

- The World Cup 2026 deployment stays live and is **not** reset.
- No models, routes, or components are renamed or refactored as part of this document.
- Output is a classification of the current systems against the SIE target
  architecture, plus a sequenced recommendation (immediate vs. deferred).

**SIE target hierarchy:**
`Sport → Competition → Event → Venue → Team → Athlete → Hospitality → Travel → Sponsor → Metric`

**Naming principle:** prefer generic domain terms (`event`, `competition`, `sport`,
`team`, `athlete`) over deployment-specific ones (`world_cup_match`, `world_cup_group`).

---

## 1. Systems That Already Align With SIE ✅

These were built platform-first and need little or no change. They are the seams
to keep building on.

| System | Location | Why it aligns |
| --- | --- | --- |
| **White-label tenancy** | `WhiteLabelPartner` model | `embedKey`, `domain`, `planName`, `primaryColor`, per-org branding — this is already a multi-deployment platform primitive, not a World Cup feature. Strongest SIE-native asset. |
| **Versioned API namespace** | `src/app/api/v2/*` (`travel-matrix`, `vip/[venueId]`) | A `v2/` surface already exists; the venue/VIP routes are keyed by `venueId`, not by match. Good forward pattern. |
| **Generic live metrics** | `LiveMetric` (`metricType`, `value`, `recordedAt`) | Key/value/time shape maps directly to SIE **Metric**. Sport-agnostic as-is. |
| **Auth & identity** | `User`, `Account`, `Session`, `Role` (NextAuth) | Standard, sport-independent. |
| **Vendor adapter isolation** | `lib/footballData.ts`, `lib/kalshi.ts`, `lib/polymarket.ts` | External data sources are already isolated in their own modules rather than inlined — the right shape to sit behind a future data-source interface. |
| **Media/audio system** | `AudioStream`, `AudioContext`, `/api/audio/*` | Model is generic (title, url, duration, play/listen/share counters). Only the `teamId` FK and "anthem" framing are sport-flavored; the engine is reusable. |
| **Travel / hospitality / VIP** | `lib/travelMatrix.ts`, `lib/vipSimulator.ts`, `lib/teamHomeCoords.ts`, `/api/flight-*`, `/api/travel-stats`, `/api/v2/vip` | Maps cleanly onto SIE **Travel** + **Hospitality**. Already venue/coordinate driven. |
| **Sponsorship base** | `Sponsor` model (minus tier enum) | Core fields (`name`, `logoUrl`, `tier`, `active`, date window) are generic ad-platform fields. |
| **Infra** | `lib/prisma.ts`, `lib/cache.ts`, `lib/api.ts`, `lib/units.tsx`, `lib/flags.ts` | Cross-cutting, sport-neutral. |

---

## 2. Systems That Should Be Renamed (Target Names)

Rename = same concept, SIE-aligned label. **Deferred to post-launch** (see §6);
listed here as the target vocabulary so all *new* code can adopt it now.

| Current | SIE target | Notes |
| --- | --- | --- |
| `Match` (model) | `Event` | The central entity. Football "match" is one event type among F1 sessions, UFC bouts, PGA rounds. |
| `Player` (model) | `Athlete` | F1/PGA/UFC competitors aren't "players." |
| `Team` (model) | `Team` / `Competitor` | Keep `Team` for team sports; consider a `Competitor` supertype so an Athlete can also be a competition entrant (F1 driver, golfer). |
| `KalshiMarket` (model) | `PredictionMarket` | Named after a vendor; the concept is generic, the source is swappable. |
| `/api/matches/*` | `/api/events/*` | Route surface follows the model rename. |
| `/api/group-markets/[group]` | `/api/markets?stage=` | "group" is a football-group-stage concept. |
| Components: `components/match/`, `components/anthem/` | `components/event/`, `components/audio/` | Cosmetic; do with the model rename, not before. |
| `homeTeam`/`awayTeam`, `homeScore`/`awayScore` | `participants[]` + `scoreline` | See §3 — this is renaming **and** generalizing. |

---

## 3. Systems That Should Be Generalized

Generalize = the shape itself is too narrow for multi-sport, beyond a rename.

| System | Current shape | Why it's too narrow | Target shape |
| --- | --- | --- | --- |
| **Event participants** | `Match.homeTeam` / `awayTeam` (exactly 2) | F1 (20 cars), PGA (field), Olympics (heats) aren't 2-sided. | `participants[]` join table (Event ↔ Competitor, with role/seed/lane). |
| **Scoreline** | `homeScore` / `awayScore` / `elapsed` (minute) | Assumes 2 scores + a 0–90 clock. F1 = positions/laps, UFC = rounds, PGA = strokes. | Flexible `result`/`scoreline` (JSON or typed-per-sport) + a generic `periodClock`. |
| **Outcome model** | `probabilities.ts`: home/draw/away (3-way) | Hardwires football's draw-inclusive 3-outcome market. | Strategy interface per sport (`OutcomeModel`) returning N outcomes. |
| **Match simulation** | `lib/simulation.ts` (`possession`, `shots`, `corners`, `fouls`, `cards`; hardcoded `MEX`/`RSA` base) | Pure football, with two team codes baked in. | Per-sport `EventSimulator` plugin; football becomes one implementation. |
| **Signature metric engine** | `MatchDNA` + Momentum Pulse™ / Strike Clock™ / Score Volatility™ / Clutch Index™ | Built entirely on `GoalEvent[]`. This is the *actual product* ("Intelligence Engine"), so its football-coupling is the highest-value thing to generalize. | Event-agnostic `MomentEvent[]` (goal, overtake, knockdown, birdie…) feeding the same visual primitives. |
| **Sponsorship targeting** | `SponsorTier` (`MATCH`/`GROUP`/`ANTHEM`), `AdSlotPlacement` (`MATCH_DETAIL`/`STANDINGS`/`ANTHEMS`), `AdSlot.groupCode` | Enum values encode World-Cup surfaces. | Placement keyed by generic surface ids + sport/competition scoping instead of `groupCode`. |
| **Standings / groups** | `Team.groupStage`, `/api/standings`, `GroupWinnerTickers`, `/api/group-markets/[group]` | "Group stage" is a football-tournament format. | Generic `Stage`/`Phase` belonging to a `Competition` (round-robin, bracket, ladder, grid). |
| **Team identity** | `Team.flagEmoji`, `Team.code` (3-letter TLA), `LiveMetric.teamCode` | Nation flags + TLA are international-football conventions. | `logo`/`badge` asset + opaque `slug`/`id`; nationality becomes optional metadata. |

---

## 4. World-Cup-Specific Items → Future Technical Debt ⚠️

These will actively resist multi-sport reuse if left unaddressed. Ranked by risk.

1. **`Match.fixture` (Int, api-football fixture id)** and **`Prediction.fixtureId`**
   — A vendor's primary key is embedded as a core identifier and a unique
   constraint. Highest-risk coupling: every other sport/source needs a different
   id space. Future: internal opaque event id + a separate `external_refs` map.
2. **2-participant assumption** baked through `Match`, `LiveMatchCard`,
   `MatchDNA`, probabilities, and simulation — pervasive, so the most expensive
   to unwind later. Flag now, contain by not spreading it into new code.
3. **Football outcome math** (`home/draw/away`) in `probabilities.ts` and the
   Kalshi/Polymarket wiring — assumes draw-inclusive markets.
4. **Goal-centric metric IP** (`GoalEvent`, Match DNA family) — the brand
   ("Sports Intelligence Engine") promises cross-sport intelligence the current
   engine can't yet express.
5. **Enum-encoded surfaces** (`SponsorTier`, `AdSlotPlacement`) — schema-level
   World-Cup vocabulary; changing enums later is a migration, not an edit.
6. **`groupStage` / group routes / standings** — single tournament format.
7. **Nation-flag identity** (`flagEmoji`, TLA codes) — breaks for club, F1, golf.
8. **"Anthem" framing** across `AudioStream`, admin routes, ad tiers — minor;
   the underlying media system is fine, only the naming is sport-flavored.

---

## 5. Changes To Make Immediately (No Refactor, Low Risk)

These are safe now because they are naming/convention/scaffolding — they do not
touch the running data model or break the live deployment.

1. **Adopt the SIE name in non-code surfaces:** `README.md`, `docs/`, internal
   labels, PR/branch naming. (This document is step one.)
2. **Ratify the naming convention as a written standard** so every *new* table,
   route, and component uses the `Sport → Competition → Event → …` vocabulary.
   Add it as an ADR / `CONTRIBUTING` note. New code stops creating debt.
3. **Freeze World-Cup-specific naming in new code:** no new `*_match`,
   `*_group`, `*_world_cup`, `fixture`-keyed, or 2-participant-assuming
   structures unless unavoidable; document the exception when it is.
4. **Introduce forward-compatible type aliases only** (zero runtime change),
   e.g. `Event = Match`, `Athlete = Player`, `Competitor = Team`, so new code can
   import SIE names while the tables stay put. Pure aliasing — no migration.
5. **Keep building on the existing platform seams** (`WhiteLabelPartner`, the
   `v2/` namespace, `LiveMetric`, vendor adapters) rather than adding parallel
   World-Cup-only ones.
6. **Define the data-source interface** for new integrations (a thin
   `SportsDataSource` type that `footballData`/`kalshi`/`polymarket` already
   informally satisfy) — applies to new adapters only, existing ones untouched.

---

## 6. Changes To Defer Until After Launch (Migration / Refactor)

These require schema migrations, data backfill, or broad code edits — they carry
deployment risk and must wait until after the World Cup window.

1. **Model renames** `Match→Event`, `Player→Athlete`, `KalshiMarket→PredictionMarket`,
   `Team→Competitor` supertype — each is a Prisma migration + code sweep.
2. **Introduce real `Sport` and `Competition` entities** and FK
   `Event → Competition → Sport`.
3. **Generalize event shape:** `participants[]` join + flexible `scoreline` /
   `periodClock`, replacing `homeTeam/awayTeam/homeScore/awayScore/elapsed`.
4. **Abstract simulation & probability** behind per-sport strategy plugins;
   refactor football logic into one implementation.
5. **Generalize the Match DNA metric engine** to event-agnostic `MomentEvent[]`.
6. **Replace enum-encoded sponsor/ad surfaces** with generic placement ids +
   sport/competition scoping; migrate `groupCode` targeting.
7. **De-vendor the identifier space:** internal event id + `external_refs`,
   retiring `fixture`/`fixtureId` as the primary key.
8. **Generalize team identity:** `badge`/`logo` asset + optional nationality,
   retiring `flagEmoji`/TLA as required fields.
9. **Replace group/standings** with a generic `Stage`/`Phase` model supporting
   multiple competition formats.

---

## 7. Summary

The platform is **further along than its name suggests**. The tenancy layer
(`WhiteLabelPartner`), versioned API (`v2/`), generic metric store
(`LiveMetric`), and isolated vendor adapters are already SIE-shaped. The debt is
concentrated in four places: the **2-participant event model**, the
**vendor-keyed identifiers** (`fixture`), the **football-only outcome/simulation
math**, and the **goal-centric metric IP**.

**Recommended posture:** adopt the SIE *name and conventions immediately* (§5) so
no new debt accrues, and **defer every schema/refactor item until after the World
Cup launch** (§6). World Cup 2026 ships as Deployment #1 on its current
foundation; the generalization happens in the post-launch window, against this
map.
