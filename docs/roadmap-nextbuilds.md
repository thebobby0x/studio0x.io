# sportOS — Next Builds Roadmap (owner decisions 2026-07-20)

Post-WC26. The engine is proven; now we widen. Owner priorities, in order:

## 0. Foundation (must precede the new verticals)
- **Core extraction** — `docs/extraction-plan.md`. F1 forces it; everything
  below rides on it. Don't fork the WC26 monolith N times.
- **WC26 hardening** — `docs/postmortem-2026-07-20.md`. Land the CRITICAL/HIGH
  fixes (mostly done tonight) so the template we fork is clean.

## 1. News Depot — FIRST (owner: "we need all 3. News depot first.")
The single content-creation engine that feeds **every** app. Build once, every
product gets richer.
- **What it is:** one depot that generates grounded editorial (previews, recaps,
  round-ups, features, metric spotlights) from any deployment's data, and
  exposes it to all consumers (podiumMetrics deployments, F1 Wrapped, socials,
  blogs). Separate from live-game following (one News-creation depot feeds both,
  per the module plan).
- **Why first:** WC26 already has the pieces scattered (stories route,
  news/generate, storyRefresh, the archive + export API). The depot is the
  clean extraction of those into a standalone, sport-agnostic, feature-flagged
  module with: deterministic archive ids, the export API (md/json), and a
  publish pipeline into studio0x-content. Every future deployment consumes it
  instead of reimplementing.
- **Grounding is non-negotiable:** the CONTENT TRUTH hard rule travels with the
  depot — invent-bans in every prompt, no fabricated specifics, opinions framed
  as opinion.
- **First deliverable:** `modules/news/` — the depot API + generator + archive +
  export, with WC26 as its first consumer (re-point the existing surfaces at it).

## 2. F1 Wrapped — ASAP (owner: "✅✅✅!!")
The forcing function for the extraction (see extraction-plan Phase 4 + "How F1
proves it"). Data via Jolpica/OpenF1 (already synced in podiumSchedule). New
competition shape (race weekend), entity model (drivers + constructors), and a
reimagined proprietary metric set. Consumes the News Depot for its editorial.

## 3. WWC27 — Women's World Cup 2027
Same sport (soccer/api-football), new instance. Proves multi-**instance** of one
sport on the clean core: a second `sportConfig` (different league/season/dates),
the same feed adapter, the same metrics. Should be near-trivial once Phase 1
(constants→config) is done — the truest test that "re-skin per tournament"
works. Consumes the News Depot.

## 4. Leagues Cup 2026 — NEW (owner: "Let's do Leagues Cup 2026!!")
MLS × Liga MX summer tournament. Soccer/api-football (different league id), a
group-then-knockout shape similar to WC but smaller — another `sportConfig`
instance validating the adapter across tournament *formats*, not just
tournament *editions*. North-American audience overlaps the WC26/US market.
Consumes the News Depot. (Confirm api-football's league id + season coverage
for Leagues Cup 2026 during scoping — note: it runs on the standard plan or may
need a coverage check, same diligence as the TheSportsDB key question.)

## Build order (owner-approved intent)
1. Core extraction Phase 1–2 + WC26 hardening finish.
2. **News Depot** (`modules/news/`), WC26 as first consumer.
3. **F1 Wrapped** on the extracted core (proves the sport-adapter).
4. **WWC27** + **Leagues Cup 2026** as `sportConfig` instances (prove
   multi-instance + multi-format), each consuming the News Depot.

Everything above is a MODULE or a CONFIG on the shared core — never a fork.
That's the whole thesis: build the engine once, deploy it everywhere.

## Open scoping questions (for tomorrow)
- F1: Jolpica vs OpenF1 as primary — which is more complete/reliable for 2026?
  (podiumSchedule already uses Jolpica.)
- Leagues Cup 2026: confirm api-football league id + coverage on our plan.
- News Depot: does it live in `worldcup/frontend` extracted, in
  `studio0x-content`, or a new top-level `news-depot/` tenant? (Module plan
  implies a shared depot feeding multiple apps → likely its own deployable.)
- Personas: does F1 reuse the Roundtable cast (as F1 pundits) or get its own?
