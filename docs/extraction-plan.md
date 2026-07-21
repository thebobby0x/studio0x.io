# sportOS Core Extraction Plan — from WC26 monolith to white-label template (2026-07-20)

Goal: turn `worldcup/frontend` (the proven WC26 build) into a **sport-agnostic
core** that F1 Wrapped, WWC27, Leagues Cup 2026, and every future deployment
consume — **without a big-bang rewrite**. We rewrite each subsystem ONCE,
cleanly, keeping all the incident-hardened knowledge. This is the "strangler
fig" pattern: the running product keeps serving while modules are replaced, and
every step is shippable and verifiable.

Owner decision (7/20): NOT a from-scratch rebuild (throws away the scar tissue
from two quota crises + a live final). NOT endless patching either. **Structured
module-by-module rewrite**, informed by the 4-lens postmortem
(`docs/postmortem-2026-07-20.md`) and driven by F1's concrete needs.

---

## The core thesis

There are three layers:

- **Shared core (sport-agnostic):** auth, design tokens/nav/theme, the AI
  commentary + TTS pipeline, the Roundtable persona engine, the caching layer,
  the story/news engine, admin, share. ~60% of the code is already here or a
  small extraction away.
- **Sport adapter (per deployment):** the data feed (api-football for soccer;
  Jolpica/OpenF1 for F1), the "competition shape" (what a fixture is, how many
  entrants, the knockout/points structure), the entity model (teams vs
  drivers+constructors), and the metric definitions.
- **Deployment config (per instance):** league/season ids, event name, dates,
  URLs, branding.

The extraction is: **push everything sport-specific down into the adapter +
config, leave the core clean.** The postmortem already found the seams — the
sport-isms are mostly hardcoded constants copy-pasted 3–6×.

---

## Phase 0 — Freeze a clean WC26 baseline (DONE / in progress tonight)

Before extracting, the source must be true. Tonight's autonomous batch:
- Data sweep: all 104 matches' goals attributed (Golden Boot complete), 0-0s
  distinguished from no-data. (Squads + club enrichment await an owner click —
  SUPER_ADMIN-session-gated.)
- Security: CR-2/CR-3/M-1..3 closed (the incident-response debug params + TTS
  wallet/poisoning).
- Truth: CR-1 anthems (no more SoundHelix), H-1/5/6/7 data-integrity.

Deferred to supervised daylight (live-merge hot path — high regression risk,
no live match to protect now): **H-3** (VAR score-down / no blind max-merge) and
**H-4** (DB-FT promotion). Do these first thing in Phase 1 with eyes on.

## Phase 1 — Constants → config (small effort, unblocks everything)

The single highest-leverage step. From the audit:
- `STATUS_MAP` (defined **6×, already diverged**) → one exported map in a new
  `lib/feed/apiFootball.ts` adapter.
- `TEAM_GROUPS` (3×), stale-LIVE 4h guard (3×), kickoff-window clamp (2×,
  must-stay-identical-or-the-quota-guard-fails) → `lib/tournament.ts`.
- `league=1` / `season=2026` (3 files) → **`lib/sportConfig.ts`**:
  `{ sport, feedProvider, leagueId, season, eventName, siteUrl }`, one object per
  deployment, injected into every feed call.
- Hardcoded `worldcup-2026-sandy.vercel.app` (6×) → `NEXT_PUBLIC_SITE_URL`.

Output: a deployment's sport identity lives in ONE file. This is the moment the
codebase stops being "the World Cup app."

## Phase 2 — Shared libs (dedupe the copy-paste, kill the bandaids)

- `lib/textHash.ts` (2×, the TTS-key fn), `lib/aiJson.ts` (`parseStory` 2×),
  `dramaLabel` (2×, **diverged into a bug**), `stageContext` (2×) → shared.
- `lib/personas.ts` — the Roundtable cast (`SPEAKERS` + persona briefs),
  currently written out 3–4× across roundtable/commentary routes + two
  components. This is a **prime module** (the podiumNews/Arcade cast) — for a
  non-soccer skin the whole cast reconfigures.
- Adopt the already-written-but-unused `lib/cache.ts InMemoryCache` (~10
  bespoke caches today) with a `staleWhileError` accessor.
- **Anthem module rewrite** (owner-flagged): make it a single-source,
  manifest-owned, feature-flagged optional module (not core) — tonight's CR-1
  fix is step one; the full extraction folds seed/manifest/batch-anthem/relink
  into one coherent `modules/anthems/` with no path that can write a placeholder.

## Phase 3 — Type boundaries (stop silent corruption)

- zod schemas for the JSON columns (`goalEvents`, roundtable `lines`/`itFactor`)
  parsed at every read; replace the `as unknown as` casts. The boards
  `asEventArray` shim exists precisely because writers disagreed — make the
  schema the contract.
- Fix `|| 0` numeric fallbacks in ingest (a malformed rating became a real "0").

## Phase 4 — The sport-adapter interface (enables F1)

Define the interfaces the core depends on, implement `worldcup` against them,
then implement `f1`:
- `FeedAdapter`: `getFixtures()`, `getLiveState(id)`, `getEvents(id)`,
  `getEntrantStats(id)` → soccer=api-football, F1=Jolpica/OpenF1.
- `CompetitionShape`: what a "fixture" is (a match vs a race weekend:
  practice/quali/race), entrant model (Team vs Driver+Constructor), result
  model (goals vs positions/points), knockout/standings structure.
- `MetricSet`: the proprietary metrics are defined per sport (Match DNA™ →
  a race's "Overtake DNA"; Golden Boot → "Points Leader"/"Pole count").

`lib/tournament.ts` becomes `TournamentShape` implementations per deployment.
The `104`/`48`/`12` literals derive from the shape, not constants.

## Phase 5 — Consistency + dead code + component splits

- `force-dynamic` on the live-data GETs (`schedule` is missing it), a
  `lib/apiResponse.ts` error helper.
- Delete: `AdBanner`, unused `InMemoryCache` (or adopt), `batch-import-anthems`,
  `sync-statuses`, fan/comedian remnants, and stop compiling the
  `wc2026studio0x` secret into the client bundle (use the SUPER_ADMIN cookie
  path; confirm `SEED_SECRET` set).
- Split `page.tsx` (942 lines; calls the schedule route handler in-process — an
  anti-pattern vs the no-cross-module-imports rule) — do this LAST.

---

## How F1 Wrapped proves the extraction

F1 cannot be built on `league=1, season=2026, 48 teams, 12 groups, Round-of-32`.
Building it is the **forcing function** that validates the sport-adapter:
- Data: **no api-football** — Jolpica/OpenF1. podiumSchedule already syncs
  F1 2026 via Jolpica, so the path exists.
- Shape: a race *weekend* (FP1-3 / quali / sprint / race), 20 drivers + 10
  constructors, points + positions, no knockout bracket.
- Metrics: reimagine the proprietary set for racing (Overtake DNA, Tyre-Gamble
  Index, Qualifying Gap, Points Momentum) — same "gold-badge proprietary metric"
  design language, sport-specific math.
- Personas: the Roundtable cast can carry over (F1 pundits) or reconfigure — the
  `lib/personas.ts` extraction makes either trivial.

When F1 runs on the extracted core, WC26 gets re-pointed at the same core for
free, and the white-label thesis is validated end to end.

---

## Sequencing (owner-approvable)

1. Phase 0 (tonight) + H-3/H-4 supervised (first daylight task).
2. Phase 1 constants→config (small, huge leverage).
3. Phase 2 shared libs + anthem module rewrite.
4. Phase 4 sport-adapter interface, in parallel with the F1 data spike.
5. **F1 Wrapped build** on the new core.
6. Phase 3 type boundaries + Phase 5 consistency/dead-code/splits as continuous
   cleanup alongside.

Nothing here is a big-bang. Every phase ships and is verifiable. The engine we
trust keeps running throughout.
