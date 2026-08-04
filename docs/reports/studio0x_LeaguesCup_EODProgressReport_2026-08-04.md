# studio0x · LeaguesCup · EOD Progress Report · 2026-08-04

## 1. TL;DR
Leagues Cup 2026 kicks off **tonight** (Columbus Crew v Atlas, Aug 4 23:45 UTC / 7:45 PM ET). The full podiumMetrics engine is **code-complete for Leagues Cup on draft PR #192** (Stages 1–3): sport-agnostic config, the `MatchMoment` event bus, the api-football vendor adapter, Border Clash Index™, and `fixtureSync` now config-driven — all `tsc`-clean and behavior-preserving for WC26. Coverage is **confirmed real**: 54 fixtures on api-football league 772 / season 2026 (verified via the live probe). Remaining work to be *live* is the **isolated deployment** (new Neon DB + Vercel project building the branch + `leaguescup.studio0x.io` DNS + seed) — those are owner-side manual steps, given as a runbook; CC has no confirmation they're done yet. Strategy locked: each tournament is its own isolated experience (own DB, own branding, own subdomain); WC26 stays untouched.

Overall status: 🟡 **Yellow** — engine ready and coverage confirmed, but **not yet deployed/verified live**, and full WC-feature parity is **not** achievable by kickoff (core experience yes; several WC-specific surfaces need reshape/rename — planned as on-the-fly updates through the group stage).

## 2. ✅ Shipped / done today (code committed + verified)
| Item | Status | Notes |
|---|---|---|
| Coverage confirmed | Done | Live probe returned **54 real fixtures**, league 772 / season 2026, verdict "REAL DATA present"; nearest = Columbus Crew v Atlas (NS). No sim-fill. |
| Stage 3 §1 — league 772 wired | Done (PR #192) | `LEAGUES_CUP` leagueId 772 (V3; **not** the V2 legacy 8157), `isConfigured(LEAGUES_CUP)`→true — executed. |
| Stage 3 §2 — `fixtureSync` config-driven | Done (PR #192) | AF_LEAGUE/AF_SEASON now import from `sportConfig`; sync ingests the deployment's tournament (worldcup 1/2026 unchanged; leaguescup 772/2026). |
| Match DNA via the bus | Verified | Executed: events→moments→`GoalEvent[]` is **byte-identical** to the direct path. Sim moments score 0. |
| Temp coverage probe removed | Done (PR #192) | `/api/lc-probe` + `/api/admin/resolve-league` deleted after coverage read. |
| Branch hygiene | Done | Rebased on `main` (0 behind, 15 ahead); WC26 untouched; `build-check` green on prior commits. |
| Copy/metric rename candidate list | Done | Compiled from a codebase scan (see PR / chat) — to land as ONE rename pass. |

## 3. 🟡 In flight
| Item | Owner | State |
|---|---|---|
| Leaguescup deployment (Neon + Vercel-from-branch + DNS) | BK (runbook provided) | Manual steps issued; **not confirmed complete** from CC's side. |
| Seed + live verify (sync 772 → new DB; `/api/live`, Match DNA, Border Clash) | CC | Blocked until the deploy URL exists. |
| Rename PR (copy/metrics → config-driven / LC copy) | CC | Candidates compiled; staging for one-move approval. |
| Bracket/standings reshape → LC league-phase→knockout flow | CC | Planned; needs LC's real round structure from the feed. |
| Travel: team + support-staff, extrapolated fan travel (auto-hide if it reads fabricated) | CC | Planned per owner direction. |

## 4. ⛔ Blocked / needs input
| Item | Blocking | Needed |
|---|---|---|
| Go-live | Deployment infra is owner-only | **BK:** ① kill WC26 api-football calls, ② create Neon DB (direct string), ③ new Vercel project on the branch + env, ④ DNS `leaguescup.studio0x.io`. Then paste CC the URL. |
| Club anthems | Assets not in the manifest | **BK:** Suno club tracks + Drive ids (said "tomorrow morning" — status unverified). |
| WC26 quota drain | Shared api-football key | **BK:** disable WC26 crons or pull its `API_FOOTBALL_KEY` (protects LC's daily quota). |

## 5. 🚩 Risk flags
1. **Not deployed/verified live with ~6h to kickoff.** The engine is ready, but "live" depends on BK's Neon/Vercel/DNS steps + CC's seed. If those slip, we miss first whistle. Highest risk.
2. **Full feature parity is NOT flawless day-1** (stated honestly to owner). Core live experience works against 772 (schedule, scores, Match DNA/Goal Gravity/boards, Roundtable, news, commentary, Border Clash). WC-specific surfaces (anthems, standings/bracket shape, travel-pulse, WC copy/metric names) need reshape/rename — planned as on-the-fly updates during the group stage (Aug 4–13), same as WC.
3. **Shared api-football quota.** Until WC26's crons/key are killed, both deployments draw the same 7,500/day. Must be done before kickoff.
4. **Merge-to-main deliberately deferred** to keep WC26 isolated (no `MatchMoment` db-push to WC26 Neon). Leaguescup deploys from the branch. Housekeeping merge is a separate later step.
5. **Data isolation depends on separate Neon DBs.** Leaguescup must use its OWN new DB — if it were ever pointed at WC26's `DATABASE_URL`, that's cross-contamination. The runbook is explicit; worth a double-check when setting env.

## 6. 📋 Tomorrow's punch list (priority-ordered)
1. **BK:** Run the deploy runbook — kill WC26 calls → Neon (direct string) → Vercel project on `claude/world-cup-stats-mvp-32spgw` + env → DNS. Paste CC the leaguescup URL.
2. **CC:** Seed 772 into the new DB, then verify `/api/live` + Match DNA + Border Clash on a real fixture. Green-light for kickoff.
3. **BK:** Add Suno **club anthems** to the manifest (Drive ids).
4. **CC:** Land the **rename PR** (copy/metrics) once BK approves the candidate list.
5. **CC:** Reshape **bracket/standings** to LC's league-phase→knockout; **travel** (team+staff, extrapolated fan, auto-hide).
6. **CC/BK:** On-the-fly updates through the group stage (Aug 4–13), each WC-specific surface addressed individually.

---
*Owners: BK (Robert Kelley Jr.), CC (Claude Code), Daiana, chat-Claude. Unverified items marked; nothing listed as Shipped without a run/verify.*
