# podiumMetrics – Leagues Cup 2026 (LC26) — Build Plan

**Owner:** BK · **Drafted:** 2026-07-22 (overnight, autonomous) · **Kickoff:** Aug 4, 2026
**Status:** scaffolding + specs; data-wiring blocked on the api-football league id + deployment-topology call.

LC26 is **the same sport (soccer / api-football) as WC26 — a new INSTANCE, not a fork**
(`docs/roadmap-nextbuilds.md` §4, `docs/extraction-plan.md`). It's an MLS × Liga MX
**club** tournament (group/league phase → knockout). The build is: push the World-Cup-isms
down into config, flip the nation-specific features to club-specific, and layer the six
owner refinements below.

---

## The gating blockers (only BK can clear)

1. **api-football Leagues Cup league id + 2026 coverage.** Dashboard → Ids → Leagues →
   "Leagues Cup" → note the numeric id; confirm the 2026 season shows fixtures/events
   coverage on our plan. (Or hit the admin `debug/football` route with `/leagues?search=Leagues Cup`.)
   *Everything that touches real data wires to this number.*
2. **Deployment topology.** CC recommends a **new deployment** — own Neon DB + subdomain
   (e.g. `leaguescup.studio0x.io`), like podiumSchedule — keeping WC26 live as a reference.
   Fallback: re-point the existing app (faster, but WC26 goes away + club/nation data
   collides). Awaiting BK's call.

Neither blocks the CODE below — the config plumbing and feature scaffolds are behavior-
preserving for WC26 and ship as draft PRs.

---

## The six owner notes → specs

### 1. Club anthems (not national anthems)
- Anthems module **stays**, repurposed from national → **club songs**. BK has an Inter
  Miami song and will make more in Suno.
- **Work:** manifest becomes **club-keyed** (`anthemManifest` → club code/slug + Drive
  file id + exact title). No path may ever write a placeholder (carries the CR-1 fix).
  Add a `tournament`/`kind` field so WC26 (national) and LC26 (club) manifests coexist.
- **BK provides:** Suno songs + Drive file ids per club.

### 2. Travel stats → **teams & support staff** (not fan origin)
- WC26's Travel Pulse mapped *fan origin*. LC26 reframes to **team + support-staff travel**
  between MLS/Liga MX host cities (club tournament = teams criss-cross the continent).
- **Work:** new data shape (club home city → match city legs), distance/trips "to date"
  progress-aware (reuse WC26's progress-aware totals pattern). Nation/fan-origin code
  gated off behind the sportConfig flag.

### 3. **National-team stats from club players**, vs WC (the inversion)
- WC26: national players → club narrative (Club WC Impact™). LC26 **flips it**: aggregate
  each club's players **by nationality** into national-team-style boards, then **diff vs
  the player's / nation's WC26 baseline**.
- **Examples:** "Argentina's players across LC26 clubs: 6 G / 4 A — vs 8 G at WC26."
  Per-player carryover: "Messi LC26 vs WC26 form delta."
- **Data we already have:** WC26 player→nation map (squads), WC26 goal-event stats in DB.
- **Needs:** LC26 club rosters (seed) + the cross-tournament join. This is the deferred
  "cross-tournament comparisons" backlog item, now with a concrete use case.

### 4. Roundtable **live radio play-by-play** (auto-launch audio)
- Today: gapless prefetch, **user-triggered**. LC26: **auto-launch each line's audio in
  sequence during a live match**, so it plays like radio play-by-play.
- **Work (frontend):** an autoplay "broadcast mode" on the live Roundtable — queue new
  lines as they generate, auto-advance through the custom-voice audio, respect the
  browser autoplay-gesture rule (one tap to "Go live", then hands-free), pause/mute
  control, and a "catch up to live" affordance. Grounding + labeling unchanged (booth
  banter stays labeled, never invents action). Bumps nothing in the TTS truth model.

### 5. News stories **build up** (retro + forward)
- The **News Depot** thesis (roadmap §1): stories accumulate over time — backfill LC26's
  early rounds retrospectively AND generate forward each matchday. Deterministic archive
  ids (idempotent), export API (md/json), grounded prompts (CONTENT TRUTH).
- **Work:** point the existing story/archive/export surfaces at LC26's config; the
  build-up is the archive growing per matchday (WC26 already proved the pattern —
  103 recaps + 34 round-ups backfilled).

### 6. New **™ metrics** (proposals — BK approves/edits)
Club, cross-border, and cross-tournament flavored. Same gold-badge design language,
sport-specific math. **CONTENT TRUTH:** every metric computes from real feed/DB data only.

| Proposed ™ | What it measures | Rough formula (draft) |
|---|---|---|
| **Border Clash Index™** | MLS-vs-Liga-MX dominance in a match/round | (cross-league goal diff + result weight), normalized 0–100 |
| **Cross-Border Pedigree™** | a club's roster strength by players' WC/national pedigree | Σ(player WC minutes×w1 + WC goals×w2 + caps×w3) |
| **WC Carryover™** | a player's LC26 form indexed to their WC26 baseline | (LC26 per-90 output ÷ WC26 per-90 output) → "arriving hot/cold" |
| **National Mirror™** | a nation's LC26 club-player output vs its WC26 output | Σ nation LC26 (G,A,rating) vs Σ WC26, delta bars |
| **Rivalry Heat™** | intensity of a specific MLS↔LigaMX matchup | fouls/cards/lead-changes + cross-league flag multiplier |
| **Summit Path™** | knockout survival difficulty | remaining-opponent strength × bracket depth |

Match-generic WC26 metrics that **carry over unchanged**: Match DNA™, Goal Gravity™,
Clutch Index™, Strike Clock™, Score Volatility™, Momentum Pulse™, Upset Factor™,
Golden Boot / Playmakers / Clutch boards.

---

## Foundation being built tonight (safe, behavior-preserving for WC26)

- **Phase 1 constants→config** (`lib/sportConfig.ts`): `league`/`season`/`eventName`/
  `siteUrl`/entity-kind (nation|club)/feature flags (anthems, travelMode, boards-mode)
  → one object per deployment; **WC26 stays the default**, so prod is unchanged.
- **LC26 sportConfig instance** (id TBD — placeholder until BK confirms) + club-anthem
  manifest scaffold.
- Feature scaffolds (#2–#6) behind the sportConfig flags, **off for WC26**.

## What waits for BK
- League id + coverage (blocker #1) → wires all real data.
- Deployment topology (blocker #2) → new Vercel project + Neon DB + subdomain vs re-point.
- Suno club songs + Drive ids (note #1).
- Approve/edit the six ™ metrics (note #6).

*Nothing here is merged to the live WC26 app overnight; all work lands as draft PRs for
morning review. Hot-path (live-merge) changes stay for supervised daylight per the
postmortem.*
